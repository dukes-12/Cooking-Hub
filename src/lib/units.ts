import type { BaseUnit, Ingredient, Unit } from '../types';

const ML: Partial<Record<Unit, number>> = { ml: 1, cl: 10, l: 1000, cas: 15, cac: 5 };
const G: Partial<Record<Unit, number>> = { g: 1, kg: 1000, pincee: 0.5, botte: 50, sachet: 10 };
const PIECES: Unit[] = ['pc', 'gousse', 'tranche'];

/** Convertit une quantité de recette en grammes (null si impossible). */
export function toGrams(ing: Ingredient | undefined, qty: number | null, unit: Unit): number | null {
  if (qty == null) return null;
  if (G[unit] != null) return qty * G[unit]!;
  if (ML[unit] != null) return qty * ML[unit]! * (ing?.density ?? 1);
  if (PIECES.includes(unit)) return qty * (ing?.pieceG ?? 100);
  return null;
}

/** Quantité exprimée dans l'unité naturelle de l'ingrédient (g, ml ou pièces). */
export function gramsToBase(ing: Ingredient, grams: number): number {
  if (ing.unit === 'ml') return grams / (ing.density ?? 1);
  if (ing.unit === 'pc') return grams / (ing.pieceG ?? 100);
  return grams;
}

export function baseToGrams(ing: Ingredient, qty: number): number {
  if (ing.unit === 'ml') return qty * (ing.density ?? 1);
  if (ing.unit === 'pc') return qty * (ing.pieceG ?? 100);
  return qty;
}

const UNIT_LABEL: Record<Unit, [string, string]> = {
  g: ['g', 'g'],
  kg: ['kg', 'kg'],
  ml: ['ml', 'ml'],
  cl: ['cl', 'cl'],
  l: ['L', 'L'],
  cas: ['c. à soupe', 'c. à soupe'],
  cac: ['c. à café', 'c. à café'],
  pincee: ['pincée', 'pincées'],
  gousse: ['gousse', 'gousses'],
  tranche: ['tranche', 'tranches'],
  botte: ['botte', 'bottes'],
  sachet: ['sachet', 'sachets'],
  pc: ['', ''],
};

export function fmtNumber(n: number): string {
  if (n >= 100) return String(Math.round(n / 5) * 5);
  if (n >= 10) return String(Math.round(n));
  const fractions: [number, string][] = [[0.25, '¼'], [0.5, '½'], [0.75, '¾'], [0.33, '⅓'], [0.66, '⅔']];
  const whole = Math.floor(n);
  const rest = n - whole;
  for (const [v, s] of fractions) if (Math.abs(rest - v) < 0.04) return (whole ? whole : '') + s;
  return String(Math.round(n * 10) / 10).replace('.', ',');
}

export function fmtQty(qty: number | null, unit: Unit): string {
  if (qty == null) return '';
  // Bascule automatique vers kg / L pour les grosses quantités.
  if (unit === 'g' && qty >= 1000) return `${fmtNumber(qty / 1000)} kg`;
  if (unit === 'ml' && qty >= 1000) return `${fmtNumber(qty / 1000)} L`;
  const [one, many] = UNIT_LABEL[unit];
  const label = qty > 1 ? many : one;
  return label ? `${fmtNumber(qty)} ${label}` : fmtNumber(qty);
}

export function fmtBase(qty: number | null, unit: BaseUnit | null): string {
  if (qty == null || unit == null) return '';
  return fmtQty(qty, unit);
}

/** Arrondi "courses" : pièces entières, grammes/ml par paliers. */
export function roundForShopping(qty: number, unit: BaseUnit): number {
  if (unit === 'pc') return Math.max(1, Math.ceil(qty - 0.05));
  if (qty < 20) return Math.ceil(qty);
  if (qty < 200) return Math.ceil(qty / 10) * 10;
  return Math.ceil(qty / 50) * 50;
}
