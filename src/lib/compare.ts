import { getIngredient } from '../data/ingredients';
import { getChain } from '../data/reference';
import type { ChosenStore, Receipt } from '../types';
import { pricePerKg, priceSource } from './pricing';
import { lineQuantity, median, type PriceObservation } from './receipts';
import { REFERENCE_BASKET, storeKey } from './stores';

export type PriceOrigin = 'store' | 'chain' | 'community' | 'estimate';

export interface StoreQuote {
  perKg: number;
  origin: PriceOrigin;
}

/** Prix au kilo d'un produit dans UN magasin : relevé sur tes tickets de ce magasin, puis de l'enseigne, Open Prices, estimation. */
export function storePrice(productId: string, store: ChosenStore, observations: PriceObservation[]): StoreQuote | null {
  const key = storeKey(store);
  const here = observations.filter((o) => o.productId === productId && o.storeKey === key && o.pricePerKg != null);
  if (here.length) return { perKg: median(here.map((o) => o.pricePerKg!))!, origin: 'store' };
  const country = getChain(store.chainId)?.country ?? 'FR';
  const v = pricePerKg(productId, store.chainId, country);
  if (v == null) return null;
  const src = priceSource(productId, store.chainId, country);
  return { perKg: v, origin: src === 'observed' ? 'chain' : src === 'community' ? 'community' : 'estimate' };
}

export interface BasketItem {
  productId: string;
  grams: number;
  /** Nombre d'achats sur les tickets (0 pour le panier type). */
  purchases: number;
}

/** Ton panier : chaque produit acheté (avec un poids connu), à la quantité que tu prends d'habitude. */
export function basketFromReceipts(receipts: Receipt[]): BasketItem[] {
  const byProduct = new Map<string, number[]>();
  for (const r of receipts) {
    for (const l of r.lines) {
      if (!l.productId) continue;
      const g = lineQuantity(l, getIngredient(l.productId)).grams;
      if (g && g > 0) byProduct.set(l.productId, [...(byProduct.get(l.productId) ?? []), g]);
    }
  }
  return [...byProduct].map(([productId, g]) => ({ productId, grams: median(g)!, purchases: g.length })).sort((a, b) => b.purchases - a.purchases);
}

export function referenceBasket(): BasketItem[] {
  return REFERENCE_BASKET.map((b) => ({ productId: b.id, grams: b.grams, purchases: 0 }));
}

export interface StoreTotal {
  store: ChosenStore;
  total: number;
  /** Nombre d'articles dont le prix vient de tes tickets dans ce magasin. */
  fromTickets: number;
  priced: number;
}

/**
 * Coût du panier dans chaque magasin. Seuls les articles qui ont un prix PARTOUT sont comptés,
 * pour que les totaux restent comparables.
 */
export function compareBasket(stores: ChosenStore[], basket: BasketItem[], observations: PriceObservation[]): { totals: StoreTotal[]; items: number; skipped: number } {
  const quotes = basket.map((b) => ({ b, q: stores.map((s) => storePrice(b.productId, s, observations)) }));
  const usable = quotes.filter(({ q }) => q.every(Boolean));
  const totals = stores
    .map((store, i) => ({
      store,
      total: usable.reduce((sum, { b, q }) => sum + (q[i]!.perKg * b.grams) / 1000, 0),
      fromTickets: usable.filter(({ q }) => q[i]!.origin === 'store').length,
      priced: usable.length,
    }))
    .sort((a, b) => a.total - b.total);
  return { totals, items: usable.length, skipped: basket.length - usable.length };
}

export interface ProductComparison {
  productId: string;
  quotes: { store: ChosenStore; quote: StoreQuote }[];
  /** Écart entre le plus cher et le moins cher, en %. */
  spread: number;
}

/** Produits achetés dans au moins un magasin, comparés entre tous tes magasins (le moins cher d'abord). */
export function compareProducts(stores: ChosenStore[], observations: PriceObservation[]): ProductComparison[] {
  const ids = [...new Set(observations.filter((o) => o.pricePerKg != null).map((o) => o.productId))];
  return ids
    .map((productId) => {
      const quotes = stores
        .map((store) => ({ store, quote: storePrice(productId, store, observations) }))
        .filter((x): x is { store: ChosenStore; quote: StoreQuote } => !!x.quote)
        .sort((a, b) => a.quote.perKg - b.quote.perKg);
      const spread = quotes.length > 1 ? (quotes.at(-1)!.quote.perKg / quotes[0].quote.perKg - 1) * 100 : 0;
      return { productId, quotes, spread };
    })
    .filter((p) => p.quotes.length > 1)
    .sort((a, b) => b.spread - a.spread);
}
