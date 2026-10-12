/** Open Food Facts (licence ODbL, photos CC BY-SA) via notre serveur, qui ajoute le User-Agent et met en cache. */

export interface OffProduct {
  code: string;
  name: string;
  brands: string;
  quantity: string;
  qty: number | null;
  qtyUnit: string | null;
  image: string | null;
  nutriscore: 'a' | 'b' | 'c' | 'd' | 'e' | null;
  categories: string[];
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  satFat?: number | null;
  sugars?: number | null;
  fiber?: number | null;
  salt?: number | null;
  nova?: number | null;
}

export const offProductUrl = (code: string) => `https://world.openfoodfacts.org/product/${code}`;

const categoryCache = new Map<string, Promise<OffProduct[]>>();

/** Produits les plus scannés d'une catégorie (dans le pays si possible). */
export function fetchCategoryProducts(cat: string, country: string): Promise<OffProduct[]> {
  const key = `${country}|${cat}`;
  if (!categoryCache.has(key)) {
    categoryCache.set(
      key,
      fetch(`/api/off/category?cat=${encodeURIComponent(cat)}&country=${country}`)
        .then((r) => (r.ok ? r.json() : { products: [] }))
        .then((d: { products?: OffProduct[] }) => d.products ?? [])
        .catch(() => {
          categoryCache.delete(key);
          return [];
        }),
    );
  }
  return categoryCache.get(key)!;
}

/** Fiche d'un produit par son code-barres. */
export async function fetchProductByCode(code: string): Promise<OffProduct> {
  const res = await fetch(`/api/off/product?code=${encodeURIComponent(code)}`);
  const data = (await res.json().catch(() => ({}))) as { product?: OffProduct; error?: string };
  if (!res.ok || !data.product) throw new Error(data.error ?? `Open Food Facts indisponible (${res.status}).`);
  return data.product;
}

function med(values: (number | null)[]): number | null {
  const v = values.filter((x): x is number => x != null).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** Valeurs nutritionnelles médianes (pour 100 g) d'une liste de produits. */
export function medianNutrition(products: OffProduct[]): { kcal: number; protein: number; carbs: number; fat: number; n: number } | null {
  const withKcal = products.filter((p) => p.kcal != null);
  if (withKcal.length < 2) return null;
  const r = (x: number | null) => Math.round((x ?? 0) * 10) / 10;
  return { kcal: Math.round(med(withKcal.map((p) => p.kcal))!), protein: r(med(withKcal.map((p) => p.protein))), carbs: r(med(withKcal.map((p) => p.carbs))), fat: r(med(withKcal.map((p) => p.fat))), n: withKcal.length };
}
