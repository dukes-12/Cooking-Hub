import { getIngredient } from '../data/ingredients';
import { ALLERGENS, CHAINS, COUNTRIES, DIETS, getChain, type Chain } from '../data/reference';
import type { ChosenStore, Ingredient, Profile, Recipe } from '../types';
import { median, type PriceObservation } from './receipts';
import { pricePerKg, priceSource } from './pricing';
import { storeKey, storeTitle } from './stores';

/** Points forts d'un aliment, à partir de ses valeurs nutritionnelles (pour 100 g). */
export function highlights(ing: Ingredient): string[] {
  if (ing.partial) return [];
  const out: string[] = [];
  if (ing.protein >= 15) out.push(`Riche en protéines (${Math.round(ing.protein)} g/100 g)`);
  else if (ing.protein >= 8) out.push(`Source de protéines (${Math.round(ing.protein)} g/100 g)`);
  if (ing.kcal < 40) out.push(`Très peu calorique (${ing.kcal} kcal/100 g)`);
  else if (ing.kcal >= 450) out.push(`Très énergétique (${ing.kcal} kcal/100 g) : à doser`);
  if (ing.fat < 3 && ing.kcal > 0) out.push('Pauvre en matières grasses');
  else if (ing.fat >= 30) out.push(`Riche en matières grasses (${Math.round(ing.fat)} g/100 g)`);
  if (ing.carbs >= 50) out.push(`Riche en glucides (${Math.round(ing.carbs)} g/100 g)`);
  return out;
}

/** Régimes et allergies concernés par l'aliment. */
export function dietNotes(ing: Ingredient): string[] {
  const notes: string[] = [];
  for (const a of Object.values(ALLERGENS)) if (ing.tags.includes(a.tag)) notes.push(`Contient : ${a.label.toLowerCase()}`);
  for (const d of Object.values(DIETS)) if (d.excludes.some((t) => ing.tags.includes(t))) notes.push(`Non ${d.label.toLowerCase()}`);
  return [...new Set(notes)];
}

export function recipesUsing(id: string, recipes: Record<string, Recipe>): Recipe[] {
  return Object.values(recipes).filter((r) => r.ingredients.some((i) => i.ingredientId === id));
}

/** "€/kg", "€/L" ou "€/pièce" selon le produit. */
export function priceUnitLabel(ing: Ingredient): string {
  return ing.unit === 'ml' ? '/L' : '/kg';
}

export interface StorePrice {
  store?: ChosenStore;
  chain: Chain;
  country: string;
  perKg: number | null;
  source: 'observed-store' | 'observed' | 'estimate' | null;
  lastDate?: string;
  count?: number;
}

/** Prix d'un produit dans nos magasins : relevé dans CE magasin d'abord, puis dans l'enseigne, sinon estimé. */
export function pricesInMyStores(id: string, profile: Profile, observations: PriceObservation[]): StorePrice[] {
  return profile.stores
    .map((s) => {
      const chain = getChain(s.chainId)!;
      const mine = observations.filter((o) => o.productId === id && o.storeKey === storeKey(s) && o.pricePerKg != null);
      if (mine.length) {
        return { store: s, chain, country: chain.country, perKg: median(mine.map((o) => o.pricePerKg!)), source: 'observed-store' as const, lastDate: mine[0].date, count: mine.length };
      }
      const perKg = pricePerKg(id, chain.id, chain.country);
      const src = priceSource(id, chain.id);
      return { store: s, chain, country: chain.country, perKg, source: src };
    })
    .filter((p) => p.chain)
    .sort((a, b) => (a.perKg ?? Infinity) - (b.perKg ?? Infinity));
}

/** Prix dans toutes les enseignes connues, par pays. */
export function pricesEverywhere(id: string): { country: (typeof COUNTRIES)[number]; prices: StorePrice[] }[] {
  return COUNTRIES.map((country) => ({
    country,
    prices: CHAINS.filter((c) => c.country === country.code)
      .map((chain) => ({ chain, country: country.code, perKg: pricePerKg(id, chain.id, country.code), source: priceSource(id, chain.id) }))
      .filter((p) => p.perKg != null)
      .sort((a, b) => a.perKg! - b.perKg!),
  })).filter((g) => g.prices.length);
}

export function productName(id: string): string {
  return getIngredient(id)?.name ?? id;
}

export { storeTitle };
