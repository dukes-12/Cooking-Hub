import { getIngredient, INGREDIENTS } from '../data/ingredients';
import { cuisineFromText } from '../data/reference';
import { findInTextDetailed, ingredientFromEntry } from './lexicon';
import type { Category, Equipment, Recipe, RecipeIngredient, Unit } from '../types';
import { normalize, uid } from './text';

// ---------- Reconnaissance des ingrédients ----------

const EN_ALIASES: Record<string, string> = {
  egg: 'oeuf', eggs: 'oeuf', flour: 'farine', sugar: 'sucre', butter: 'beurre', milk: 'lait', onion: 'oignon',
  onions: 'oignon', garlic: 'ail', salt: 'sel', pepper: 'poivre', 'olive oil': 'huile-olive', oil: 'huile-tournesol',
  chicken: 'poulet', rice: 'riz', pasta: 'pates', spaghetti: 'pates', tomato: 'tomate', tomatoes: 'tomate',
  cream: 'creme', cheese: 'emmental', carrot: 'carotte', carrots: 'carotte', potato: 'pomme-de-terre',
  potatoes: 'pomme-de-terre', lemon: 'citron', 'ground beef': 'boeuf-hache', salmon: 'saumon', bacon: 'lardons',
  chickpeas: 'pois-chiches', 'coconut milk': 'lait-coco', honey: 'miel', chocolate: 'chocolat', 'baking powder': 'levure',
  spinach: 'epinard', mushrooms: 'champignon', zucchini: 'courgette', parsley: 'persil', cumin: 'cumin', paprika: 'paprika',
};

/** Recettes portugaises (accents retirés par normalize). */
const PT_ALIASES: Record<string, string> = {
  ovo: 'oeuf', ovos: 'oeuf', farinha: 'farine', acucar: 'sucre', manteiga: 'beurre', leite: 'lait', cebola: 'oignon',
  cebolas: 'oignon', alho: 'ail', 'dentes de alho': 'ail', 'dente de alho': 'ail', sal: 'sel', pimenta: 'poivre',
  azeite: 'huile-olive', oleo: 'huile-tournesol', frango: 'poulet', 'peito de frango': 'poulet', arroz: 'riz',
  massa: 'pates', esparguete: 'pates', tomate: 'tomate', tomates: 'tomate', natas: 'creme', queijo: 'emmental',
  'queijo ralado': 'emmental', cenoura: 'carotte', cenouras: 'carotte', batata: 'pomme-de-terre', batatas: 'pomme-de-terre',
  limao: 'citron', bacalhau: 'cabillaud', salmao: 'saumon', camarao: 'crevette', salsa: 'persil', coentros: 'coriandre',
  chourico: 'chorizo', 'carne picada': 'boeuf-hache', 'grao de bico': 'pois-chiches', feijao: 'haricots-rouges',
  'leite de coco': 'lait-coco', cogumelos: 'champignon', espinafres: 'epinard', courgete: 'courgette', pimento: 'poivron',
  'vinho branco': 'vin-blanc', 'vinho tinto': 'vin-rouge', 'caldo': 'bouillon', mel: 'miel', chocolate: 'chocolat',
  'fermento': 'levure', canela: 'cannelle', iogurte: 'yaourt', 'polpa de tomate': 'tomates-concassees',
};

interface AliasEntry { alias: string; id: string }
let aliasIndex: AliasEntry[] | null = null;
function getAliasIndex(): AliasEntry[] {
  if (!aliasIndex) {
    aliasIndex = [];
    for (const ing of INGREDIENTS) {
      for (const a of [ing.name, ing.id.replace(/-/g, ' '), ...ing.aliases]) aliasIndex.push({ alias: normalize(a), id: ing.id });
    }
    for (const [a, id] of [...Object.entries(EN_ALIASES), ...Object.entries(PT_ALIASES)]) aliasIndex.push({ alias: a, id });
    // Les alias les plus longs d'abord ("huile d olive" avant "huile").
    aliasIndex.sort((x, y) => y.alias.length - x.alias.length);
  }
  return aliasIndex;
}

