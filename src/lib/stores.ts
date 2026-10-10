import { getChain } from '../data/reference';
import type { ChosenStore, Profile } from '../types';

/** Clé stable d'un magasin : son identifiant, ou l'enseigne pour un choix sans adresse. */
export function storeKey(s: ChosenStore): string {
  return s.id ?? `chain:${s.chainId}`;
}

export function findStore(profile: Profile, key: string): ChosenStore | undefined {
  return profile.stores.find((s) => storeKey(s) === key);
}

export function storeTitle(s: ChosenStore): string {
  const chain = getChain(s.chainId)?.name ?? '';
  return s.label && s.label !== chain ? s.label : chain;
}

/** Lien qui ouvre le magasin dans Google Maps (appli ou site), sans clé d'API. */
export function mapsLink(s: ChosenStore): string {
  const q = s.lat != null && s.lon != null ? `${s.lat},${s.lon}` : `${storeTitle(s)} ${s.address ?? ''}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

/** Panier type servant au comparatif des magasins (quantités pour un foyer, en grammes). */
export const REFERENCE_BASKET: { id: string; grams: number }[] = [
  { id: 'oeuf', grams: 6 * 55 },
  { id: 'lait', grams: 1030 },
  { id: 'beurre', grams: 250 },
  { id: 'pates', grams: 500 },
  { id: 'riz', grams: 1000 },
  { id: 'poulet', grams: 500 },
  { id: 'boeuf-hache', grams: 500 },
  { id: 'tomate', grams: 1000 },
  { id: 'oignon', grams: 1000 },
  { id: 'pomme-de-terre', grams: 2000 },
  { id: 'pomme', grams: 1000 },
  { id: 'banane', grams: 1000 },
  { id: 'emmental', grams: 200 },
  { id: 'huile-olive', grams: 920 },
  { id: 'farine', grams: 1000 },
  { id: 'yaourt', grams: 500 },
];
