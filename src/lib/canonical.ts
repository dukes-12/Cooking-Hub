import { getIngredient, INGREDIENTS } from '../data/ingredients';
import { allLexEntries, ingredientFromEntry, lexName } from './lexicon';
import { normalize } from './text';

/**
 * Aliment de base d'un produit : « Parmesan râpé » → parmesan, « Lait demi-écrémé pasteurisé » → lait,
 * un produit personnel → sa famille. Sert à reconnaître au frigo ce qu'une recette demande.
 * Prudent : le nom doit COMMENCER par l'aliment, suivi seulement de précisions (« râpé », « frais »…),
 * pas d'un complément (« beurre de cacahuète » n'est pas du beurre).
 */
let index: { alias: string; id: string }[] | null = null;
function aliases() {
  if (!index) {
    index = INGREDIENTS.flatMap((i) => [i.name, ...i.aliases].map((a) => ({ alias: normalize(a), id: i.id })))
      .filter((a) => a.alias.length >= 3)
      .sort((a, b) => b.alias.length - a.alias.length);
  }
  return index;
}

/** Morceaux et formes qui ne changent pas l'aliment : « filet de poulet », « pavé de saumon », « peito de frango ». */
const CUTS = /^(filets?|blancs?|escalopes?|aiguillettes?|morceaux|morceau|des|tranches?|paves?|dos|emince(?:e|s|es)?|supremes?|cubes?|lamelles?|rondelles?|copeaux|feuilles?|brins?|gousses?|bottes?|zestes?|peitos?|filetes?|lombos?|postas?|bifes?|fatias?|cubos?|lombinhos?|breasts?|fillets?|slices?) (?:de |d |du |des |da |do |das |dos |of )?(?:la |l )?/;

/** Préparations qui en font un autre produit (« saumon fumé », « tomates séchées », « poulet rôti »…). */
const TRANSFORMED = /(?:^|\s)(fume|fumee|fumes|fumees|seche|sechee|seches|sechees|confit|confite|pane|panee|panes|marine|marinee|hache|hachee|roti|rotie|cuit|cuite|en conserve|en boite|au naturel|a l huile|fumado|fumada|seco|seca|assado|assada|panado|panada|smoked|dried|roasted)\b/;

function matchStart(n: string): string | undefined {
  for (const { alias, id } of aliases()) {
    if (n === alias) return id;
    if (!n.startsWith(alias + ' ')) continue;
    const rest = n.slice(alias.length + 1);
    // « beurre de cacahuète », « lait de coco » : le complément est un autre aliment → autre produit.
    // « ovos de galinhas criadas ao ar livre », « œufs de poules élevées en plein air » : simple précision.
    const comp = rest.match(/^(?:de|d|du|des|a|au|aux|en|com|do|da|dos|das|ao|with|of)\s+(?:la |l )?(.*)$/);
    if (comp && (!comp[1] || aliases().some((a) => a.id !== id && (comp[1] === a.alias || comp[1].startsWith(a.alias + ' '))))) continue;
    if (TRANSFORMED.test(rest)) continue;
    return id;
  }
  return undefined;
}

export function baseIdForName(name: string): string | undefined {
  const n = normalize(name);
  const direct = matchStart(n);
  if (direct) return direct;
  // « Filet de poulet », « Aiguillettes de poulet » → poulet.
  const cut = n.replace(CUTS, '');
  return cut !== n ? matchStart(cut) : undefined;
}

const cache = new Map<string, string>();

/** Identifiant de l'aliment de base (lui-même pour un ingrédient de référence). */
export function baseId(id: string): string {
  const hit = cache.get(id);
  if (hit) return hit;
  const ing = getIngredient(id);
  let base = id;
  if (ing && INGREDIENTS.some((i) => i.id === id)) base = id;
  else if (ing?.family) base = ing.family;
  else if (ing) base = baseIdForName(ing.name) ?? id;
  // Mes produits peuvent changer de famille : pas de cache pour eux.
  if (!id.startsWith('mine:')) cache.set(id, base);
  return base;
}

/** Même aliment ? (parmesan et parmesan râpé, sachet d'herbes de marque et herbes de Provence…) */
export const sameFood = (a: string, b: string) => a === b || baseId(a) === baseId(b);

/** Variantes d'un aliment dans le dictionnaire (« Poulet fermier », « Filet de poulet halal »…), par nom. */
export function lexVariants(id: string, limit = 40): string[] {
  const out = new Set<string>();
  for (const e of allLexEntries()) {
    if (out.size >= limit) break;
    const ing = ingredientFromEntry(e);
    if (ing.id !== id && baseId(ing.id) === id) out.add(lexName(e, 'fr'));
  }
  return [...out];
}

/** Produit du dictionnaire regroupé sous son aliment de base (« Poulet fermier » → Blanc de poulet). */
export function grouped(id: string): string {
  if (!id.startsWith('lex:')) return id;
  const base = baseId(id);
  return base !== id && INGREDIENTS.some((i) => i.id === base) ? base : id;
}
