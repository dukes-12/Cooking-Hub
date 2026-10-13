import { chainsFor, getChain } from '../data/reference';
import { getIngredient } from '../data/ingredients';
import { communityProvider, onlineProvider } from './pricing';
import { linePricePerKg, lineQuantity, median } from './receipts';
import type { Receipt, SavedFood } from '../types';

/**
 * Économies réalisées : ce que tu as payé, comparé au prix habituel du même produit dans ton pays
 * (médiane des prix relevés par la communauté Open Prices et sur les sites des enseignes).
 * Seules les lignes de ticket dont on connaît ce prix de référence comptent.
 */
export function referencePerKg(ingredientId: string, country: string): number | null {
  const values: number[] = [];
  for (const c of chainsFor(country)) {
    const v = onlineProvider.pricePerKg(ingredientId, c.id, country) ?? communityProvider.pricePerKg(ingredientId, c.id, country);
    if (v != null) values.push(v);
  }
  if (!values.length) {
    const v = communityProvider.pricePerKg(ingredientId, null, country);
    if (v != null) values.push(v);
  }
  return median(values);
}

export interface LineSaving {
  receiptId: string;
  date: string;
  chainId: string;
  name: string;
  paid: number;
  reference: number;
  /** Positif : économisé ; négatif : payé plus cher que le prix habituel. */
  saving: number;
}

export function receiptSavings(receipts: Receipt[]): LineSaving[] {
  const out: LineSaving[] = [];
  for (const r of receipts) {
    for (const l of r.lines) {
      if (!l.productId || !(l.totalPrice > 0)) continue;
      const ing = getIngredient(l.productId);
      const perKg = linePricePerKg(l, ing);
      const grams = lineQuantity(l, ing).grams;
      const ref = referencePerKg(ing?.family ?? l.productId, r.country);
      if (perKg == null || grams == null || ref == null) continue;
      const reference = (ref * grams) / 1000;
      // Écarts invraisemblables (lot, format mal lu) : ignorés.
      if (reference <= 0 || l.totalPrice / reference > 4 || reference / l.totalPrice > 4) continue;
      out.push({ receiptId: r.id, date: r.date, chainId: r.chainId, name: ing?.name ?? l.label, paid: l.totalPrice, reference, saving: reference - l.totalPrice });
    }
  }
  return out;
}

export interface MonthSavings {
  month: string; // AAAA-MM
  paid: number;
  reference: number;
  saving: number;
  lines: number;
  wasteSaved: number;
  wasteCount: number;
}

/** Bilan mois par mois (le plus récent d'abord). */
export function monthlySavings(receipts: Receipt[], saved: SavedFood[] = []): MonthSavings[] {
  const months = new Map<string, MonthSavings>();
  const get = (m: string) => months.get(m) ?? months.set(m, { month: m, paid: 0, reference: 0, saving: 0, lines: 0, wasteSaved: 0, wasteCount: 0 }).get(m)!;
  for (const s of receiptSavings(receipts)) {
    const m = get(s.date.slice(0, 7));
    m.paid += s.paid;
    m.reference += s.reference;
    m.saving += s.saving;
    m.lines++;
  }
  for (const f of saved) {
    const m = get(f.date.slice(0, 7));
    m.wasteSaved += f.value;
    m.wasteCount++;
  }
  return [...months.values()].sort((a, b) => b.month.localeCompare(a.month));
}

/** Économies par enseigne (sur l'ensemble des tickets). */
export function savingsByChain(receipts: Receipt[]): { chainId: string; name: string; saving: number; lines: number }[] {
  const by = new Map<string, { saving: number; lines: number }>();
  for (const s of receiptSavings(receipts)) {
    const cur = by.get(s.chainId) ?? { saving: 0, lines: 0 };
    by.set(s.chainId, { saving: cur.saving + s.saving, lines: cur.lines + 1 });
  }
  return [...by].map(([chainId, v]) => ({ chainId, name: getChain(chainId)?.name ?? chainId, ...v })).sort((a, b) => b.saving - a.saving);
}
