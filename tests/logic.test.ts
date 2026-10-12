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

  it('écarte une recette au four sans four, sans inventer d’autre cuisson', () => {
    const a = adaptRecipe(recipe('saumon-four-legumes'), profile({ equipment: ['stovetop', 'airfryer', 'microwave'] }), []);
    expect(a.equipment[0]).toMatchObject({ missing: 'oven', alternative: undefined });
    expect(a.status).toBe('incompatible');
    expect(a.issues).toContain('Nécessite : Four');
  });

  it('garde la cuisson de remplacement que la recette prévoit elle-même', async () => {
    const { detectEquipment } = await import('../src/lib/equipment');
    const croque = detectEquipment('Beurrez les tranches de pain. Enfournez 10 min à 200°C.\nVous pouvez aussi les faire cuire à la poêle, 3 min de chaque côté.');
    expect(croque.equipment).toContain('oven');
    expect(croque.alternatives.oven?.[0]).toMatchObject({ with: 'stovetop', tip: 'Vous pouvez aussi les faire cuire à la poêle, 3 min de chaque côté.' });
    expect(detectEquipment('Cuire au four ou à la poêle 10 minutes.').alternatives.oven?.[0].with).toBe('stovetop');
    expect(detectEquipment('Leve ao forno ou à air fryer durante 15 minutos.').alternatives.oven?.[0].with).toBe('airfryer');
    // Deux cuissons qui se suivent : pas une alternative.
    expect(detectEquipment('Faites revenir les oignons à la poêle. Enfournez 30 min.').alternatives).toEqual({});
    const r = { ...recipe('saumon-four-legumes'), equipmentAlt: croque.alternatives };
    const a = adaptRecipe(r, profile({ equipment: ['stovetop'] }), []);
    expect(a.status).not.toBe('incompatible');
    expect(a.equipment[0].tip).toContain('D’après la recette'.replace('’', "'"));
  });

  it('repère le four dans les recettes récoltées', async () => {
    const { detectEquipment: detect } = await import('../src/lib/equipment');
    const detectEquipment = (t: string) => detect(t).equipment;
    const { fromHarvestedRecipe, guessEquipment } = await import('../src/lib/importer');
    expect(detectEquipment('Préchauffez le four à 180°C. Enfournez 10 min.')).toContain('oven');
    expect(detectEquipment('Pré-aqueça o forno a 200 ºC')).toContain('oven');
    expect(detectEquipment('Mélangez avec une fourchette, faites revenir à la poêle')).toEqual(['stovetop']);
    expect(guessEquipment('Écrasez à la fourchette')).toEqual([]);
    const base = { recipeIngredient: ['200 g de chocolat noir', '3 oeufs', '100 g de beurre', '50 g de sucre'], url: 'https://www.marmiton.org/recettes/recette_x.aspx', source: 'Marmiton' };
    // Information du serveur, sinon le type de plat.
    expect(fromHarvestedRecipe({ ...base, name: 'Mousse au chocolat', equipment: ['oven'] })?.equipment).toEqual(['oven']);
    expect(fromHarvestedRecipe({ ...base, name: 'Coulants au chocolat, coeur pistache' })?.equipment).toContain('oven');
    expect(fromHarvestedRecipe({ ...base, name: 'Mousse au chocolat' })?.equipment).toEqual([]);
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
      const products = url.includes('countries_tags=en') ? [] : [{ code: '1', product_name: 'Artichauts' }, { code: '2', product_name: 'Coeurs' }];
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

  it('produit exact : code-barres, contenu et valeurs nutritionnelles du paquet', async () => {
    const { customByBarcode, makeCustomProduct } = await import('../src/lib/custom');
    const { setCustomIngredients } = await import('../src/data/ingredients');
    const { estimatedProvider } = await import('../src/lib/pricing');
    const yaourt = makeCustomProduct({ name: 'Iogurte grego Milbona', aisle: 'divers', unit: 'pc', familyId: 'herbes-provence', barcode: '5601312000017', packQty: 500, nutrition: { kcal: 97, protein: 9, carbs: 4, fat: 5 } });
    expect(yaourt).toMatchObject({ kcal: 97, protein: 9, partial: false, barcode: '5601312000017', packQty: 500, family: 'herbes-provence' });
    const nu = makeCustomProduct({ name: 'Bolachas', aisle: 'epicerie', unit: 'g', nutrition: { kcal: 480, protein: 6, carbs: 70, fat: 20 } });
    expect(nu.partial).toBe(false);
    // Sans prix de référence : pas d'estimation à 0 €.
    expect(estimatedProvider.pricePerKg(nu.id, null, 'PT')).toBeNull();
    setCustomIngredients([yaourt, nu]);
    expect(customByBarcode('5601312 000017')?.id).toBe(yaourt.id);
    expect(customByBarcode('123')).toBeUndefined();
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
      for (let i = 0; i < 25 && !log.includes('prix enregistrés'); i++) log.push(await runScraper(env, now));
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

  it('mélange les enseignes dans un passage et publie un relevé inachevé en fin de semaine', async () => {
    const { runScraper } = await import('../worker/scraper.js');
    const store = new Map<string, string>();
    const kv = { get: async (k: string, t?: string) => (store.has(k) ? (t === 'json' ? JSON.parse(store.get(k)!) : store.get(k)) : null), put: async (k: string, v: string) => void store.set(k, v), delete: async (k: string) => void store.delete(k) };
    const q = (chain: string, n: number) => Array.from({ length: n }, (_, i) => ({ chain, id: 'riz', url: `https://x/${chain}/${i}` }));
    store.set('scrape:tracked', JSON.stringify({ at: Date.parse('2026-10-10T00:00:00Z'), chains: {} }));
    store.set('scrape:state', JSON.stringify({ week: '2026-W42', phase: 'prices', queue: [...q('pt-continente', 5), ...q('pt-auchan', 5)], results: { 'pt-auchan': { riz: [1.5, 1.7] } }, log: [] }));
    const orig = globalThis.fetch;
    const seen: string[] = [];
    globalThis.fetch = (async (url: string) => (seen.push(url), new Response('<div class="ct-pdp--prices">1,20&euro;/kg</div>'))) as typeof fetch;
    try {
      const env = { PRICES: kv };
      await runScraper(env, new Date('2026-10-14T08:00:00Z'));
      expect(seen.filter((u) => u.includes('continente'))).toHaveLength(2);
      expect(seen.filter((u) => u.includes('auchan'))).toHaveLength(4);
      // Semaine suivante : le relevé inachevé est publié, pas perdu.
      expect(store.has('chain-prices:PT')).toBe(false);
      await runScraper(env, new Date('2026-10-19T08:00:00Z'));
      const pub = JSON.parse(store.get('chain-prices:PT')!);
      expect(pub.week).toBe('2026-W42');
      expect(pub.chains['pt-continente'].riz.perKg).toBe(1.2);
      expect(pub.chains['pt-auchan'].riz.n).toBe(6);
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

describe('lecture des sitemaps par flux', () => {
  it('ne garde que la tranche demandée et s’arrête dès qu’elle est complète', async () => {
    const { streamLocs } = await import('../worker/scraper.js');
    const xml = '<urlset>' + Array.from({ length: 10 }, (_, i) => `<url><loc>https://x/p-${i}.html</loc><image:image><image:loc>https://img/${i}.jpg</image:loc></image:image></url>`).join('') + '</urlset>';
    // Découpé en petits morceaux pour couper des balises entre deux lectures.
    const body = () => new ReadableStream({ start(c) { const enc = new TextEncoder(); for (let i = 0; i < xml.length; i += 17) c.enqueue(enc.encode(xml.slice(i, i + 17))); c.close(); } });
    expect(await streamLocs(body(), 0, 3)).toEqual({ urls: ['https://x/p-0.html', 'https://x/p-1.html', 'https://x/p-2.html'], more: true });
    expect(await streamLocs(body(), 8, 3)).toEqual({ urls: ['https://x/p-8.html', 'https://x/p-9.html'], more: false });
  });
});

describe('historique des prix en ligne', () => {
  it('ajoute chaque semaine un point par enseigne et ingrédient, sans les prix reconduits', async () => {
    const { appendHistory } = await import('../worker/scraper.js');
    let h = appendHistory({ series: {} }, '2026-W41', { 'pt-continente': { riz: { perKg: 1.2, n: 3, min: 1 }, lait: { perKg: 0.85, n: 2, min: 0.8, stale: true } } });
    h = appendHistory(h, '2026-W42', { 'pt-continente': { riz: { perKg: 1.25, n: 3, min: 1 } } });
    h = appendHistory(h, '2026-W42', { 'pt-continente': { riz: { perKg: 1.3, n: 3, min: 1 } } });
    expect(h.series['pt-continente'].riz).toEqual([['2026-W41', 1.2], ['2026-W42', 1.3]]);
    expect(h.series['pt-continente'].lait).toBeUndefined();
  });
});

describe('semaines ISO', () => {
  it('donne le lundi de la semaine', async () => {
    const { weekStart } = await import('../src/lib/chainprices');
    expect(new Date(weekStart('2026-W41')).toISOString().slice(0, 10)).toBe('2026-10-05');
    expect(new Date(weekStart('2027-W01')).toISOString().slice(0, 10)).toBe('2027-01-04');
  });
});

describe('récolte de recettes', () => {
  const ld = (name: string, ingredients: string[]) => `<html><script type="application/ld+json">${JSON.stringify({ '@type': 'Recipe', name, recipeIngredient: ingredients, recipeInstructions: [{ text: 'a' }, { text: 'b' }], totalTime: 'PT30M', recipeYield: '4', image: ['https://img/x.jpg'] })}</script></html>`;

  it('garde les faits de la recette mais pas le texte des étapes', async () => {
    const { compactRecipe } = await import('../worker/recipes.js');
    const c = compactRecipe({ name: 'Keftas de bœuf, sauce yaourt : la meilleure recette', recipeIngredient: ['500 g de bœuf haché', '1 oignon', '1 yaourt'], recipeInstructions: [{ text: 'Mélanger' }, { text: 'Cuire' }], recipeYield: ['2'], image: { url: 'https://img/k.jpg' } }, 'https://m/r.aspx', 'Marmiton');
    expect(c).toMatchObject({ name: 'Keftas de bœuf, sauce yaourt', stepCount: 2, recipeYield: '2', image: 'https://img/k.jpg', source: 'Marmiton' });
    expect(JSON.stringify(c)).not.toContain('Mélanger');
    expect(compactRecipe({ name: 'X', recipeIngredient: ['a'] }, 'u', 's')).toBeNull();
  });

  it('collecte des adresses dans les sitemaps puis lit les recettes, par petits passages', async () => {
    const { runRecipes, recipesJson, SOURCES } = await import('../worker/recipes.js');
    const store = new Map<string, string>();
    const kv = { get: async (k: string, t?: string) => (store.has(k) ? (t === 'json' ? JSON.parse(store.get(k)!) : store.get(k)) : null), put: async (k: string, v: string) => void store.set(k, v), delete: async (k: string) => void store.delete(k) };
    const tele = SOURCES[0].sitemaps![0];
    const pages: Record<string, string> = {
      [tele]: '<urlset><url><loc>https://teleculinaria.pt/receitas/bife-a-portuguesa-2/</loc></url><url><loc>https://teleculinaria.pt/blog/x/</loc></url><url><loc>https://teleculinaria.pt/receitas/arroz-de-pato/</loc></url></urlset>',
      'https://www.marmiton.org/wsitemap_recipes_index.xml': '<sitemapindex><sitemap><loc>https://www.marmiton.org/wsitemap_recipes_1.xml</loc></sitemap></sitemapindex>',
      'https://www.marmiton.org/wsitemap_recipes_1.xml': '<urlset><url><loc>https://www.marmiton.org/recettes/recette_keftas_1.aspx</loc></url></urlset>',
      'https://teleculinaria.pt/receitas/bife-a-portuguesa-2/': ld('Bife à portuguesa', ['4 bifes de vaca', '2 dentes de alho', '1 ovo']),
      'https://teleculinaria.pt/receitas/arroz-de-pato/': ld('Arroz de pato', ['1 pato']),
      'https://www.marmiton.org/recettes/recette_keftas_1.aspx': ld('Keftas', ['500 g de bœuf haché', '1 oignon', '1 yaourt']),
    };
    const orig = globalThis.fetch;
    globalThis.fetch = (async (url: string) => {
      const body = pages[url];
      if (body == null) return new Response('<urlset></urlset>');
      return new Response(new TextEncoder().encode(body));
    }) as typeof fetch;
    try {
      const env = { PRICES: kv };
      const now = new Date('2026-10-12T08:00:00Z');
      const log: string[] = [];
      for (let i = 0; i < 80 && !log.some((l) => l.includes('restantes') && l.endsWith(' 0 restantes')); i++) log.push(await runRecipes(env, new Date(now.getTime() + i * 600000)));
      const all = JSON.parse(await recipesJson(kv));
      expect(all.map((r: { name: string }) => r.name).sort()).toEqual(['Bife à portuguesa', 'Keftas']);
      // Une recette déjà récoltée n'est pas reprise la semaine suivante.
      const index = JSON.parse(store.get('recipes:index')!);
      expect(index.count).toBe(2);
    } finally {
      globalThis.fetch = orig;
    }
  });

  it('convertit une recette récoltée avec un identifiant stable et écarte les recettes mal reconnues', async () => {
    const { fromHarvestedRecipe } = await import('../src/lib/importer');
    const r = { name: 'Riz au poulet', recipeIngredient: ['200 g de riz', '2 blancs de poulet', '1 oignon'], recipeYield: '2', url: 'https://www.marmiton.org/recettes/recette_riz_9.aspx', source: 'Marmiton', stepCount: 4 };
    const a = fromHarvestedRecipe(r)!;
    expect(a).toMatchObject({ steps: [], stepCount: 4, imported: false, source: { name: 'Marmiton' } });
    expect(fromHarvestedRecipe(r)!.id).toBe(a.id);
    expect(fromHarvestedRecipe({ ...r, recipeIngredient: ['1 truc', '2 machins', '1 riz'] })).toBeNull();
  });
});

describe('lecture des sitemaps à partir d’un octet', () => {
  it('reprend où la tranche précédente s’était arrêtée, sans rien perdre', async () => {
    const { streamLocsFrom } = await import('../worker/scraper.js');
    const xml = '<urlset>' + Array.from({ length: 50 }, (_, i) => `<url><loc>https://x/p-${i}.html</loc><image:loc>https://img/${i}é.jpg</image:loc></url>`).join('') + '</urlset>';
    const bytes = new TextEncoder().encode(xml);
    const body = () => new ReadableStream({ start(c) { for (let i = 0; i < bytes.length; i += 97) c.enqueue(bytes.slice(i, i + 97)); c.close(); } });
    const seen = new Set<string>();
    let from = 0;
    for (let guard = 0; guard < 100; guard++) {
      const r = await streamLocsFrom(body(), from, 7);
      if (from === 0) expect(r.urls.length).toBeGreaterThanOrEqual(7);
      r.urls.forEach((u: string) => seen.add(u));
      if (!r.more) break;
      expect(r.nextByte).toBeGreaterThan(from);
      from = r.nextByte;
    }
    expect(seen.size).toBe(50);
  });
});

describe('lecture partielle des pages produit', () => {
  it('s’arrête peu après le bloc de prix', async () => {
    const { fetchProductHead, parseProductPage } = await import('../worker/scraper.js');
    const page = '<html>' + 'x'.repeat(50000) + '<div class="ct-pdp--prices"><span>1,19&euro;/kg</span></div>\n' + 'y'.repeat(200000) + '</html>';
    let sent = 0;
    const orig = globalThis.fetch;
    globalThis.fetch = (async () => new Response(new ReadableStream({ pull(c) { if (sent >= page.length) return c.close(); c.enqueue(new TextEncoder().encode(page.slice(sent, sent + 8192))); sent += 8192; } }))) as typeof fetch;
    try {
      const html = await fetchProductHead('https://www.continente.pt/produto/banana-continente-1.html');
      expect(html.length).toBeLessThan(80000);
      expect(parseProductPage(html, 'https://www.continente.pt/produto/banana-continente-1.html')).toEqual({ perKg: 1.19 });
    } finally {
      globalThis.fetch = orig;
    }
  });

  it('garde le prix des données structurées quand la page n’a pas de bloc de prix', async () => {
    const { fetchProductHead, parseProductPage } = await import('../worker/scraper.js');
    const page = '<html>' + 'x'.repeat(30000) + '<script>{"offers": {"@type":"Offer","price":"2.38"}}</script>' + 'y'.repeat(100000) + '</html>';
    const orig = globalThis.fetch;
    let sent = 0;
    globalThis.fetch = (async () => new Response(new ReadableStream({ pull(c) { if (sent >= page.length) return c.close(); c.enqueue(new TextEncoder().encode(page.slice(sent, sent + 8192))); sent += 8192; } }))) as typeof fetch;
    try {
      const url = 'https://www.pingodoce.pt/produtos/arroz-carolino-1kg-1.html';
      const html = await fetchProductHead(url);
      expect(html.length).toBeLessThan(1000);
      expect(parseProductPage(html, url)).toEqual({ perKg: 2.38 });
    } finally {
      globalThis.fetch = orig;
    }
  });
});

describe('frigo : placard, péremption et cuisine', () => {
  it('épices et huiles : on en a ou pas, sans quantité', async () => {
    const { addToFridge, presenceOnly } = await import('../src/lib/pantry');
    expect(presenceOnly(getIngredient('cumin'))).toBe(true);
    expect(presenceOnly(getIngredient('huile-olive'))).toBe(true);
    expect(presenceOnly(getIngredient('poulet'))).toBe(false);
    let f = addToFridge([], getIngredient('cumin'), 'cumin', 40);
    f = addToFridge(f, getIngredient('cumin'), 'cumin', 40);
    expect(f).toMatchObject([{ ingredientId: 'cumin', qty: 1 }]);
  });

  it('dates de péremption et recettes anti-gaspi', async () => {
    const { daysLeft, expiryLabel, isSoon, dateIn } = await import('../src/lib/pantry');
    const now = new Date(2026, 9, 12);
    expect(daysLeft({ expiresOn: '2026-10-14' }, now)).toBe(2);
    expect(expiryLabel({ expiresOn: '2026-10-11' }, now)).toBe('périmé depuis 1 j');
    expect(isSoon({ expiresOn: '2026-10-20' }, now)).toBe(false);
    expect(dateIn(3, now)).toBe('2026-10-15');
    const { adaptRecipe, scoreRecipe } = await import('../src/lib/adapt');
    const r = SEED_RECIPES.find((x) => x.ingredients.some((i) => i.ingredientId === 'courgette'))!;
    const p = { ...DEFAULT_PROFILE, equipment: ['stovetop', 'oven'] as Profile['equipment'] };
    const fresh = adaptRecipe(r, p, [{ ingredientId: 'courgette', qty: 500, addedAt: 0, expiresOn: dateIn(30) }]);
    const soon = adaptRecipe(r, p, [{ ingredientId: 'courgette', qty: 500, addedAt: 0, expiresOn: dateIn(1) }]);
    expect(fresh.expiring).toEqual([]);
    expect(soon.expiring).toEqual(['Courgette']);
    expect(scoreRecipe(soon, p).score).toBeGreaterThan(scoreRecipe(fresh, p).score);
  });

  it('minuteurs lus dans les étapes', async () => {
    const { stepDurations } = await import('../src/screens/CookMode');
    expect(stepDurations('Enfourner 8 à 10 min jusqu’à ce que ce soit doré.')).toEqual([10]);
    expect(stepDurations('Laisser mijoter 1 h 30 puis reposer 15 minutes')).toEqual([90, 15]);
    expect(stepDurations('Cozinhe durante 20 minutos.')).toEqual([20]);
    expect(stepDurations('Couper en 4 morceaux.')).toEqual([]);
  });
});

describe('ingrédients ajoutés', () => {
  it('reconnaît le safran, les épices et les mots portugais courants', () => {
    const id = (l: string) => parseIngredientLine(l).ingredientId;
    expect(id('1 dose de safran')).toBe('safran');
    expect(id('1 colher (chá) açafrão em pó')).toBe('safran');
    expect(id('1 bouquet garni')).toBe('bouquet-garni');
    expect(id('3 gemas')).toBe('oeuf');
    expect(id('150 g fiambre em fatias')).toBe('jambon');
    expect(id('1 raminho de hortelã')).toBe('menthe');
    expect(id('2 feuilles de gélatine')).toBe('gelatine');
    expect(id('1 pincée de noix de muscade')).toBe('muscade');
  });
});

describe('ingrédients en double', () => {
  it('réunit un ingrédient cité plusieurs fois', async () => {
    const { mergeDuplicates } = await import('../src/lib/importer');
    const m = mergeDuplicates(["huile d'olive", "1 c. à soupe d'huile d'olive", 'poivre', 'poivre', '2 c. à soupe de sauce soja', '1 c. à soupe de sauce soja', '100 g de beurre', '20 cl de crème'].map(parseIngredientLine));
    expect(m.filter((l) => l.ingredientId === 'huile-olive')).toHaveLength(1);
    expect(m.find((l) => l.ingredientId === 'huile-olive')).toMatchObject({ qty: 1, unit: 'cas' });
    expect(m.filter((l) => l.ingredientId === 'poivre')).toHaveLength(1);
    expect(m.find((l) => l.ingredientId === 'sauce-soja')).toMatchObject({ qty: 3, unit: 'cas' });
    expect(m).toHaveLength(5);
  });
});

describe('variantes d’un aliment', () => {
  it('reconnaît « parmesan râpé » comme du parmesan, au frigo et dans les recettes', async () => {
    const { baseIdForName, sameFood } = await import('../src/lib/canonical');
    const { makeCustomProduct } = await import('../src/lib/custom');
    const { setCustomIngredients } = await import('../src/data/ingredients');
    const { adaptRecipe } = await import('../src/lib/adapt');
    expect(baseIdForName('Parmesan râpé')).toBe('parmesan');
    expect(baseIdForName('Lait demi-écrémé pasteurisé')).toBe('lait');
    expect(baseIdForName('Beurre de cacahuète')).not.toBe('beurre');
    expect(sameFood('lex:grated-emmental-cheese', 'emmental')).toBe(true);
    // Produit créé sans famille, à partir de son nom.
    const mine = { ...makeCustomProduct({ name: 'Parmesan râpé', aisle: 'cremerie', unit: 'g' }) };
    setCustomIngredients([mine]);
    expect(sameFood(mine.id, 'parmesan')).toBe(true);
    const r = SEED_RECIPES.find((x) => x.ingredients.some((i) => i.ingredientId === 'parmesan'))!;
    const a = adaptRecipe(r, { ...DEFAULT_PROFILE, equipment: ['stovetop', 'oven'] }, [{ ingredientId: mine.id, qty: 200, addedAt: 0 }]);
    expect(a.lines.find((l) => l.ingredient?.id === 'parmesan')?.fridge).toBe('full');
    setCustomIngredients([]);
  });
});

describe('regroupement des produits', () => {
  it('range les morceaux sous l’aliment, pas les produits transformés', async () => {
    const { baseIdForName, grouped } = await import('../src/lib/canonical');
    expect(baseIdForName('Aiguillettes de poulet')).toBe('poulet');
    expect(baseIdForName('Peito de frango')).toBe('poulet');
    expect(baseIdForName('Pavé de cabillaud')).toBe('cabillaud');
    expect(baseIdForName('Saumon fumé')).toBeUndefined();
    expect(baseIdForName('Saumon atlantique fumé')).toBeUndefined();
    expect(baseIdForName('Poulet rôti')).toBeUndefined();
    expect(grouped('poulet')).toBe('poulet');
    expect(parseIngredientLine('2 filets de poulet fermier').ingredientId).toBe('poulet');
  });
});

describe('grandes familles et emplacements', () => {
  it('rattache un produit à sa famille d’après son nom et range au bon endroit', async () => {
    const { makeCustomProduct } = await import('../src/lib/custom');
    const { locationOf } = await import('../src/lib/pantry');
    const { baseIdForName } = await import('../src/lib/canonical');
    expect(makeCustomProduct({ name: 'Ovos de galinhas criadas ao ar livre', aisle: 'divers', unit: 'pc' }).family).toBe('oeuf');
    expect(makeCustomProduct({ name: 'Leite meio gordo Mimosa', aisle: 'divers', unit: 'ml' }).family).toBe('lait');
    expect(makeCustomProduct({ name: 'Mon mélange maison', aisle: 'epices', unit: 'g', autoFamily: false }).family).toBeUndefined();
    expect(baseIdForName('Beurre de cacahuète')).not.toBe('beurre');
    expect(locationOf({ ingredientId: 'riz', qty: 1, addedAt: 0 }, getIngredient('riz'))).toBe('placard');
    expect(locationOf({ ingredientId: 'lait', qty: 1, addedAt: 0 }, getIngredient('lait'))).toBe('frigo');
    expect(locationOf({ ingredientId: 'lait', qty: 1, addedAt: 0, location: 'congel' }, getIngredient('lait'))).toBe('congel');
  });
});

describe('pages produit des enseignes', () => {
  it('garde le nom et la page des produits relevés', async () => {
    const { productName } = await import('../worker/scraper.js');
    expect(productName('https://www.continente.pt/produto/bifes-de-peru-continente-4460224.html')).toBe('Bifes de peru continente');
    expect(productName('https://www.auchan.pt/pt/alimentacao/arroz-agulha-cigala-1kg/40299.html')).toBe('Arroz agulha cigala 1kg');
  });
});
