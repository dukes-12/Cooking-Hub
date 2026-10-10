import { useSyncExternalStore } from 'react';
import { INGREDIENT_BY_ID, registerLexiconResolver } from '../data/ingredients';
import type { Ingredient } from '../types';
import type { LexEntry } from './lexicon-types';
import { normalize } from './text';

export type Lang = 'fr' | 'pt' | 'en';
const LANGS: Lang[] = ['fr', 'pt', 'en'];

let entries: LexEntry[] = [];
const byId = new Map<string, LexEntry>();
/** nom normalisé → entrées ; les noms français passent avant les portugais, puis anglais. */
const byName = new Map<string, LexEntry[]>();
let ready = false;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

/** Remplace le dictionnaire (chargement réseau ou tests). */
export function setLexicon(list: LexEntry[]) {
  entries = list;
  byId.clear();
  byName.clear();
  for (const e of list) byId.set(e.id, e);
  for (const lang of LANGS) {
    for (const e of list) {
      for (const name of e[lang]) {
        const key = normalize(name);
        if (!key) continue;
        for (const k of new Set([key, singular(key)])) {
          const bucket = byName.get(k) ?? [];
          if (!bucket.includes(e)) bucket.push(e);
          byName.set(k, bucket);
        }
      }
    }
  }
  ready = true;
  listeners.forEach((l) => l());
}

registerLexiconResolver((slug) => {
  const e = byId.get(slug);
  return e ? ingredientFromEntry(e) : undefined;
});

export function loadLexicon(): Promise<void> {
  if (!loading) {
    loading = fetch('/lexicon.json')
      .then((r) => (r.ok ? r.json() : []))
      .then((list: LexEntry[]) => {
        if (Array.isArray(list) && list.length) setLexicon(list);
      })
      .catch(() => {
        loading = null; // on retentera au prochain besoin (hors-ligne)
      });
  }
  return loading;
}

export function useLexiconReady(): boolean {
  return useSyncExternalStore(
    (cb) => (listeners.add(cb), () => listeners.delete(cb)),
    () => ready,
  );
}

export function lexiconSize(): number {
  return entries.length;
}

/** Nom d'affichage dans la langue demandée (repli : français, anglais, portugais). */
export function lexName(e: LexEntry, lang: Lang = 'fr'): string {
  const name = e[lang][0] ?? e.fr[0] ?? e.en[0] ?? e.pt[0] ?? e.id;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** "batatas doces" → "batata doce" : chaque mot perd son s / x final (pluriels français et portugais). */
function singular(key: string): string {
  return key
    .split(' ')
    .map((w) => (w.length > 3 ? w.replace(/[sx]$/, '') : w))
    .join(' ');
}

export function exactLookup(text: string): LexEntry | undefined {
  const key = normalize(text);
  for (const v of new Set([key, singular(key)])) {
    const hit = byName.get(v)?.[0];
    if (hit) return hit;
  }
  return undefined;
}

/** Cherche le plus long nom du dictionnaire contenu dans une ligne ("2 artichauts violets" → artichaut). */
export function findInText(text: string): LexEntry | undefined {
  return findInTextDetailed(text)?.entry;
}

export function findInTextDetailed(text: string): { entry: LexEntry; words: number } | undefined {
  if (!ready) return undefined;
  const words = normalize(text).split(' ').filter(Boolean);
  for (let len = Math.min(5, words.length); len >= 1; len--) {
    for (let start = 0; start + len <= words.length; start++) {
      const gram = words.slice(start, start + len).join(' ');
      if (len === 1 && gram.length < 4) continue; // évite "ail", "riz" parasites : ceux-là sont déjà dans nos alias
      const hit = exactLookup(gram);
      if (hit) return { entry: hit, words: len };
    }
  }
  return undefined;
}

export function searchLexicon(query: string, limit = 8): LexEntry[] {
  const q = normalize(query);
  if (!ready || q.length < 2) return [];
  const scored: [number, LexEntry][] = [];
  for (const e of entries) {
    let best = 9;
    for (const lang of LANGS) {
      for (const name of e[lang]) {
        const n = normalize(name);
        if (n === q) best = Math.min(best, 0);
        else if (n.startsWith(q)) best = Math.min(best, 1);
        else if (n.includes(` ${q}`) || n.includes(q)) best = Math.min(best, 2 + Math.min(n.length, 40) / 100);
      }
    }
    if (best < 9) scored.push([best, e]);
  }
  const seen = new Set<string>();
  return scored
    .sort((a, b) => a[0] - b[0] || lexName(a[1]).length - lexName(b[1]).length)
    .filter(([, e]) => {
      const key = normalize(lexName(e)); // "artichaut" et "artichaut globe" ne s'affichent qu'une fois
      return seen.has(key) ? false : (seen.add(key), true);
    })
    .slice(0, limit)
    .map((s) => s[1]);
}

/** Ingrédient utilisable dans l'app : le nôtre s'il existe (nutrition + prix), sinon une version partielle. */
export function ingredientFromEntry(e: LexEntry): Ingredient {
  const own = e.o ? INGREDIENT_BY_ID[e.o] : undefined;
  if (own) return own;
  return {
    id: `lex:${e.id}`,
    name: lexName(e, 'fr'),
    // Les noms portugais et anglais d'abord : le sélecteur les affiche à côté du nom français.
    aliases: [...new Set([e.pt[0], e.en[0], ...e.fr, ...e.pt, ...e.en].filter(Boolean))],
    aisle: e.a,
    unit: 'g',
    kcal: 0, protein: 0, carbs: 0, fat: 0, pricePerKg: 0,
    tags: e.t,
    partial: true,
  };
}
