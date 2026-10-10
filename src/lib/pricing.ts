import { getIngredient } from '../data/ingredients';
import { CHAINS, getChain, getCountry, type Chain } from '../data/reference';
import type { Profile } from '../types';
import { median, type PriceObservation } from './receipts';
import { hash01 } from './text';

/**
 * Fournisseur de prix. Le prototype utilise une estimation (prix de référence × indice pays × indice enseigne).
 * Des fournisseurs "réels" (Open Prices / Open Food Facts, scrapers côté serveur, prix saisis par l'utilisateur)
 * peuvent être branchés en implémentant cette interface : le premier qui renvoie un prix l'emporte.
 */
export interface PriceProvider {
  id: string;
  label: string;
  /** Prix en devise locale pour 1 kg (ou 1 L) de l'ingrédient dans l'enseigne, ou null si inconnu. */
  pricePerKg(ingredientId: string, chainId: string | null, country: string): number | null;
}

export const estimatedProvider: PriceProvider = {
  id: 'estimate',
  label: 'Estimation (prix moyens × indice enseigne)',
  pricePerKg(ingredientId, chainId, country) {
    const ing = getIngredient(ingredientId);
    if (!ing || ing.partial) return null;
    const base = ing.pricePerKg * getCountry(country).priceFactor;
    if (!chainId) return base;
    const chain = getChain(chainId);
    if (!chain) return base;
    const bias = chain.aisleBias?.[ing.aisle] ?? 1;
    // Variation stable ±7 % par produit et par enseigne : simule les écarts réels d'un rayon à l'autre.
    const noise = 0.93 + hash01(chain.id + ingredientId) * 0.14;
    return base * chain.index * bias * noise;
  },
};

/**
 * Prix relevés sur les tickets de caisse validés (médiane des 90 derniers jours par enseigne).
 * Alimenté par l'état de l'app via setObservedPrices.
 */
let observed = new Map<string, number>(); // "chainId|productId" → prix au kg
export function setObservedPrices(list: PriceObservation[]) {
  const recent = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const buckets = new Map<string, number[]>();
  for (const o of list) {
    if (o.pricePerKg == null || o.date < recent) continue;
    const k = `${o.chainId}|${o.productId}`;
    buckets.set(k, [...(buckets.get(k) ?? []), o.pricePerKg]);
  }
  observed = new Map([...buckets].map(([k, v]) => [k, median(v)!]));
}

export const observedProvider: PriceProvider = {
  id: 'observed',
  label: 'Prix relevés sur tes tickets',
  pricePerKg: (ingredientId, chainId) => (chainId ? observed.get(`${chainId}|${ingredientId}`) ?? null : null),
};

/** D'où vient le prix affiché : relevé sur un ticket ou estimé. */
export function priceSource(ingredientId: string, chainId: string | null): 'observed' | 'estimate' | null {
  if (chainId && observed.has(`${chainId}|${ingredientId}`)) return 'observed';
  return estimatedProvider.pricePerKg(ingredientId, chainId, 'FR') != null ? 'estimate' : null;
}

const providers: PriceProvider[] = [observedProvider, estimatedProvider];

export function pricePerKg(ingredientId: string, chainId: string | null, country: string): number | null {
  for (const p of providers) {
    const v = p.pricePerKg(ingredientId, chainId, country);
    if (v != null) return v;
  }
  return null;
}

/** Prix d'une quantité (grammes) d'un ingrédient. */
export function costOf(ingredientId: string | undefined, grams: number | null, chainId: string | null, country: string): number | null {
  if (!ingredientId || grams == null) return null;
  const ppk = pricePerKg(ingredientId, chainId, country);
  return ppk == null ? null : (ppk * grams) / 1000;
}

export function userChains(profile: Profile): Chain[] {
  const ids = [...new Set(profile.stores.map((s) => s.chainId))];
  const chains = ids.map(getChain).filter((c): c is Chain => !!c);
  return chains.length ? chains : CHAINS.filter((c) => c.country === profile.country);
}

export interface Basket {
  ingredientId: string | undefined;
  grams: number | null;
}

export interface BasketQuote {
  perChain: { chain: Chain; total: number }[];
  best: { chain: Chain; total: number } | null;
  average: number;
  /** Meilleure combinaison de 2 enseignes (chaque article dans la moins chère des deux). */
  split: { chains: [Chain, Chain]; total: number; saving: number } | null;
  unknown: number;
}

export function quoteBasket(items: Basket[], profile: Profile): BasketQuote {
  const chains = userChains(profile);
  const priced = (id: string) => chains.some((c) => pricePerKg(id, c.id, profile.country) != null);
  const known = items.filter((it) => it.ingredientId && it.grams != null && getIngredient(it.ingredientId) && priced(it.ingredientId));
  const unknown = items.length - known.length;
  const matrix = known.map((it) => chains.map((c) => costOf(it.ingredientId, it.grams, c.id, profile.country) ?? 0));
  const perChain = chains
    .map((chain, ci) => ({ chain, total: matrix.reduce((s, row) => s + row[ci], 0) }))
    .sort((a, b) => a.total - b.total);
  const best = perChain[0] ?? null;
  const average = perChain.length ? perChain.reduce((s, p) => s + p.total, 0) / perChain.length : 0;

  let split: BasketQuote['split'] = null;
  for (let a = 0; a < chains.length; a++) {
    for (let b = a + 1; b < chains.length; b++) {
      const total = matrix.reduce((s, row) => s + Math.min(row[a], row[b]), 0);
      if (!split || total < split.total) split = { chains: [chains[a], chains[b]], total, saving: 0 };
    }
  }
  if (split && best) {
    split.saving = best.total - split.total;
    // Ne vaut le coup que si l'économie est significative.
    if (split.saving < Math.max(1, best.total * 0.04)) split = null;
  }
  return { perChain, best, average, split, unknown };
}

export function fmtMoney(v: number | null | undefined, country: string): string {
  if (v == null || Number.isNaN(v)) return '—';
  const currency = getCountry(country).currency;
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency, maximumFractionDigits: 2 }).format(v);
}
