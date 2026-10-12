import { useSyncExternalStore } from 'react';

/**
 * Prix en ligne des enseignes (relevé hebdomadaire des sites Continente, Pingo Doce, Auchan par notre
 * Worker Cloudflare) : un prix global par enseigne et par ingrédient, médiane de quelques produits suivis.
 */
export interface ChainPrice {
  perKg: number;
  n: number;
  min: number;
  stale?: boolean;
  /** Produits relevés sur le site de l'enseigne (les moins chers d'abord), avec le lien vers leur page. */
  items?: { url: string; name: string; perKg: number }[];
}
interface Payload {
  updatedAt?: string;
  chains: Record<string, Record<string, ChainPrice>>;
}

const STORE_KEY = 'cooking-hub:chain-prices';
const TTL = 12 * 3600000;
let data: Record<string, Payload & { at: number }> = {};
try {
  data = JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}');
} catch {
  data = {};
}
let version = 0;
const listeners = new Set<() => void>();
const loading = new Set<string>();

/** Pour les tests. */
export function setChainPrices(country: string, payload: Payload) {
  data[country] = { ...payload, at: Date.now() };
  version++;
  listeners.forEach((l) => l());
}

/** Charge (au plus deux fois par jour) les prix en ligne des enseignes du pays. */
export function loadChainPrices(country: string) {
  const hit = data[country];
  if ((hit && Date.now() - hit.at < TTL) || loading.has(country)) return;
  loading.add(country);
  fetch(`/api/chain-prices?country=${country}`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((payload: Payload) => {
      setChainPrices(country, { updatedAt: payload.updatedAt, chains: payload.chains ?? {} });
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(data));
      } catch {
        // stockage indisponible
      }
    })
    .catch(() => undefined)
    .finally(() => loading.delete(country));
}

export function useChainPrices(): number {
  return useSyncExternalStore(
    (cb) => (listeners.add(cb), () => listeners.delete(cb)),
    () => version,
  );
}

/** Prix en ligne d'un ingrédient dans une enseigne (produit personnel : celui de sa famille). */
export function chainPrice(ingredientId: string, chainId: string | null, country: string, family?: string): ChainPrice | null {
  if (!chainId) return null;
  const byId = data[country]?.chains?.[chainId];
  return byId?.[ingredientId] ?? (family ? byId?.[family] : undefined) ?? null;
}

/** Produits relevés sur les sites des enseignes pour un aliment (ou sa famille), enseigne par enseigne. */
export function chainProducts(ingredientId: string, country: string, family?: string): { chainId: string; price: ChainPrice }[] {
  const out: { chainId: string; price: ChainPrice }[] = [];
  for (const [chainId, byId] of Object.entries(data[country]?.chains ?? {})) {
    const price = byId[ingredientId] ?? (family ? byId[family] : undefined);
    if (price?.items?.length) out.push({ chainId, price });
  }
  return out.sort((a, b) => a.price.perKg - b.price.perKg);
}

export function chainPricesUpdatedAt(country: string): string | null {
  return data[country]?.updatedAt ?? null;
}

/** Lundi d'une semaine ISO ("2026-W41"), en millisecondes. */
export function weekStart(week: string): number {
  const [y, w] = week.split('-W').map(Number);
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const monday = jan4.getTime() - ((jan4.getUTCDay() || 7) - 1) * 86400000;
  return monday + (w - 1) * 7 * 86400000;
}

/** Évolution hebdomadaire du prix en ligne d'un ingrédient, par enseigne. */
export async function fetchChainHistory(ingredientId: string, country: string): Promise<Record<string, [string, number][]>> {
  if (country !== 'PT') return {};
  try {
    const res = await fetch(`/api/chain-prices/history?country=${country}&id=${encodeURIComponent(ingredientId)}`);
    if (!res.ok) return {};
    return ((await res.json()) as { chains?: Record<string, [string, number][]> }).chains ?? {};
  } catch {
    return {};
  }
}
