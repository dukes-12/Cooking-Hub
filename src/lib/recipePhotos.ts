import { useEffect, useState, useSyncExternalStore } from 'react';
import { SEED_RECIPES } from '../data/recipes';
import type { Recipe } from '../types';

const SEED_IDS = new Set(SEED_RECIPES.map((r) => r.id));
import { productImage } from './images';
import { normalize } from './text';

/**
 * Photos des recettes, par ordre de priorité :
 *  1. ta propre photo (prise ou choisie dans l'appli, gardée sur l'appareil dans IndexedDB) ;
 *  2. la photo fournie par le site d'origine (recettes importées ou récoltées) ;
 *  3. une photo libre de droits du plat sur Wikimedia Commons (via Wikidata), pour les plats connus ;
 *  4. pour les recettes de l'appli, une illustration générée par IA (Workers AI, gardée sur le serveur) ;
 *  5. sinon, l'émoji de la recette.
 */
export interface RecipePhoto {
  url: string;
  kind: 'mine' | 'source' | 'wiki' | 'ai';
  credit?: string;
}

// ---------- 1. Mes photos (IndexedDB) ----------

const DB = 'cooking-hub-photos';
const STORE = 'recipes';
let version = 0;
const listeners = new Set<() => void>();
const urls = new Map<string, string | null>();

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const req = fn(d.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function changed(id: string) {
  const old = urls.get(id);
  if (old) URL.revokeObjectURL(old);
  urls.delete(id);
  version++;
  listeners.forEach((l) => l());
}

/** Réduit la photo (1200 px, JPEG) et la garde pour cette recette. */
export async function saveRecipePhoto(recipeId: string, file: File): Promise<void> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Photo illisible'))), 'image/jpeg', 0.85));
  await tx('readwrite', (s) => s.put(blob, recipeId));
  changed(recipeId);
}

export async function deleteRecipePhoto(recipeId: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(recipeId));
  changed(recipeId);
}

async function myPhotoUrl(recipeId: string): Promise<string | null> {
  if (urls.has(recipeId)) return urls.get(recipeId)!;
  try {
    const blob = await tx<Blob | undefined>('readonly', (s) => s.get(recipeId));
    const url = blob ? URL.createObjectURL(blob) : null;
    urls.set(recipeId, url);
    return url;
  } catch {
    return null; // IndexedDB indisponible (navigation privée…)
  }
}

// ---------- 3. Photo du plat sur Wikimedia Commons ----------

const DISH_KEY = 'cooking-hub:dish-images';
const dishMemory = new Map<string, Promise<RecipePhoto | null>>();

function readDishCache(): Record<string, RecipePhoto | null> {
  try {
    return JSON.parse(localStorage.getItem(DISH_KEY) ?? '{}');
  } catch {
    return {};
  }
}

/** Nom du plat sans précision entre parenthèses : « Arroz doce (riz au lait portugais) » → « Arroz doce ». */
export function dishName(title: string): string {
  return title.replace(/\s*\(.*?\)\s*/g, ' ').trim();
}

/** Élément Wikidata dont le nom (ou un alias) est exactement celui du plat, dans une des trois langues. */
async function findDish(title: string): Promise<string | null> {
  const wanted = normalize(dishName(title));
  for (const lang of ['fr', 'pt', 'en']) {
    const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(dishName(title))}&language=${lang}&uselang=${lang}&type=item&limit=5&format=json&origin=*`;
    const data = await fetch(url).then((r) => (r.ok ? r.json() : null));
    const hit = (data?.search ?? []).find((s: { match?: { text?: string } }) => normalize(s.match?.text ?? '') === wanted);
    if (hit) return hit.id as string;
  }
  return null;
}

function dishPhoto(title: string): Promise<RecipePhoto | null> {
  const key = normalize(dishName(title));
  const cached = readDishCache();
  if (key in cached) return Promise.resolve(cached[key]);
  if (!dishMemory.has(key)) {
    dishMemory.set(
      key,
      findDish(title)
        .then(async (id) => {
          const img = id ? await productImage(id) : null;
          const photo: RecipePhoto | null = img ? { url: img.url, credit: img.credit, kind: 'wiki' } : null;
          try {
            localStorage.setItem(DISH_KEY, JSON.stringify({ ...readDishCache(), [key]: photo }));
          } catch {
            // stockage indisponible
          }
          return photo;
        })
        .catch(() => null), // hors-ligne : on réessaiera plus tard
    );
  }
  return dishMemory.get(key)!;
}

// ---------- Choix de la photo ----------

export function useRecipePhoto(recipe: Recipe): RecipePhoto | null {
  const v = useSyncExternalStore(
    (cb) => (listeners.add(cb), () => listeners.delete(cb)),
    () => version,
  );
  const [photo, setPhoto] = useState<RecipePhoto | null>(recipe.image ? { url: recipe.image, kind: 'source' } : null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const mine = await myPhotoUrl(recipe.id);
      if (!alive) return;
      if (mine) return setPhoto({ url: mine, kind: 'mine' });
      if (recipe.image) return setPhoto({ url: recipe.image, kind: 'source' });
      const wiki = await dishPhoto(recipe.title);
      if (!alive) return;
      // Recette inventée sans photo connue : illustration générée une fois par le serveur.
      setPhoto(wiki ?? (SEED_IDS.has(recipe.id) ? { url: `/api/recipe-image/${recipe.id}`, kind: 'ai' } : null));
    })();
    return () => {
      alive = false;
    };
  }, [recipe.id, recipe.image, recipe.title, v]);
  return photo;
}