export function matchIngredient(name: string): string | undefined {
  const n = ` ${normalize(name)} `;
  let own: { id: string; words: number } | undefined;
  for (const { alias, id } of getAliasIndex()) {
    if (!alias) continue;
    if (n.includes(` ${alias} `) || n.includes(` ${alias}s `)) {
      own = { id, words: alias.split(' ').length };
      break;
    }
  }
  // Dictionnaire multilingue (artichaut, alcachofra, artichoke…) : il l'emporte quand son nom est plus long
  // ("couve-flor" = chou-fleur, et non "couve" = chou kale).
  const lex = findInTextDetailed(name);
  if (lex && (!own || lex.words > own.words)) return ingredientFromEntry(lex.entry).id;
  return own?.id;
}

// ---------- Analyse d'une ligne d'ingrédient ----------

const UNIT_WORDS: [RegExp, Unit, number?][] = [
  [/^(kg|kilos?|kilogrammes?)\b/, 'kg'],
  [/^(g|gr|grs|grammes?)\b/, 'g'],
  [/^(ml|millilitres?)\b/, 'ml'],
  [/^(cl|centilitres?)\b/, 'cl'],
  [/^(l|litres?)\b/, 'l'],
  [/^(c\.? ?a\.? ?s\.?|cas|cs|cuill?eres? a soupe|cuill?ere a soupe|c\. a soupe|tbsp|tablespoons?|colher(es)? de sopa|c\. de sopa)\b/, 'cas'],
  [/^(c\.? ?a\.? ?c\.?|cac|cc|cuill?eres? a cafe|cuill?ere a cafe|c\. a cafe|tsp|teaspoons?|colher(es)? de cha|c\. de cha)\b/, 'cac'],
  [/^(pincees?|pinch|pitada)\b/, 'pincee'],
  [/^(gousses?|cloves?|dentes?)\b/, 'gousse'],
  [/^(tranches?|slices?)\b/, 'tranche'],
  [/^(bottes?|bouquets?)\b/, 'botte'],
  [/^(sachets?)\b/, 'sachet'],
  [/^(cups?|tasses?)\b/, 'ml', 240],
  [/^(verres?)\b/, 'ml', 200],
  [/^(oz|ounces?)\b/, 'g', 28],
  [/^(lbs?|pounds?)\b/, 'g', 454],
];

const FRACTIONS: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 0.333, '⅔': 0.667 };

function parseNumber(s: string): number | null {
  s = s.trim();
  if (FRACTIONS[s]) return FRACTIONS[s];
  const mixed = s.match(/^(\d+)\s*([½¼¾⅓⅔])$/);
  if (mixed) return Number(mixed[1]) + FRACTIONS[mixed[2]];
  const frac = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  const range = s.match(/^(\d+(?:[.,]\d+)?)\s*(?:-|à|a)\s*(\d+(?:[.,]\d+)?)$/);
  if (range) return (parseFloat(range[1].replace(',', '.')) + parseFloat(range[2].replace(',', '.'))) / 2;
  const n = parseFloat(s.replace(',', '.'));
  return Number.isNaN(n) ? null : n;
}

export function parseIngredientLine(line: string): RecipeIngredient {
  const raw = line.replace(/\s+/g, ' ').trim();
  let rest = normalize(raw);
  // normalize() retire les fractions unicode : la quantité est donc lue sur la ligne brute.
  const numMatch = raw.match(/^\s*(\d+(?:[.,]\d+)?\s*(?:(?:-|à)\s*\d+(?:[.,]\d+)?|\/\s*\d+|[½¼¾⅓⅔])?|[½¼¾⅓⅔])/);
  let qty: number | null = null;
  if (numMatch) {
    qty = parseNumber(numMatch[1]);
    rest = normalize(raw.slice(numMatch[0].length));
  }
  let unit: Unit = 'pc';
  for (const [re, u, mult] of UNIT_WORDS) {
    const m = rest.match(re);
    if (m && qty != null) {
      unit = u;
      if (mult) qty *= mult;
      rest = rest.slice(m[0].length).trim();
      break;
    }
  }
  rest = rest.replace(/^(de |d |of |do |da |dos |das )/, '').trim();
  const ingredientId = matchIngredient(rest || raw);
  const ing = getIngredient(ingredientId);
  // "200 farine" sans unité pour un ingrédient au poids → grammes.
  if (ing && unit === 'pc' && qty != null && ing.unit !== 'pc' && qty >= 20) unit = ing.unit === 'ml' ? 'ml' : 'g';
  return {
    ingredientId,
    name: ing?.name ?? capitalize(raw.replace(/^[\d.,/½¼¾⅓⅔\s-]+/, '') || raw),
    qty,
    unit,
    note: ing ? raw : undefined,
    optional: /facultatif|optionnel|optional/i.test(raw) || undefined,
  };
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------- Schema.org Recipe (JSON-LD) → Recipe ----------

export function parseISODuration(d: unknown): number | null {
  if (typeof d !== 'string') return null;
  const m = d.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i);
  if (!m) return null;
  const total = Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  return total || null;
}

