import type { Aisle, FoodTag } from '../types';

/** Une entrée du dictionnaire multilingue des aliments (public/lexicon.json). */
export interface LexEntry {
  /** Identifiant stable (nom anglais slugifié), ex. "artichoke". */
  id: string;
  en: string[];
  fr: string[];
  pt: string[];
  /** Rayon de supermarché. */
  a: Aisle;
  /** Étiquettes pour régimes et allergies (déduites des catégories parentes — indicatives). */
  t: FoodTag[];
  /** Identifiant de notre ingrédient détaillé (nutrition + prix) quand il existe. */
  o?: string;
  /** Identifiant Wikidata. */
  w?: string;
  /** Code Ciqual (table de composition française) quand il est connu. */
  c?: string;
  /** Catégorie de produits Open Food Facts (ex. "en:chicken-breasts"), clé des prix Open Prices. */
  k?: string;
  /** Langues dont le nom principal a été complété par traduction (à relire). */
  x?: ('fr' | 'pt' | 'en')[];
}
