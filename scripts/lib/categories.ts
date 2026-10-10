/**
 * Rattache chaque aliment du dictionnaire à une catégorie de produits Open Food Facts
 * (ex. « blanc de poulet » → en:chicken-breasts). C'est la clé qu'Open Prices utilise
 * pour les produits sans code-barres (fruits, légumes, viande à la coupe…).
 */
import { parseTaxonomy, slug } from './taxonomy';

interface Named {
  id: string;
  en: string[];
  fr: string[];
  /** Catégorie Open Food Facts (le champ `c` est déjà pris par le code Ciqual). */
  k?: string;
}

function plurals(name: string, lang: 'en' | 'fr'): string[] {
  const out = [name];
  if (lang === 'en') {
    out.push(name + 's', name + 'es');
    if (/[^aeiou]y$/.test(name)) out.push(name.slice(0, -1) + 'ies');
  } else {
    // en français, chaque mot prend la marque du pluriel : « blanc de poulet » → « blancs de poulet »
    const [head, ...rest] = name.split(' ');
    out.push([head + 's', ...rest].join(' '), [head + 'x', ...rest].join(' '), name + 's');
  }
  return out;
}

export function categoryIndex(categoriesText: string): Map<string, string> {
  const index = new Map<string, string>();
  for (const e of parseTaxonomy(categoriesText)) {
    for (const lang of ['en', 'fr'] as const) {
      for (const n of e.names[lang] ?? []) {
        const key = `${lang}|${slug(n)}`;
        if (!index.has(key)) index.set(key, e.id);
      }
    }
  }
  return index;
}

/** Ajoute le champ `k` (catégorie Open Food Facts) aux entrées qui en ont une ; renvoie le nombre d'entrées rattachées. */
export function attachCategories<T extends Named>(entries: T[], categoriesText: string): number {
  const index = categoryIndex(categoriesText);
  let n = 0;
  for (const e of entries) {
    delete e.k;
    found: for (const lang of ['en', 'fr'] as const) {
      for (const name of e[lang] ?? []) {
        for (const form of plurals(name.toLowerCase(), lang)) {
          const cat = index.get(`${lang}|${slug(form)}`);
          if (cat) {
            e.k = cat;
            n++;
            break found;
          }
        }
      }
    }
  }
  return n;
}
