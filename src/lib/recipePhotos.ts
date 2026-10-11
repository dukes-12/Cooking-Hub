import { useEffect, useState } from 'react';
import { deletePhoto, photoUrl, savePhoto, usePhotoVersion } from './photoStore';
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

// ---------- 1. Mes photos (IndexedDB, voir photoStore.ts) ----------

export const saveRecipePhoto = (recipeId: string, file: File) => savePhoto('recipes', recipeId, file);
export const deleteRecipePhoto = (recipeId: string) => deletePhoto('recipes', recipeId);

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
  const v = usePhotoVersion();
  const [photo, setPhoto] = useState<RecipePhoto | null>(recipe.image ? { url: recipe.image, kind: 'source' } : null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const mine = await photoUrl('recipes', recipe.id);
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