function text(v: unknown): string {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map(text).join(' ');
  if (v && typeof v === 'object' && 'text' in v) return text((v as { text: unknown }).text);
  return '';
}

function decode(s: string): string {
  return s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'").replace(/<[^>]+>/g, '').trim();
}

function steps(v: unknown): string[] {
  if (!v) return [];
  if (typeof v === 'string') return v.split(/\n+|(?<=\.)\s+(?=[A-ZÉÈ])/).map(decode).filter(Boolean);
  if (Array.isArray(v)) {
    return v.flatMap((s) => {
      if (s && typeof s === 'object' && (s as { '@type'?: string })['@type'] === 'HowToSection') {
        return steps((s as { itemListElement?: unknown }).itemListElement);
      }
      return [decode(text(s))];
    }).filter(Boolean);
  }
  return [decode(text(v))].filter(Boolean);
}

const PALETTE = ['#f4a259', '#e76f51', '#90be6d', '#f9c74f', '#43aa8b', '#f3722c', '#577590', '#e63946'];

function guessEmoji(title: string, cat: Category): string {
  const t = normalize(title);
  const table: [RegExp, string][] = [
    [/pate|spaghetti|lasagne|tagliatelle/, '🍝'], [/pizza/, '🍕'], [/soupe|veloute/, '🍲'], [/salade/, '🥗'],
    [/poulet/, '🍗'], [/boeuf|steak/, '🥩'], [/poisson|saumon|cabillaud/, '🐟'], [/gateau|cake|fondant|brownie/, '🍰'],
    [/tarte|quiche/, '🥧'], [/curry|dal/, '🍛'], [/burger/, '🍔'], [/crepe|pancake/, '🥞'], [/oeuf|omelette/, '🍳'],
  ];
  for (const [re, e] of table) if (re.test(t)) return e;
  return cat === 'dessert' ? '🍰' : '🍽️';
}

function guessCategory(r: Record<string, unknown>): Category {
  const c = normalize(text(r.recipeCategory) + ' ' + text(r.name));
  if (/dessert|gateau|cake|tarte sucree|cookie|biscuit/.test(c)) return 'dessert';
  if (/soupe|veloute|soup/.test(c)) return 'soupe';
  if (/salade|salad/.test(c)) return 'salade';
  if (/entree|starter|apero/.test(c)) return 'entree';
  if (/petit dej|breakfast|brunch/.test(c)) return 'petit-dej';
  return 'plat';
}

function guessEquipment(all: string): Equipment[] {
  const t = normalize(all);
  const eq = new Set<Equipment>();
  if (/four|enfourn|preheat|oven/.test(t)) eq.add('oven');
  if (/poele|casserole|cocotte|feu |faire revenir|bouillir|wok|frying pan|saucepan|skillet/.test(t)) eq.add('stovetop');
  if (/mixe|blender|mixeur/.test(t)) eq.add('blender');
  if (/micro.?ondes|microwave/.test(t)) eq.add('microwave');
  if (/batteur|fouet electrique|stand mixer/.test(t)) eq.add('mixer');
  if (/air ?fryer/.test(t)) eq.add('airfryer');
  return [...eq];
}

