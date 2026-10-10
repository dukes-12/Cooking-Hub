import { beforeAll, describe, expect, it } from 'vitest';
import { SEED_RECIPES } from '../src/data/recipes';
import { adaptRecipe } from '../src/lib/adapt';
import { fromSchemaRecipe, parseIngredientLine, parseISODuration } from '../src/lib/importer';
import { getIngredient } from '../src/data/ingredients';
import { pricePerKg, priceSource, quoteBasket, setObservedPrices } from '../src/lib/pricing';
import { draftFromApi, fridgeQuantity, linePricePerKg, lineQuantity, observationsFromReceipts, sizeFromLabel } from '../src/lib/receipts';
import { buildShoppingList } from '../src/lib/shopping';
import { DEFAULT_PROFILE } from '../src/state';
import type { ChosenStore, Profile, Receipt, ReceiptLine } from '../src/types';
// @ts-expect-error module JS du serveur
import { extractRecipe, geocodeGoogle, offCategory, offProduct, openPrices, publicConfig, receiptFromPhotos } from '../server/core.mjs';
import { readFileSync } from 'node:fs';
import { attachCategories } from '../scripts/lib/categories';
import { setLexicon } from '../src/lib/lexicon';
import { categoryFor, communityStats, ingredientForCategories, setCommunityPrices } from '../src/lib/openprices';

const recipe = (id: string) => SEED_RECIPES.find((r) => r.id === id)!;
const profile = (p: Partial<Profile> = {}): Profile => ({ ...DEFAULT_PROFILE, ...p });

describe('import', () => {
  it('analyse les lignes d’ingrédients françaises', () => {
    expect(parseIngredientLine('200 g de farine')).toMatchObject({ ingredientId: 'farine', qty: 200, unit: 'g' });
    expect(parseIngredientLine('3 oeufs')).toMatchObject({ ingredientId: 'oeuf', qty: 3, unit: 'pc' });
    expect(parseIngredientLine("1 c. à soupe d'huile d'olive")).toMatchObject({ ingredientId: 'huile-olive', qty: 1, unit: 'cas' });
    expect(parseIngredientLine('½ citron')).toMatchObject({ ingredientId: 'citron', qty: 0.5 });
    expect(parseIngredientLine('20 cl de crème liquide')).toMatchObject({ ingredientId: 'creme', qty: 20, unit: 'cl' });
    expect(parseIngredientLine('2 gousses d’ail')).toMatchObject({ ingredientId: 'ail', qty: 2, unit: 'gousse' });
    expect(parseIngredientLine('1 pincée de sel')).toMatchObject({ ingredientId: 'sel', unit: 'pincee' });
    expect(parseIngredientLine('Un peu de truffe').ingredientId).toBeUndefined();
  });

  it('convertit un schema.org Recipe', () => {
    expect(parseISODuration('PT1H15M')).toBe(75);
    const r = fromSchemaRecipe({
      name: 'Quiche lorraine',
      recipeYield: '6 personnes',
      prepTime: 'PT20M',
      cookTime: 'PT40M',
      recipeIngredient: ['1 pâte brisée', '200 g de lardons', '3 oeufs', '20 cl de crème fraîche'],
      recipeInstructions: [{ '@type': 'HowToStep', text: 'Préchauffer le four à 180°C.' }, { '@type': 'HowToStep', text: 'Mélanger et enfourner.' }],
      nutrition: { calories: '420 kcal' },
    }, 'https://www.example.com/quiche');
    expect(r).toMatchObject({ servings: 6, prepMin: 20, cookMin: 40, sourceKcal: 420 });
    expect(r.equipment).toContain('oven');
    expect(r.ingredients.every((i) => i.ingredientId)).toBe(true);
  });

  it('extrait le JSON-LD d’une page (y compris @graph)', () => {
    const html = `<html><script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebPage"},{"@type":"Recipe","name":"Test"}]}</script></html>`;
    expect(extractRecipe(html)?.name).toBe('Test');
    expect(extractRecipe('<html></html>')).toBeNull();
  });
});

