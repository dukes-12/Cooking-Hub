import type { FridgeItem, Ingredient } from '../types';

/**
 * Produits qu'on ne compte pas (épices, huiles, sauces, levure…) : on dit seulement si on en a ou pas.
 * Leur quantité au frigo vaut 1 (« j'en ai ») ; cuisiner ne les décompte pas.
 */
const PRESENCE = new Set(['sauce-soja', 'moutarde', 'bouillon', 'maizena', 'levure', 'vanille', 'miel', 'concentre-tomate']);

export function presenceOnly(ing: Ingredient | undefined): boolean {
  if (!ing) return false;
  return ing.aisle === 'epices' || !!ing.staple || PRESENCE.has(ing.id) || (!!ing.family && PRESENCE.has(ing.family));
}

/** Ajoute au frigo (une quantité, ou simplement « j'en ai » pour les produits non comptés). */
export function addToFridge(fridge: FridgeItem[], ing: Ingredient | undefined, id: string, qty: number, expiresOn?: string): FridgeItem[] {
  const presence = presenceOnly(ing);
  const existing = fridge.find((f) => f.ingredientId === id);
  if (existing) {
    return fridge.map((f) => (f.ingredientId === id ? { ...f, qty: presence ? 1 : f.qty + qty, ...(expiresOn ? { expiresOn } : {}) } : f));
  }
  return [{ ingredientId: id, qty: presence ? 1 : qty, addedAt: Date.now(), ...(expiresOn ? { expiresOn } : {}) }, ...fridge];
}

/** Jours avant la date de péremption (négatif : périmé), ou null sans date. */
export function daysLeft(item: Pick<FridgeItem, 'expiresOn'>, now = new Date()): number | null {
  if (!item.expiresOn) return null;
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const [y, m, d] = item.expiresOn.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - today) / 86400000);
}

/** À consommer vite : périmé ou périme dans 3 jours au plus. */
export const SOON_DAYS = 3;
export const isSoon = (item: Pick<FridgeItem, 'expiresOn'>, now = new Date()) => {
  const d = daysLeft(item, now);
  return d != null && d <= SOON_DAYS;
};

export function expiryLabel(item: Pick<FridgeItem, 'expiresOn'>, now = new Date()): string | null {
  const d = daysLeft(item, now);
  if (d == null) return null;
  if (d < 0) return `périmé depuis ${-d} j`;
  if (d === 0) return "périme aujourd'hui";
  if (d === 1) return 'périme demain';
  return `périme dans ${d} j`;
}

/** Durée de conservation proposée par défaut selon le rayon (jours), ou null. */
export function defaultShelfDays(ing: Ingredient): number | null {
  if (presenceOnly(ing)) return null;
  return { 'fruits-legumes': 7, boucherie: 3, poissonnerie: 2, cremerie: 10, boulangerie: 3 }[ing.aisle as string] ?? null;
}

export function dateIn(days: number, now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
