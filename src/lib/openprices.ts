import { useSyncExternalStore } from 'react';
import { getIngredient } from '../data/ingredients';
import { getChain, getCountry } from '../data/reference';
import { matchChain } from './geo';
import { entryForCategory, entryForProduct, ingredientFromEntry } from './lexicon';
import { median } from './receipts';

/**
 * Prix de la communauté Open Prices (Open Food Facts, licence ODbL), via notre serveur (/api/prices).
 * Les relevés sont gardés sur l'appareil 3 jours ; les médianes servent de source de prix entre
 * tes tickets (prioritaires) et les estimations.
 */

export interface CommunityPrice {
  perKg: number | null;
  unit: number | null;
  currency: string;
  date: string;
  brand: string;
  city: string;
  lat: number | null;
  lon: number | null;
}

/** Corrections pour nos ingrédients que le rapprochement automatique classe mal. */
const CATEGORY_OVERRIDES: Record<string, string> = {
  pomme: 'en:apples',
  emmental: 'en:emmentaler',
  creme: 'en:creams',
  cacahuete: 'en:peanuts',
  poivre: 'en:black-peppers',
  vanille: 'en:vanilla-pods',
  salade: 'en:lettuces',
  nouilles: 'en:noodles',
  'pois-chiches': 'en:chickpeas',
  'pate-feuilletee': 'en:puff-pastry-sheets',
  'boeuf-hache': 'en:ground-meats',
  'proteines-soja': 'en:textured-soy-protein',
};

/** Catégorie Open Food Facts d'un ingrédient de l'appli, si on la connaît. */
export function categoryFor(ingredientId: string): string | undefined {
  // Produit personnel : la catégorie de sa grande famille.
  if (ingredientId.startsWith('mine:')) {
    const family = getIngredient(ingredientId)?.family;
    return family ? categoryFor(family) : undefined;
  }
  return CATEGORY_OVERRIDES[ingredientId] ?? entryForProduct(ingredientId)?.k;
}

/** Ingrédient de l'appli correspondant aux catégories d'un produit Open Food Facts (de la plus précise à la plus large). */
export function ingredientForCategories(tags: string[]): string | undefined {
  const reverse = Object.entries(CATEGORY_OVERRIDES);
  for (const tag of [...tags].reverse()) {
    const own = reverse.find(([, c]) => c === tag)?.[0];
    if (own) return own;
    const e = entryForCategory(tag);
    if (e) return ingredientFromEntry(e).id;
  }
  return undefined;
}

// ---------- Cache local + chargement ----------

const STORE_KEY = 'cooking-hub:openprices';
const TTL = 3 * 86400000;
type Entry = { at: number; items: CommunityPrice[] };
let cache: Record<string, Entry> = {};
try {
  cache = JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}');
} catch {
  cache = {};
}
let version = 0;
const listeners = new Set<() => void>();
const inflight = new Map<string, Promise<void>>();
let saveTimer: ReturnType<typeof setTimeout> | undefined;

function changed() {
  version++;
  listeners.forEach((l) => l());
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(cache));
    } catch {
      // stockage plein ou indisponible : le cache reste en mémoire
    }
  }, 500);
}

const keyOf = (cat: string, country: string) => `${country}|${cat}`;

/** Pour les tests : remplace les relevés d'une catégorie. */
export function setCommunityPrices(cat: string, country: string, items: CommunityPrice[]) {
  cache[keyOf(cat, country)] = { at: Date.now(), items };
  changed();
}