describe('adaptation', () => {
  it('remplace le porc pour un profil halal', () => {
    const a = adaptRecipe(recipe('pates-carbonara'), profile({ diets: ['halal'] }), []);
    const l = a.lines.find((x) => x.swappedFrom?.id === 'lardons')!;
    expect(l.ingredient!.id).toBe('lardons-volaille');
    expect(a.status).toBe('adapted');
  });

  it('rend la bolognaise végétarienne', () => {
    const a = adaptRecipe(recipe('bolognaise'), profile({ diets: ['vegetarian'] }), []);
    expect(a.lines.some((l) => l.swappedFrom?.id === 'boeuf-hache')).toBe(true);
    expect(a.status).not.toBe('incompatible');
  });

  it('bloque une recette sans remplacement possible', () => {
    const a = adaptRecipe(recipe('boeuf-bourguignon'), profile({ diets: ['vegan'] }), []);
    expect(a.status).toBe('incompatible');
  });

  it('propose une alternative au four', () => {
    const a = adaptRecipe(recipe('saumon-four-legumes'), profile({ equipment: ['stovetop', 'airfryer'] }), []);
    expect(a.equipment[0]).toMatchObject({ missing: 'oven', alternative: 'airfryer' });
    expect(a.status).toBe('adapted');
    const none = adaptRecipe(recipe('saumon-four-legumes'), profile({ equipment: [] }), []);
    expect(none.status).toBe('incompatible');
  });

  it('tient compte du frigo et adapte les portions', () => {
    const a = adaptRecipe(recipe('omelette-champignons'), profile({ household: 2 }), [{ ingredientId: 'oeuf', qty: 12, addedAt: 0 }]);
    expect(a.lines.find((l) => l.ingredient?.id === 'oeuf')).toMatchObject({ qty: 6, fridge: 'full' });
    expect(a.fridgeCoverage).toBeGreaterThan(0);
    expect(a.nutrition.kcal).toBeGreaterThan(200);
  });
});

describe('prix et courses', () => {
  it('trouve l’enseigne la moins chère', () => {
    const q = quoteBasket([{ ingredientId: 'pates', grams: 500 }, { ingredientId: 'poulet', grams: 400 }], profile({ stores: [{ chainId: 'fr-lidl', label: 'Lidl' }, { chainId: 'fr-monoprix', label: 'Monoprix' }] }));
    expect(q.best!.chain.id).toBe('fr-lidl');
    expect(q.perChain).toHaveLength(2);
  });

  it('déduit le frigo et le placard de la liste', () => {
    const recipes = Object.fromEntries(SEED_RECIPES.map((r) => [r.id, r]));
    const list = buildShoppingList(
      [{ recipeId: 'pates-carbonara', servings: 2 }, { recipeId: 'bolognaise', servings: 4 }],
      recipes,
      profile(),
      [{ ingredientId: 'oeuf', qty: 6, addedAt: 0 }],
      [],
    );
    const pates = list.find((i) => i.ingredientId === 'pates')!;
    expect(pates.qty).toBe(600);
    expect(pates.fromRecipes).toHaveLength(2);
    expect(list.some((i) => i.ingredientId === 'oeuf')).toBe(false);
    expect(list.some((i) => i.ingredientId === 'sel')).toBe(false);
  });
});

describe('données', () => {
  it('toutes les recettes de démo sont cohérentes', () => {
    for (const r of SEED_RECIPES) {
      const a = adaptRecipe(r, profile({ equipment: ['stovetop', 'oven', 'blender'] }), []);
      expect(a.nutrition.coverage, r.id).toBe(1);
      expect(a.nutrition.kcal, r.id).toBeGreaterThan(100);
      expect(a.nutrition.kcal, r.id).toBeLessThan(1400);
      expect(a.costPerServing!, r.id).toBeLessThan(12);
    }
  });
});

describe('import portugais', () => {
  it('reconnaît les recettes en portugais', () => {
    expect(parseIngredientLine('2 colheres de sopa de azeite')).toMatchObject({ ingredientId: 'huile-olive', qty: 2, unit: 'cas' });
    expect(parseIngredientLine('3 dentes de alho')).toMatchObject({ ingredientId: 'ail', qty: 3, unit: 'gousse' });
    expect(parseIngredientLine('500 g de bacalhau')).toMatchObject({ ingredientId: 'morue', qty: 500, unit: 'g' });
    expect(parseIngredientLine('1 pitada de sal')).toMatchObject({ ingredientId: 'sel', unit: 'pincee' });
  });
});

describe('cuisines', () => {
  it('sépare cuisines proposées et pays des prix', async () => {
    const { matchesCuisines } = await import('../src/data/reference');
    const pt = recipe('caldo-verde');
    const fr = recipe('gratin-dauphinois');
    expect(pt.origin).toBe('PT');
    expect(fr.origin).toBe('FR');
    expect(matchesCuisines(pt, ['FR', 'PT'])).toBe(true);
    expect(matchesCuisines(recipe('bolognaise'), ['FR', 'PT'])).toBe(false);
    expect(matchesCuisines(pt, [])).toBe(true);
    // Recette française chiffrée avec les prix portugais
    const a = adaptRecipe(fr, profile({ country: 'PT', cuisines: ['FR', 'PT'], stores: [{ chainId: 'pt-continente', label: 'Continente' }] }), []);
    expect(a.quote.best!.chain.id).toBe('pt-continente');
  });
});

