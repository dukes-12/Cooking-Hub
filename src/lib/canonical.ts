import { getIngredient, INGREDIENTS } from '../data/ingredients';
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

export function baseIdForName(name: string): string | undefined {
  const n = normalize(name);
  for (const { alias, id } of aliases()) {
    if (n === alias) return id;
    if (!n.startsWith(alias + ' ')) continue;
    const rest = n.slice(alias.length + 1);
    if (/^(de|d|du|des|a|au|aux|en|com|do|da|dos|das|ao|with|of)\b/.test(rest)) continue;
    return id;
  }
  return undefined;
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
