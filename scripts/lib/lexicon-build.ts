/** Construit le dictionnaire multilingue des aliments à partir de la taxonomie Open Food Facts. */
import type { Ingredient } from '../../src/types';
import type { Aisle, FoodTag } from '../../src/types';
import type { LexEntry } from '../../src/lib/lexicon-types';
import { buildResolver, parseTaxonomy, slug, type TaxEntry } from './taxonomy';

export type Translations = Record<string, { fr?: string[]; pt?: string[]; en?: string[] }>;
/** Corrections : remplacent entièrement les noms d'une langue (erreurs de la source). */
export type Corrections = Record<string, { fr?: string[]; pt?: string[]; en?: string[] }>;

/** Rattachements forcés : notre ingrédient → entrée du dictionnaire. */
export const LINK_OVERRIDES: Record<string, string> = {
  chevre: 'goat-cheese', moutarde: 'mustard', tofu: 'tofu', margarine: 'margarine', chapelure: 'breadcrumbs',
  'lait-vegetal': 'oat-milk', morue: 'salted-dried-cod', saucisse: 'sausage', lardons: 'lardon',
};

/** Racines de la taxonomie qui correspondent à des produits qu'on cuisine ou qu'on achète. */
const CULINARY_ROOTS = new Set([
  'vegetable', 'fruit', 'dairy', 'cereal', 'fish', 'oil-and-fat', 'herb', 'poultry', 'meat', 'flour', 'nut', 'shellfish',
  'rice', 'condiment', 'seed', 'mushroom', 'egg', 'sauce', 'salt', 'vinegar', 'bread', 'chocolate', 'plant', 'animal',
  'game-animal', 'added-sugar', 'alcohol', 'dough', 'starch', 'coffee', 'water', 'algae', 'yeast',
  // Entrées sans parent dans la taxonomie mais courantes en cuisine.
  'tofu', 'tempeh', 'margarine', 'almond-milk', 'oat-milk', 'rice-milk', 'soya', 'mustard', 'broth', 'fond', 'jam',
  'biscuit', 'cake', 'crepe', 'brioche', 'vermicelli', 'hummus', 'falafel', 'juice', 'mirepoix', 'omelette', 'ice-cream',
  'gingerbread', 'waffle', 'french-fries', 'guacamole', 'muesli', 'sausage', 'patty', 'baking-powder', 'red-endive',
  'green-endive', 'fried-onion', 'flax', 'crouton', 'bretzel', 'nachos', 'marzipan', 'nougat', 'praline', 'aspic', 'brine',
  'lemonade', 'kombucha', 'french-toast', 'plant-based-cheese', 'vegan-bacon', 'sugarcane', 'stir-fry', 'milk-substitute',
  'chestnut-spread', 'hazelnut-spread', 'cocoa-spread', 'panna-cotta',
]);
/** Entrées autorisées même sous une racine industrielle (ex. la chapelure est classée "enrobage"). */
const ALWAYS = new Set(['breadcrumbs', 'wheat-breadcrumbs', 'wholemeal-breadcrumbs', 'baking-powder']);
const INDUSTRIAL_ROOTS = new Set(['flavouring', 'fiber', 'coating', 'ferment', 'varietal', 'preparation', 'protein']);
/** Noms trop techniques ou trop spécifiques (pourcentages, labels, additifs…). */
const TOO_SPECIFIC =
  /\d|%|\b(organic|pdo|pgi|aop|igp|grade|uht|vitamin|enriched|enhanced|gmo|kosher|extract|oleoresin|lecithin|flavou?r|colou?r|additive|preparation|reconstituted|baby|age|mono|esters?|acid|dextrin|glycerol)\b/i;

const words = (s: string) => s.trim().split(/\s+/).length;

/** "Açúcar" → "açúcar" (la source met parfois une majuscule inutile) ; "Brie de Meaux" reste tel quel. */
function tidy(name: string): string {
  const n = name.trim().replace(/\s+/g, ' ');
  return /^[A-ZÀ-Ý][^A-ZÀ-Ý]*$/.test(n) ? n.charAt(0).toLowerCase() + n.slice(1) : n;
}

function mergeNames(...lists: (string[] | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const l of lists) {
    for (const raw of l ?? []) {
      const n = tidy(raw);
      const key = slug(n);
      if (!n || !key || seen.has(key)) continue;
      seen.add(key);
      out.push(n);
    }
  }
  return out;
}