describe('dictionnaire multilingue', () => {
  it('reconnaît un aliment sous ses noms français, portugais et anglais', async () => {
    const { readFileSync } = await import('node:fs');
    const { setLexicon, exactLookup, searchLexicon, ingredientFromEntry } = await import('../src/lib/lexicon');
    setLexicon(JSON.parse(readFileSync(new URL('../public/lexicon.json', import.meta.url), 'utf8')));
    for (const name of ['artichaut', 'alcachofra', 'artichoke', 'Artichauts']) expect(exactLookup(name)?.id, name).toBe('artichoke');
    expect(searchLexicon('alcachof')[0].id).toBe('artichoke');
    const ing = ingredientFromEntry(exactLookup('alcachofra')!);
    expect(ing).toMatchObject({ id: 'lex:artichoke', name: 'Artichaut', partial: true, aisle: 'fruits-legumes' });
    // Un ingrédient qu'on connaît en détail garde sa nutrition.
    expect(ingredientFromEntry(exactLookup('cebola')!).id).toBe('oignon');
    // L'import d'une recette reconnaît l'ingrédient et ne l'invente pas dans le calcul nutritionnel.
    expect(parseIngredientLine('4 artichauts violets')).toMatchObject({ ingredientId: 'lex:artichoke', qty: 4 });
    expect(parseIngredientLine('2 alcachofras')).toMatchObject({ ingredientId: 'lex:artichoke' });
    const r = fromSchemaRecipe({ name: 'Artichauts farcis', recipeYield: '2', recipeIngredient: ['4 artichauts', '2 c. à soupe d\'huile d\'olive'], recipeInstructions: ['Cuire.'] });
    const a = adaptRecipe(r, profile(), []);
    expect(a.nutrition.coverage).toBeLessThan(1);
    expect(a.quote.unknown).toBe(1);
  });
});

describe('magasins Google Places', () => {
  it('interroge Google côté serveur sans exposer la clé et normalise la réponse', async () => {
    // @ts-expect-error module JS du serveur
    const { findStoresGoogle } = await import('../server/core.mjs');
    let seen: { url: string; init: RequestInit } | undefined;
    const fake = async (url: string, init: RequestInit) => {
      seen = { url, init };
      return new Response(JSON.stringify({ places: [{ id: 'p1', displayName: { text: 'Pingo Doce Estrela' }, formattedAddress: 'Rua X, Lisboa', location: { latitude: 38.71, longitude: -9.16 } }] }), { status: 200 });
    };
    const r = await findStoresGoogle({ lat: '38.7', lon: '-9.1', radiusM: '99999' }, 'KEY', fake);
    expect(r.status).toBe(200);
    expect(r.body.stores[0]).toMatchObject({ name: 'Pingo Doce Estrela', lat: 38.71 });
    expect(seen!.url).toContain('places.googleapis.com');
    expect(JSON.parse(seen!.init.body as string).locationRestriction.circle.radius).toBe(5000); // plafonné
    expect((seen!.init.headers as Record<string, string>)['X-Goog-FieldMask']).not.toMatch(/rating|review|opening/);
    expect((await findStoresGoogle({ lat: '38.7', lon: '-9.1' }, undefined, fake)).status).toBe(501);
    expect((await findStoresGoogle({ lat: 'x', lon: '1' }, 'KEY', fake)).status).toBe(400);
  });
});