function fetchCategory(cat: string, country: string): Promise<void> {
  const key = keyOf(cat, country);
  const hit = cache[key];
  if (hit && Date.now() - hit.at < TTL) return Promise.resolve();
  if (!inflight.has(key)) {
    const currency = getCountry(country).currency;
    inflight.set(
      key,
      fetch(`/api/prices?cat=${encodeURIComponent(cat)}&country=${country}&currency=${currency}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((data: { items?: CommunityPrice[] }) => {
          cache[key] = { at: Date.now(), items: data.items ?? [] };
          changed();
        })
        .catch(() => {
          // hors-ligne ou service indisponible : on garde les estimations
        })
        .finally(() => inflight.delete(key)),
    );
  }
  return inflight.get(key)!;
}

/** Charge (en arrière-plan, 3 requêtes à la fois) les prix communautaires des ingrédients donnés. */
export async function loadCommunityPrices(ingredientIds: string[], country: string): Promise<void> {
  const cats = [...new Set(ingredientIds.map(categoryFor).filter((c): c is string => !!c))];
  const queue = [...cats];
  const worker = async () => {
    while (queue.length) await fetchCategory(queue.shift()!, country);
  };
  await Promise.all([worker(), worker(), worker()]);
}

/** Re-rendu des écrans quand de nouveaux prix communautaires arrivent. */
export function useCommunityPrices(): number {
  return useSyncExternalStore(
    (cb) => (listeners.add(cb), () => listeners.delete(cb)),
    () => version,
  );
}

// ---------- Statistiques ----------

export interface CommunityStats {
  /** Médiane du pays (prix au kilo ou au litre). */
  perKg: number | null;
  /** Prix médian à l'unité (fruits vendus à la pièce, etc.). */
  unit: number | null;
  count: number;
  byChain: { chainId: string; perKg: number; count: number }[];
  lastDate: string | null;
}

export function communityItems(ingredientId: string, country: string): CommunityPrice[] {
  const cat = categoryFor(ingredientId);
  return cat ? (cache[keyOf(cat, country)]?.items ?? []) : [];
}

/** Retire les relevés aberrants (hors de [médiane / 3 ; médiane × 3]). */
function trimmed(values: number[]): number[] {
  const m = median(values);
  return m == null ? [] : values.filter((v) => v >= m / 3 && v <= m * 3);
}

export function communityStats(ingredientId: string, country: string): CommunityStats | null {
  const items = communityItems(ingredientId, country);
  if (!items.length) return null;
  const perKgValues = trimmed(items.filter((p) => p.perKg != null).map((p) => p.perKg!));
  const groups = new Map<string, number[]>();
  for (const p of items) {
    if (p.perKg == null || !perKgValues.includes(p.perKg)) continue;
    const chain = p.brand ? matchChain(p.brand, country) : undefined;
    if (chain) groups.set(chain.id, [...(groups.get(chain.id) ?? []), p.perKg]);
  }
  return {
    perKg: median(perKgValues),
    unit: median(trimmed(items.filter((p) => p.unit != null && p.perKg == null).map((p) => p.unit!))),
    count: items.length,
    byChain: [...groups].map(([chainId, v]) => ({ chainId, perKg: median(v)!, count: v.length })).sort((a, b) => a.perKg - b.perKg),
    lastDate: items.map((p) => p.date).sort().at(-1) ?? null,
  };
}

/**
 * Prix au kilo issu d'Open Prices pour une enseigne : médiane de l'enseigne (au moins 2 relevés),
 * sinon médiane du pays (au moins 3 relevés) ajustée par l'indice de l'enseigne.
 */
export function communityPricePerKg(ingredientId: string, chainId: string | null, country: string): { value: number; level: 'chain' | 'country' } | null {
  const ing = getIngredient(ingredientId);
  if (!ing) return null;
  const s = communityStats(ingredientId, country);
  if (!s) return null;
  const mine = chainId ? s.byChain.find((c) => c.chainId === chainId) : undefined;
  if (mine && mine.count >= 2) return { value: mine.perKg, level: 'chain' };
  const n = s.perKg != null ? communityItems(ingredientId, country).filter((p) => p.perKg != null).length : 0;
  if (s.perKg != null && n >= 3) return { value: s.perKg * (chainId ? (getChain(chainId)?.index ?? 1) : 1), level: 'country' };
  return null;
}

export interface BarcodePrice {
  chainId?: string;
  brand: string;
  /** Prix du paquet (ou au kilo quand le relevé est au poids). */
  price: number;
  perKg: boolean;
  date: string;
  count: number;
}

/** Prix relevés par la communauté pour un produit exact (code-barres) : le plus récent par enseigne. */
export async function fetchBarcodePrices(code: string, country: string): Promise<BarcodePrice[]> {
  const currency = getCountry(country).currency;
  const res = await fetch(`/api/prices?code=${encodeURIComponent(code)}&country=${country}&currency=${currency}`);
  if (!res.ok) return [];
  const items = ((await res.json()) as { items?: CommunityPrice[] }).items ?? [];
  const groups = new Map<string, BarcodePrice>();
  for (const p of [...items].sort((a, b) => b.date.localeCompare(a.date))) {
    const price = p.unit ?? p.perKg;
    if (price == null) continue;
    const chain = p.brand ? matchChain(p.brand, country) : undefined;
    const key = chain?.id ?? (p.brand.toLowerCase() || '?');
    const g = groups.get(key);
    if (g) g.count++;
    else groups.set(key, { chainId: chain?.id, brand: chain?.name ?? (p.brand || 'Magasin inconnu'), price, perKg: p.unit == null, date: p.date, count: 1 });
  }
  return [...groups.values()].sort((a, b) => a.price - b.price);
}