const ID = (s: string) => `en:${s}`;
const TAG_BY_ANCESTOR: [string, FoodTag[]][] = [
  ['meat', ['meat']], ['poultry', ['meat', 'poultry']], ['pork', ['meat', 'pork']], ['beef', ['meat', 'beef']],
  ['game-animal', ['meat']], ['fish', ['fish']], ['shellfish', ['seafood']],
  ['dairy', ['dairy']], ['milk', ['dairy']], ['cheese', ['dairy']], ['cream', ['dairy']], ['butter', ['dairy']], ['yogurt', ['dairy']],
  ['egg', ['egg']], ['tree-nut', ['nuts']], ['peanut', ['peanut']], ['sesame', ['sesame']], ['mustard', ['mustard']],
  ['celery', ['celery']], ['soya', ['soy']], ['wheat', ['gluten']], ['barley', ['gluten']], ['rye', ['gluten']],
  ['spelt', ['gluten']], ['gluten', ['gluten']], ['alcohol', ['alcohol']], ['wine', ['alcohol']], ['beer', ['alcohol']],
  ['honey', ['honey']],
];

/** Rayon : le premier groupe trouvé parmi les ancêtres, du plus spécifique au plus général. */
const AISLE_BY_ANCESTOR: [string[], Aisle][] = [
  [['spice', 'salt', 'baking-powder'], 'epices'],
  [['juice', 'lemonade', 'kombucha'], 'boissons'],
  [['tofu', 'tempeh', 'margarine', 'plant-based-cheese', 'vegan-bacon', 'hummus', 'guacamole', 'oat-milk', 'rice-milk', 'almond-milk', 'milk-substitute'], 'cremerie'],
  [['biscuit', 'cake', 'crepe', 'brioche', 'waffle', 'gingerbread', 'bretzel', 'french-toast', 'crouton'], 'boulangerie'],
  [['sausage', 'patty'], 'boucherie'],
  [['alcohol', 'wine', 'beer', 'coffee', 'tea', 'water'], 'boissons'],
  [['meat', 'poultry', 'game-animal', 'sausage', 'ham', 'bacon'], 'boucherie'],
  [['fish', 'shellfish'], 'poissonnerie'],
  [['dairy', 'egg'], 'cremerie'],
  [['bread'], 'boulangerie'],
  [['pulse'], 'conserves'],
  [['vegetable', 'fruit', 'mushroom', 'herb', 'algae'], 'fruits-legumes'],
];

export interface BuildOptions {
  translations?: Translations;
  corrections?: Corrections;
  ours?: Ingredient[];
}