describe('tickets de caisse', () => {
  const line = (p: Partial<ReceiptLine>): ReceiptLine => ({ id: 'l', label: '', count: 1, size: null, sizeUnit: 'none', weightKg: null, totalPrice: 0, toFridge: true, ...p });

  it('lit la taille du paquet dans le libellé', () => {
    expect(sizeFromLabel('LEITE MG 1L')).toEqual({ size: 1, sizeUnit: 'l' });
    expect(sizeFromLabel('YAOURT NATURE 4X125G')).toEqual({ size: 500, sizeUnit: 'g' });
    expect(sizeFromLabel('FILETE FRANGO 0,5KG')).toEqual({ size: 0.5, sizeUnit: 'kg' });
    expect(sizeFromLabel('BANANA')).toBeNull();
  });

  it('calcule quantité, prix au kilo et quantité à ranger au frigo', () => {
    const poulet = getIngredient('poulet')!;
    const pesee = line({ productId: 'poulet', weightKg: 0.62, totalPrice: 4.96 });
    expect(lineQuantity(pesee, poulet).grams).toBeCloseTo(620);
    expect(linePricePerKg(pesee, poulet)).toBeCloseTo(8);
    expect(fridgeQuantity(pesee, poulet)).toBe(620);
    const lait = getIngredient('lait')!;
    const pack = line({ productId: 'lait', count: 6, size: 1, sizeUnit: 'l', totalPrice: 5.4 });
    expect(fridgeQuantity(pack, lait)).toBe(6000);
    expect(linePricePerKg(pack, lait)).toBeCloseTo(5.4 / 6.18, 2);
  });

  it('les prix relevés priment sur l’estimation pour l’enseigne', () => {
    const estimate = pricePerKg('poulet', 'pt-continente', 'PT');
    const receipt: Receipt = {
      id: 'r1', storeKey: 'st-1', chainId: 'pt-continente', country: 'PT', date: new Date().toISOString().slice(0, 10), total: 4.96, createdAt: 0,
      lines: [line({ productId: 'poulet', weightKg: 0.62, totalPrice: 4.96 }), line({ label: 'SACO', totalPrice: 0.1 })],
    };
    const obs = observationsFromReceipts([receipt]);
    expect(obs).toHaveLength(1);
    setObservedPrices(obs);
    expect(pricePerKg('poulet', 'pt-continente', 'PT')).toBeCloseTo(8);
    expect(priceSource('poulet', 'pt-continente')).toBe('observed');
    expect(pricePerKg('poulet', 'pt-pingodoce', 'PT')).not.toBe(8);
    setObservedPrices([]);
    expect(pricePerKg('poulet', 'pt-continente', 'PT')).toBe(estimate);
  });

  it('rapproche le ticket d’un magasin enregistré ou en prépare un nouveau', () => {
    const lumiar: ChosenStore = { id: 'st-lumiar', chainId: 'pt-continente', label: 'Continente Lumiar' };
    const api = { storeName: 'CONTINENTE', storeAddress: 'Alameda das Linhas de Torres, Lumiar', date: '2026-10-02', total: 5.06, lines: [
      { label: 'FILETE PEITO FRANGO', count: 1, size: null, sizeUnit: 'none' as const, weightKg: 0.62, unitPrice: null, totalPrice: 4.96 },
      { label: 'SACO PLASTICO', count: 1, size: null, sizeUnit: 'none' as const, weightKg: null, unitPrice: null, totalPrice: 0.1 },
    ] };
    const d = draftFromApi(api, [lumiar, { id: 'st-colombo', chainId: 'pt-continente', label: 'Continente Colombo' }], 'PT');
    expect(d.receipt.storeKey).toBe('st-lumiar');
    expect(d.newStore).toBeUndefined();
    expect(d.receipt.date).toBe('2026-10-02');
    expect(d.receipt.lines[1].productId).toBeUndefined();
    expect(d.receipt.lines[1].toFridge).toBe(false);
    const other = draftFromApi({ ...api, storeName: 'Pingo Doce Alvalade', storeAddress: '' }, [lumiar], 'PT');
    expect(other.newStore).toMatchObject({ chainId: 'pt-pingodoce', source: 'receipt' });
    expect(other.receipt.storeKey).toBe(other.newStore!.id);
  });

  it('refuse la lecture de ticket sans clé API', async () => {
    const res = await receiptFromPhotos([{ mediaType: 'image/jpeg', data: 'x' }], undefined);
    expect(res.status).toBe(501);
  });
});

describe('Google Maps (serveur)', () => {
  it('géocode une ville via Places Text Search', async () => {
    expect((await geocodeGoogle({ q: 'Lisboa', country: 'PT' }, undefined)).status).toBe(501);
    let sent: { textQuery: string; regionCode?: string } | undefined;
    const fake = async (_url: string, init: { body: string }) => {
      sent = JSON.parse(init.body);
      return new Response(JSON.stringify({ places: [{ formattedAddress: 'Lisboa, Portugal', location: { latitude: 38.72, longitude: -9.14 } }] }));
    };
    const res = await geocodeGoogle({ q: 'Lisboa', country: 'PT' }, 'k', fake);
    expect(res).toEqual({ status: 200, body: { lat: 38.72, lon: -9.14, label: 'Lisboa, Portugal' } });
    expect(sent).toMatchObject({ textQuery: 'Lisboa', regionCode: 'PT' });
  });

  it('ne publie que la clé navigateur, jamais la clé serveur', () => {
    expect(publicConfig({ GOOGLE_MAPS_API_KEY: 'secret' })).toEqual({ mapsKey: null, mapId: 'DEMO_MAP_ID' });
    expect(publicConfig({ GOOGLE_MAPS_API_KEY: 'secret', GOOGLE_MAPS_BROWSER_KEY: 'pub' }).mapsKey).toBe('pub');
  });
});