export function fromSchemaRecipe(r: Record<string, unknown>, url?: string, siteName?: string): Recipe {
  const title = decode(text(r.name)) || 'Recette importée';
  const ingredientsRaw = (Array.isArray(r.recipeIngredient) ? r.recipeIngredient : Array.isArray(r.ingredients) ? r.ingredients : [])
    .map((x) => decode(text(x)))
    .filter(Boolean);
  const stepList = steps(r.recipeInstructions);
  const yieldStr = text(Array.isArray(r.recipeYield) ? r.recipeYield[0] : r.recipeYield);
  const servings = Math.max(1, parseInt(yieldStr, 10) || 4);
  const prep = parseISODuration(r.prepTime);
  const cook = parseISODuration(r.cookTime);
  const total = parseISODuration(r.totalTime);
  const nutrition = r.nutrition as Record<string, unknown> | undefined;
  const kcal = nutrition ? parseFloat(text(nutrition.calories)) : NaN;
  const imageVal = r.image as unknown;
  const image = typeof imageVal === 'string' ? imageVal : Array.isArray(imageVal) ? text(imageVal[0]) || (imageVal[0] as { url?: string })?.url : (imageVal as { url?: string })?.url;
  const category = guessCategory(r);
  const cuisine = decode(text(r.recipeCuisine)) || 'Du web';

  return {
    id: uid('imp-'),
    title,
    emoji: guessEmoji(title, category),
    color: PALETTE[title.length % PALETTE.length],
    image: image || undefined,
    cuisine: cuisine.split(',')[0],
    origin: cuisineFromText(cuisine, url),
    category,
    servings,
    prepMin: prep ?? (total && cook ? total - cook : total),
    cookMin: cook,
    difficulty: stepList.length > 7 || ingredientsRaw.length > 12 ? 2 : 1,
    equipment: guessEquipment(stepList.join(' ')),
    ingredients: ingredientsRaw.map(parseIngredientLine),
    steps: stepList,
    source: { name: siteName ?? (url ? new URL(url).hostname.replace(/^www\./, '') : 'Import'), url },
    sourceKcal: Number.isFinite(kcal) && kcal > 0 ? Math.round(kcal) : undefined,
    imported: true,
  };
}

/** Saisie manuelle : liste d'ingrédients et d'étapes collées en texte. */
export function fromPlainText(title: string, servings: number, ingredientsText: string, stepsText: string, minutes: number | null): Recipe {
  const r = fromSchemaRecipe({
    name: title,
    recipeIngredient: ingredientsText.split('\n').map((s) => s.replace(/^[-•*]\s*/, '')).filter((s) => s.trim()),
    recipeInstructions: stepsText.split('\n').map((s) => s.replace(/^\d+[.)]\s*/, '')).filter((s) => s.trim()),
    recipeYield: String(servings),
  });
  r.prepMin = minutes;
  r.cookMin = null;
  r.source = { name: 'Saisie manuelle' };
  return r;
}

export async function importFromUrl(url: string): Promise<Recipe> {
  const res = await fetch(`/api/import?url=${encodeURIComponent(url)}`);
  const data = await res.json().catch(() => ({ error: 'Réponse invalide du serveur.' }));
  if (!res.ok || data.error) throw new Error(data.error ?? `Erreur ${res.status}`);
  return fromSchemaRecipe(data.recipe, data.url, data.siteName);
}

// ---------- Import depuis des photos ----------

/** Réduit une photo (JPEG) pour accélérer l'envoi et l'analyse ; les tickets gardent plus de détail. */
export async function shrinkPhoto(file: File, maxEdge = 1600): Promise<{ mediaType: string; data: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  return { mediaType: 'image/jpeg', data: dataUrl.slice(dataUrl.indexOf(',') + 1) };
}

export async function importFromPhotos(files: File[]): Promise<Recipe> {
  const images = await Promise.all(files.slice(0, 4).map((f) => shrinkPhoto(f)));
  const res = await fetch('/api/photo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ images }),
  });
  const data = await res.json().catch(() => ({ error: 'Réponse invalide du serveur.' }));
  if (!res.ok || data.error) throw new Error(data.error ?? `Erreur ${res.status}`);
  const recipe = fromSchemaRecipe(data.recipe, undefined, 'Photo');
  recipe.source = { name: 'Photo' };
  return recipe;
}

/** Identifiant stable tiré de l'adresse (les favoris et le menu survivent au rechargement du catalogue). */
function stableId(url: string): string {
  let h = 5381;
  for (let i = 0; i < url.length; i++) h = ((h << 5) + h + url.charCodeAt(i)) | 0;
  return `web-${(h >>> 0).toString(36)}`;
}

/**
 * Recette récoltée par le Worker (fiche sans les étapes) → recette Cooking Hub.
 * Écartée si moins de 60 % de ses ingrédients sont reconnus (prix et calories seraient trop approximatifs).
 */
export function fromHarvestedRecipe(r: Record<string, unknown> & { url: string; source: string; stepCount?: number }): Recipe | null {
  try {
    const rec = fromSchemaRecipe(r, r.url, r.source);
    const known = rec.ingredients.filter((i) => i.ingredientId).length;
    if (!rec.ingredients.length || known / rec.ingredients.length < 0.6) return null;
    return { ...rec, id: stableId(r.url), imported: false, steps: [], stepCount: r.stepCount ?? undefined };
  } catch {
    return null;
  }
}
