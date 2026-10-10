/**
 * Génère public/lexicon.json : dictionnaire multilingue (français, portugais, anglais) des aliments,
 * à partir de la taxonomie des ingrédients d'Open Food Facts (licence à citer : Open Food Facts).
 *
 *   npm run lexicon:build                      # télécharge la taxonomie depuis GitHub
 *   npm run lexicon:build -- --source chemin/ingredients.txt
 *
 * Les noms manquants en français ou en portugais sont complétés par scripts/lexicon-translations.csv
 * (id;portugais;français, plusieurs noms séparés par |), champ marqué "x" dans le dictionnaire pour relecture.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { INGREDIENTS } from '../src/data/ingredients';
import { buildLexicon, type Corrections, type Translations } from './lib/lexicon-build';

const URL_TAXONOMY = 'https://raw.githubusercontent.com/openfoodfacts/openfoodfacts-server/main/taxonomies/food/ingredients.txt';
const srcArg = process.argv.indexOf('--source');
const text = srcArg > 0 ? await readFile(process.argv[srcArg + 1], 'utf8') : await (await fetch(URL_TAXONOMY)).text();

const translations: Translations = {};
try {
  for (const line of (await readFile(new URL('./lexicon-translations.csv', import.meta.url), 'utf8')).split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    const [id, pt, fr, en] = line.split(';');
    const split = (s?: string) => (s?.trim() ? s.split('|').map((v) => v.trim()).filter(Boolean) : undefined);
    translations[id.trim()] = { pt: split(pt), fr: split(fr), en: split(en) };
  }
} catch {
  // pas de fichier de traductions : on garde les noms de la taxonomie
}

const corrections: Corrections = {};
try {
  for (const line of (await readFile(new URL('./lexicon-corrections.tsv', import.meta.url), 'utf8')).split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    const [id, pt, fr, en] = line.split('\t');
    const split = (s?: string) => (s?.trim() ? s.split('|').map((v) => v.trim()).filter(Boolean) : undefined);
    corrections[id.trim()] = { pt: split(pt), fr: split(fr), en: split(en) };
  }
} catch {
  // pas de corrections
}

const { entries, stats } = buildLexicon(text, { translations, corrections, ours: INGREDIENTS });
await writeFile(new URL('../public/lexicon.json', import.meta.url), JSON.stringify(entries));
console.log(stats);