describe('Open Food Facts / Open Prices', () => {
  beforeAll(() => setLexicon(JSON.parse(readFileSync(new URL('../public/lexicon.json', import.meta.url), 'utf8'))));

  it('rattache les aliments aux catégories Open Food Facts', () => {
    const taxo = 'en: Chicken breasts\nfr: Blancs de poulet\n\nen: Rices, Rice\nfr: Riz\n';
    const entries = [{ id: 'chicken-breast', en: ['chicken breast'], fr: ['blanc de poulet'] }, { id: 'rice', en: ['rice'], fr: ['riz'] }, { id: 'x', en: ['unobtainium'], fr: [] }] as { id: string; en: string[]; fr: string[]; k?: string }[];
    expect(attachCategories(entries, taxo)).toBe(2);
    expect(entries.map((e) => e.k)).toEqual(['en:chicken-breasts', 'en:rices', undefined]);
    expect(categoryFor('poulet')).toBe('en:chicken-breasts');
    expect(categoryFor('pomme')).toBe('en:apples');
    expect(ingredientForCategories(['en:meats', 'en:poultries', 'en:chicken-breasts'])).toBe('poulet');
  });

  it('interroge Open Prices (catégorie et fiches produit) et calcule le prix au kilo', async () => {
    const urls: string[] = [];
    const uas: string[] = [];
    const fake = async (url: string, init: { headers: Record<string, string> }) => {
      urls.push(url);
      uas.push(init.headers['User-Agent']);
      const loose = url.includes('category_tag=');
      return new Response(JSON.stringify({
        total: 2,
        items: loose
          ? [{ price: '7.99', price_per: 'KILOGRAM', currency: 'EUR', date: '2026-09-01', location: { osm_brand: 'Continente', osm_address_country_code: 'PT', osm_address_city: 'Lisboa' } },
             { price: '9.50', price_per: 'KILOGRAM', currency: 'EUR', date: '2026-09-02', location: { osm_brand: 'Carrefour', osm_address_country_code: 'FR' } }]
          : [{ price: '3.20', price_per: null, currency: 'EUR', date: '2026-09-03', product: { product_quantity: 400, product_quantity_unit: 'g' }, location: { osm_name: 'Pingo Doce', osm_address_country_code: 'PT' } }],
      }));
    };
    const res = await openPrices({ cat: 'en:chicken-breasts', country: 'PT', currency: 'EUR' }, 'CookingHub/1.0 (test)', fake);
    expect(res.status).toBe(200);
    expect(urls).toHaveLength(2);
    expect(urls.some((u) => u.includes('category_tag=en%3Achicken-breasts'))).toBe(true);
    expect(urls.some((u) => u.includes('product__categories_tags__contains=en%3Achicken-breasts'))).toBe(true);
    expect(urls.every((u) => u.includes('currency=EUR') && u.includes('order_by=-date'))).toBe(true);
    expect(uas[0]).toBe('CookingHub/1.0 (test)');
    expect(res.body.items.map((i: { brand: string; perKg: number }) => [i.brand, i.perKg])).toEqual([['Continente', 7.99], ['Pingo Doce', 8]]);
    expect((await openPrices({ cat: 'bad tag' }, 'ua', fake)).status).toBe(400);
  });

  it('lit une fiche Open Food Facts et retombe sur le monde entier si le pays a trop peu de produits', async () => {
    expect((await offProduct('abc', 'ua')).status).toBe(400);
    const one = await offProduct('5601312000000', 'ua', async () => new Response(JSON.stringify({ product: { code: '5601312000000', product_name: 'Leite meio gordo', brands: 'Mimosa', product_quantity: 1000, product_quantity_unit: 'ml', nutriscore_grade: 'b', categories_tags: ['en:milks', 'en:semi-skimmed-milks'], nutriments: { 'energy-kcal_100g': 46 } } })));
    expect(one.body.product).toMatchObject({ name: 'Leite meio gordo', qty: 1000, qtyUnit: 'ml', nutriscore: 'b', kcal: 46 });
    const calls: string[] = [];
    const cat = await offCategory({ cat: 'en:artichokes', country: 'PT' }, 'ua', async (url: string) => {
      calls.push(url);
      const products = url.includes('countries_tags') ? [] : [{ code: '1', product_name: 'Artichauts' }, { code: '2', product_name: 'Coeurs' }];
      return new Response(JSON.stringify({ products }));
    });
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain('countries_tags=en%3Aportugal');
    expect(cat.body.products).toHaveLength(2);
  });

  it('ordre des prix : tickets > Open Prices (enseigne, puis pays) > estimation', () => {
    const estimate = pricePerKg('poulet', 'pt-pingodoce', 'PT')!;
    const item = (brand: string, perKg: number) => ({ perKg, unit: null, currency: 'EUR', date: '2026-09-01', brand, city: '', lat: null, lon: null });
    setCommunityPrices('en:chicken-breasts', 'PT', [item('Continente', 7), item('Continente Bom Dia', 7.4), item('Pingo Doce', 6.5), item('Lidl', 99)]);
    const stats = communityStats('poulet', 'PT')!;
    expect(stats.byChain.find((c) => c.chainId === 'pt-continente')).toMatchObject({ count: 2 });
    expect(pricePerKg('poulet', 'pt-continente', 'PT')).toBeCloseTo(7.2);
    expect(priceSource('poulet', 'pt-continente', 'PT')).toBe('community');
    // Une seule mesure chez Pingo Doce : médiane du pays (la valeur aberrante à 99 € est écartée).
    expect(pricePerKg('poulet', 'pt-pingodoce', 'PT')).toBeCloseTo(7 * 0.98);
    expect(pricePerKg('poulet', 'pt-pingodoce', 'PT')).not.toBeCloseTo(estimate);
    setObservedPrices([{ productId: 'poulet', storeKey: 's', chainId: 'pt-continente', country: 'PT', date: new Date().toISOString().slice(0, 10), pricePerKg: 9, unitPrice: 9, label: '', receiptId: 'r' }]);
    expect(pricePerKg('poulet', 'pt-continente', 'PT')).toBe(9);
    setObservedPrices([]);
    setCommunityPrices('en:chicken-breasts', 'PT', []);
    expect(pricePerKg('poulet', 'pt-pingodoce', 'PT')).toBeCloseTo(estimate);
  });
});

