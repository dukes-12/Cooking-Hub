/**
 * Import en masse : lit une liste d'URLs de recettes et génère public/catalog.json,
 * chargé par l'app au démarrage (en plus des recettes de démo).
 *
 *   npm run recipes:import -- scripts/recipe-urls.txt
 *
 * Une URL par ligne ; les lignes vides et celles commençant par # sont ignorées.
 * Les recettes déjà présentes dans le catalogue (même URL) ne sont pas re-téléchargées.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fromSchemaRecipe } from '../src/lib/importer';
import type { Recipe } from '../src/types';
// @ts-expect-error module JS partagé avec le serveur
import { importFromUrl } from '../server/core.mjs';

const CATALOG = new URL('../public/catalog.json', import.meta.url);
const listPath = process.argv[2] ?? 'scripts/recipe-urls.txt';

function slug(url: string): string {
  const u = new URL(url);
  const last = u.pathname.split('/').filter(Boolean).pop() ?? 'recette';
  return `web-${u.hostname.replace(/^www\./, '').split('.')[0]}-${last.replace(/\.[a-z]+$/, '').replace(/[^a-z0-9-]+/gi, '-').toLowerCase().slice(0, 60)}`;
}

const urls = (await readFile(listPath, 'utf8'))
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'));

let catalog: Recipe[] = [];
try {
  catalog = JSON.parse(await readFile(CATALOG, 'utf8'));
} catch {
  // premier import
}
const known = new Set(catalog.map((r) => r.source?.url));

let added = 0;
for (const url of urls) {
  if (known.has(url)) continue;
  const { status, body } = await importFromUrl(url);
  if (status !== 200) {
    console.warn(`✗ ${url} — ${body.error}`);
    continue;
  }
  const recipe = fromSchemaRecipe(body.recipe, url, body.siteName);
  recipe.id = slug(url);
  recipe.imported = false;
  const unknown = recipe.ingredients.filter((i) => !i.ingredientId).length;
  catalog.push(recipe);
  known.add(url);
  added++;
  console.log(`✓ ${recipe.title} (${recipe.ingredients.length} ingr., ${unknown} non reconnus)`);
  await new Promise((r) => setTimeout(r, 1500)); // politesse envers les sites
}

await writeFile(CATALOG, JSON.stringify(catalog, null, 1));
console.log(`\n${added} recette(s) ajoutée(s), ${catalog.length} au total dans public/catalog.json`);
