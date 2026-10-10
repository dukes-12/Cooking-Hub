/**
 * Ajoute à public/lexicon.json la catégorie Open Food Facts de chaque aliment (champ "k"),
 * utilisée pour interroger Open Prices.
 *
 *   npm run lexicon:categories
 *   npm run lexicon:categories -- --source chemin/categories.txt
 */
import { readFile, writeFile } from 'node:fs/promises';
import { attachCategories } from './lib/categories';

const URL_CATEGORIES = 'https://raw.githubusercontent.com/openfoodfacts/openfoodfacts-server/main/taxonomies/food/categories.txt';
const srcArg = process.argv.indexOf('--source');
const text = srcArg > 0 ? await readFile(process.argv[srcArg + 1], 'utf8') : await (await fetch(URL_CATEGORIES)).text();
const file = new URL('../public/lexicon.json', import.meta.url);
const entries = JSON.parse(await readFile(file, 'utf8'));
const n = attachCategories(entries, text);
await writeFile(file, JSON.stringify(entries));
console.log(`${n} / ${entries.length} aliments rattachés à une catégorie Open Food Facts`);