describe('produits personnels', () => {
  it('nettoie les libellés de ticket', async () => {
    const { labelKey, nameFromLabel } = await import('../src/lib/custom');
    expect(labelKey('MISTURA CEBOLA/ALHO CNT FRS 40G')).toBe('mistura cebola alho cnt frs');
    expect(labelKey('Mistura cebola/alho CNT FRS 45 g')).toBe('mistura cebola alho cnt frs');
    expect(nameFromLabel('MISTURA CEBOLA/ALHO CNT FRS 40G')).toBe('Mistura cebola / alho cnt frs');
  });

  it('crée un produit rattaché à une famille et le reconnaît ensuite sur les tickets', async () => {
    const { makeCustomProduct } = await import('../src/lib/custom');
    const { setCustomIngredients } = await import('../src/data/ingredients');
    const { productForLabel } = await import('../src/lib/receipts');
    const { categoryFor } = await import('../src/lib/openprices');
    const herbs = makeCustomProduct({ name: 'Ervas de Provence Margão', aisle: 'divers', unit: 'pc', familyId: 'herbes-provence', label: 'ERVAS DE PROVENCE MARGAO SAQ 25G' });
    expect(herbs).toMatchObject({ custom: true, family: 'herbes-provence', aisle: 'epices', unit: 'g', kcal: 260 });
    expect(herbs.id.startsWith('mine:')).toBe(true);
    const mix = makeCustomProduct({ name: 'Mélange oignon ail', aisle: 'epices', unit: 'g', label: 'MISTURA CEBOLA/ALHO CNT FRS 40G' });
    expect(mix).toMatchObject({ partial: true, aisle: 'epices' });
    expect(mix.family).toBeUndefined();
    setCustomIngredients([herbs, mix]);
    expect(getIngredient(herbs.id)?.name).toBe('Ervas de Provence Margão');
    // Même libellé avec un autre format : reconnu grâce au produit personnel.
    expect(productForLabel('MISTURA CEBOLA/ALHO CNT FRS 45G')).toBe(mix.id);
    // Libellé appris lors d'un ticket validé : prioritaire.
    expect(productForLabel('FILETE PEITO FRANGO KG', { 'filete peito frango': herbs.id })).toBe(herbs.id);
    expect(productForLabel('FILETE PEITO FRANGO KG')).toBe('poulet');
    expect(categoryFor(herbs.id)).toBe(categoryFor('herbes-provence'));
    setCustomIngredients([]);
  });
});

