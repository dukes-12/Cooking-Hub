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

export function chainPricesUpdatedAt(country: string): string | null {
  return data[country]?.updatedAt ?? null;
}