export function buildLexicon(taxonomyText: string, { translations = {}, corrections = {}, ours = [] }: BuildOptions = {}): { entries: LexEntry[]; stats: Record<string, number> } {
  const tax = parseTaxonomy(taxonomyText);
  const resolve = buildResolver(tax);
  const byId = new Map(tax.map((e) => [e.id, e]));

  const memo = new Map<string, Set<string>>();
  const ancestors = (e: TaxEntry, trail = new Set<string>()): Set<string> => {
    const hit = memo.get(e.id);
    if (hit) return hit;
    const out = new Set<string>();
    if (trail.has(e.id)) return out;
    trail.add(e.id);
    for (const ref of e.parents) {
      const pid = resolve(ref);
      const parent = pid ? byId.get(pid) : undefined;
      if (!parent) continue;
      out.add(parent.id);
      for (const a of ancestors(parent, trail)) out.add(a);
    }
    trail.delete(e.id);
    memo.set(e.id, out);
    return out;
  };

  const entries: LexEntry[] = [];
  const seenIds = new Set<string>();
  for (const e of tax) {
    if (seenIds.has(e.id)) continue; // la taxonomie répète parfois une entrée
    seenIds.add(e.id);
    const anc = ancestors(e);
    const lineage = new Set([e.id, ...anc]);
    const has = (name: string) => lineage.has(ID(name));
    const culinary = ALWAYS.has(e.id.slice(3)) || ([...CULINARY_ROOTS].some(has) && ![...INDUSTRIAL_ROOTS].some(has));
    if (!culinary) continue;

    const key = e.id.slice(3);
    const tr = translations[key] ?? {};
    const en = mergeNames(e.names.en, tr.en);
    const fr = mergeNames(tr.fr?.slice(0, 1), e.names.fr, tr.fr?.slice(1));
    const pt = mergeNames(e.names['pt-pt'], e.names.pt, tr.pt?.slice(0, 1), e.names['pt-br'], tr.pt?.slice(1));
    // Les noms originaux passent avant les traductions : on remet la traduction en tête seulement si l'original manque.
    const frOut = e.names.fr?.length ? mergeNames(e.names.fr, tr.fr) : fr;
    const ptOut = e.names['pt-pt']?.length || e.names.pt?.length || e.names['pt-br']?.length ? mergeNames(e.names['pt-pt'], e.names.pt, e.names['pt-br'], tr.pt) : pt;

    const fix = corrections[key];
    const frFinal = fix?.fr ?? frOut;
    const ptFinal = fix?.pt ?? ptOut;
    const enFinal = fix?.en ?? en;
    const hasBothOriginals = frFinal.length && ptFinal.length;
    if (!ALWAYS.has(key) && (TOO_SPECIFIC.test(en[0]) || en[0].length > 38)) continue;
    if (!ALWAYS.has(key) && words(en[0]) > (hasBothOriginals ? 5 : 3)) continue;

    const t = new Set<FoodTag>();
    for (const [name, tags] of TAG_BY_ANCESTOR) if (has(name)) tags.forEach((x) => t.add(x));
    if (t.has('peanut')) t.delete('nuts');
    if (/^(tofu|tempeh|soya|soy-milk)$/.test(key) || lineage.has(ID('tofu'))) t.add('soy');

    let aisle: Aisle = 'epicerie';
    for (const [names, a] of AISLE_BY_ANCESTOR) {
      if (names.some(has)) { aisle = a; break; }
    }

    const x: LexEntry['x'] = [];
    if (!e.names.fr?.length && tr.fr?.length) x.push('fr');
    if (!(e.names['pt-pt']?.length || e.names.pt?.length || e.names['pt-br']?.length) && tr.pt?.length) x.push('pt');

    entries.push({
      id: key,
      en: enFinal.slice(0, 6),
      fr: frFinal.slice(0, 6),
      pt: ptFinal.slice(0, 6),
      a: aisle,
      t: [...t],
      ...(e.props.wikidata?.en ? { w: e.props.wikidata.en } : {}),
      ...(e.props.ciqual_food_code?.en ? { c: e.props.ciqual_food_code.en } : {}),
      ...(x.length ? { x } : {}),
    });
  }

  linkOurIngredients(entries, ours);

  const stats = {
    entries: entries.length,
    fr: entries.filter((e) => e.fr.length).length,
    pt: entries.filter((e) => e.pt.length).length,
    allThree: entries.filter((e) => e.fr.length && e.pt.length && e.en.length).length,
    linked: entries.filter((e) => e.o).length,
    translated: entries.filter((e) => e.x?.length).length,
  };
  return { entries, stats };
}

/** Rattache nos ingrédients détaillés (nutrition, prix) aux entrées du dictionnaire par leurs noms. */
export function linkOurIngredients(entries: LexEntry[], ours: Ingredient[]) {
  const index = new Map<string, LexEntry[]>();
  for (const e of entries) {
    for (const n of [...e.en, ...e.fr, ...e.pt]) {
      const k = slug(n).replace(/-s$/, '');
      index.set(k, [...(index.get(k) ?? []), e]);
    }
  }
  const byKey = new Map(entries.map((e) => [e.id, e]));
  for (const ing of ours) {
    const forced = byKey.get(LINK_OVERRIDES[ing.id] ?? '');
    if (forced) {
      link(forced, ing);
      continue;
    }
    const keys = [ing.name, ...ing.aliases, ing.id.replace(/-/g, ' ')].map((n) => slug(n).replace(/-s$/, ''));
    const score = new Map<LexEntry, number>();
    keys.forEach((k, i) => {
      for (const e of index.get(k) ?? []) score.set(e, (score.get(e) ?? 0) + (i === 0 ? 3 : 1));
    });
    const best = [...score.entries()].filter(([e]) => !e.o).sort((a, b) => b[1] - a[1] || a[0].en[0].length - b[0].en[0].length)[0];
    if (best) link(best[0], ing);
  }
}

/** Notre ingrédient détaillé fait foi pour le rayon et les étiquettes (régimes, allergies). */
function link(entry: LexEntry, ing: Ingredient) {
  entry.o = ing.id;
  entry.a = ing.aisle;
  entry.t = [...new Set([...entry.t, ...ing.tags])];
}