describe('comparatif des magasins', () => {
  it('compare ton panier et chaque produit entre tes magasins à partir des tickets', async () => {
    const { basketFromReceipts, compareBasket, compareProducts, storePrice } = await import('../src/lib/compare');
    const line = (productId: string, weightKg: number, totalPrice: number) => ({ id: productId, label: productId, productId, count: 1, size: null, sizeUnit: 'none' as const, weightKg, totalPrice, toFridge: false });
    const today = new Date().toISOString().slice(0, 10);
    const lumiar = { id: 'st-l', chainId: 'pt-continente', label: 'Continente Lumiar' };
    const alvalade = { id: 'st-a', chainId: 'pt-pingodoce', label: 'Pingo Doce Alvalade' };
    const receipts: Receipt[] = [
      { id: 'r1', storeKey: 'st-l', chainId: 'pt-continente', country: 'PT', date: today, total: null, createdAt: 0, lines: [line('poulet', 0.5, 4), line('carotte', 1, 1.2)] },
      { id: 'r2', storeKey: 'st-a', chainId: 'pt-pingodoce', country: 'PT', date: today, total: null, createdAt: 0, lines: [line('poulet', 0.5, 3.5)] },
    ];
    const obs = observationsFromReceipts(receipts);
    setObservedPrices(obs);
    expect(storePrice('poulet', lumiar, obs)).toEqual({ perKg: 8, origin: 'store' });
    expect(storePrice('carotte', alvalade, obs)?.origin).toBe('estimate');
    const basket = basketFromReceipts(receipts);
    expect(basket.find((b) => b.productId === 'poulet')).toMatchObject({ grams: 500, purchases: 2 });
    const { totals, items } = compareBasket([lumiar, alvalade], basket, obs);
    expect(items).toBe(2);
    expect(totals.find((t) => t.store.id === 'st-l')).toMatchObject({ fromTickets: 2 });
    expect(totals.find((t) => t.store.id === 'st-a')).toMatchObject({ fromTickets: 1 });
    const poulet = compareProducts([lumiar, alvalade], obs).find((p) => p.productId === 'poulet')!;
    expect(poulet.quotes.map((q) => q.store.id)).toEqual(['st-a', 'st-l']);
    expect(Math.round(poulet.spread)).toBe(14);
    setObservedPrices([]);
  });
});

describe('relevé des prix des enseignes portugaises', () => {
  it('reconnaît les pages produit des ingrédients et écarte les produits préparés', async () => {
    const { matchUrl, rankCandidates, sizeFromSlug, slugOf } = await import('../worker/scraper.js');
    expect(matchUrl('https://www.auchan.pt/pt/alimentacao/mercearia/arroz-e-massa/arroz/arroz-agulha-cigala-1kg/40299.html')).toEqual(['riz']);
    expect(matchUrl('https://www.auchan.pt/pt/alimentacao/mercearia/refeicoes/arroz-agulha-cigala-pronto-a-comer-2x125g/3711293.html')).toEqual([]);
    expect(matchUrl('https://www.continente.pt/produto/peito-de-frango-continente-7069674.html')).toEqual(['poulet']);
    expect(matchUrl('https://www.continente.pt/produto/cenoura-continente-2885107.html')).toEqual(['carotte']);
    expect(matchUrl('https://www.pingodoce.pt/home/produtos/mercearia/temperos-e-molhos/sal/sal-fino-pingo-doce-1805.html')).toEqual(['sel']);
    expect(matchUrl('https://www.auchan.pt/pt/beleza/corpo/leite-corporal-meio-gordo/1.html')).toEqual([]);
    expect(matchUrl('https://www.continente.pt/produto/sumo-de-laranja-continente-1.html')).toEqual([]);
    expect(rankCandidates(['https://x/arroz-agulha-cigala-1kg/1.html', 'https://x/arroz-agulha-auchan-1kg/2.html'], 'auchan')[0]).toContain('auchan');
    expect(sizeFromSlug(slugOf('https://x/leite-uht-auchan-meio-gordo-6x1l/3010402.html'))).toBe(6000);
    expect(sizeFromSlug(slugOf('https://x/fortificante-ovomaltine-400g/10.html'))).toBe(400);
    expect(sizeFromSlug(slugOf('https://x/ovos-classe-m-12-un/1.html'))).toEqual({ pieces: 12 });
  });

  it('lit le prix au kilo sur les pages produit des trois enseignes', async () => {
    const { parseProductPage, toPerKg } = await import('../worker/scraper.js');
    const continente = '<div class="ct-pdp--prices d-flex"><div class="prices mb-sm-1"><div class="price js-product-price"><div class="prices-wrapper"><span class="pwc-tile--price-primary"> 1<span class="decimalPrice">,19&euro;/kg</span> </span></div><div class="pwc-tile--price-secondary "> 0,24&euro;/un </div></div></div></div>';
    expect(parseProductPage(continente, 'https://www.continente.pt/produto/banana-continente-2597619.html')).toEqual({ perKg: 1.19 });
    const auchan = '<div class="auc-pdp__units"> <div class="auc-measures"> <span class="auc-measures--price-per-unit">19.47 &euro;/Kg</span> </div> </div>';
    expect(parseProductPage(auchan, 'https://www.auchan.pt/x/fortificante-ovomaltine-400g/10.html')).toEqual({ perKg: 19.47 });
    const pingo = '<div class="col"> <h1 class="product-unit-measure">0.25 Kg | 1,16 €/Kg</h1> </div>';
    expect(parseProductPage(pingo, 'https://www.pingodoce.pt/home/produtos/sal-fino-pingo-doce-1805.html')).toEqual({ perKg: 1.16 });
    const ldOnly = '<script type="application/ld+json">{"@type":"Product","offers":{"@type":"Offer","priceCurrency":"EUR","price":"5.10"}}</script>';
    expect(parseProductPage(ldOnly, 'https://www.auchan.pt/x/leite-uht-auchan-meio-gordo-6x1l/3010402.html')).toEqual({ perKg: 0.85 });
    expect(toPerKg('lait', { perKg: 0.85 })).toBe(0.85);
    expect(toPerKg('oeuf', { perPiece: 0.22 })).toBe(4);
    // Prix aberrant pour l'ingrédient (lot, accessoire…) : écarté.
    expect(toPerKg('riz', { perKg: 58 })).toBeNull();
  });

  it('enchaîne découverte, relevé et synthèse sur plusieurs passages', async () => {
    const { runScraper } = await import('../worker/scraper.js');
    const store = new Map<string, string>();
    const kv = { get: async (k: string, t?: string) => (store.has(k) ? (t === 'json' ? JSON.parse(store.get(k)!) : store.get(k)) : null), put: async (k: string, v: string) => void store.set(k, v), delete: async (k: string) => void store.delete(k) };
    const pages: Record<string, string> = {
      'https://www.continente.pt/sitemap_index.xml': '<sitemapindex><sitemap><loc>https://www.continente.pt/sitemap_1-product.xml</loc></sitemap><sitemap><loc>https://www.continente.pt/sitemap_2-image.xml</loc></sitemap></sitemapindex>',
      'https://www.continente.pt/sitemap_1-product.xml': '<urlset><url><loc>https://www.continente.pt/produto/arroz-agulha-continente-1.html</loc></url><url><loc>https://www.continente.pt/produto/arroz-agulha-cigala-2.html</loc></url><url><loc>https://www.continente.pt/produto/sumo-3.html</loc></url></urlset>',
      'https://www.continente.pt/produto/arroz-agulha-continente-1.html': '<div class="ct-pdp--prices"><span>1,15&euro;/kg</span></div>',
      'https://www.continente.pt/produto/arroz-agulha-cigala-2.html': '<div class="ct-pdp--prices"><span>1,64&euro;/kg</span></div>',
    };
    const fetchMock = async (url: string) => (pages[url] ? new Response(pages[url]) : new Response('', { status: 404 }));
    const orig = globalThis.fetch;
    globalThis.fetch = fetchMock as typeof fetch;
    try {
      const env = { PRICES: kv };
      const now = new Date('2026-10-12T08:00:00Z');
      const log: string[] = [];
      for (let i = 0; i < 12; i++) log.push(await runScraper(env, now));
      expect(log[0]).toContain('discover');
      expect(log).toContain('découverte terminée');
      expect(log).toContain('prix enregistrés');
      const result = JSON.parse(store.get('chain-prices:PT')!);
      expect(result.chains['pt-continente'].riz).toMatchObject({ perKg: 1.4, n: 2, min: 1.15 });
      expect(await runScraper(env, now)).toBe('rien à faire cette semaine');
      // Semaine suivante : pas de nouvelle découverte (moins de 4 semaines), on relève directement les prix.
      expect(await runScraper(env, new Date('2026-10-19T08:00:00Z'))).toContain('prices');
      // Relance forcée : nouvelle découverte même en cours de semaine.
      store.set('scrape:force', '1');
      expect(await runScraper(env, new Date('2026-10-19T09:00:00Z'))).toContain('discover');
      expect(store.has('scrape:force')).toBe(false);
    } finally {
      globalThis.fetch = orig;
    }
  });
});

describe('prix en ligne des enseignes', () => {
  it('le prix en ligne de l’enseigne passe après tes tickets et avant Open Prices et l’estimation', async () => {
    const { setChainPrices } = await import('../src/lib/chainprices');
    setChainPrices('PT', { chains: { 'pt-continente': { riz: { perKg: 1.2, n: 3, min: 1.1 } } } });
    expect(pricePerKg('riz', 'pt-continente', 'PT')).toBe(1.2);
    expect(priceSource('riz', 'pt-continente', 'PT')).toBe('online');
    expect(priceSource('riz', 'pt-pingodoce', 'PT')).toBe('estimate');
    setObservedPrices([{ productId: 'riz', storeKey: 's', chainId: 'pt-continente', country: 'PT', date: new Date().toISOString().slice(0, 10), pricePerKg: 0.99, unitPrice: 0.99, label: '', receiptId: 'r' }]);
    expect(pricePerKg('riz', 'pt-continente', 'PT')).toBe(0.99);
    setObservedPrices([]);
    setChainPrices('PT', { chains: {} });
  });
});
