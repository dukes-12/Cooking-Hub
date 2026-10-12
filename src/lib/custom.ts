import { customIngredients, getIngredient } from '../data/ingredients';
import type { Aisle, BaseUnit, Ingredient, NutritionDetails } from '../types';
import { normalize, uid } from './text';

/** Clé d'un libellé de ticket, sans le format : « MISTURA CEBOLA/ALHO CNT FRS 40G » → « mistura cebola alho cnt frs ». */
export function labelKey(label: string): string {
  return normalize(label.replace(/\d+([.,]\d+)?\s*(x\s*\d+([.,]\d+)?\s*)?(kg|gr?|l|cl|ml|un|uni|und)?\b/gi, ' ')).replace(/[^a-z0-9]+/g, ' ').replace(/\b(kg|gr?|l|cl|ml|un|uni|und)\b/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Nom lisible proposé pour un nouveau produit à partir du libellé du ticket. */
export function nameFromLabel(label: string): string {
  const t = label.replace(/\d+([.,]\d+)?\s*(x\s*\d+([.,]\d+)?\s*)?(kg|gr?|l|cl|ml)\b/gi, ' ').replace(/[/_]+/g, ' / ').replace(/\s+/g, ' ').trim().toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export interface Nutrition {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

/**
 * Crée un produit personnel. Rattaché à une grande famille (ex. « Herbes de Provence »), il en reprend
 * le rayon, l'unité, les valeurs nutritionnelles, les étiquettes de régime et le prix de référence.
 * Les valeurs nutritionnelles du paquet (pour 100 g), si on les donne, remplacent celles de la famille.
 */
export function makeCustomProduct({ name, aisle, unit, familyId, label, barcode, image, packQty, nutrition, details, nutriscore, nova }: { name: string; aisle: Aisle; unit: BaseUnit; familyId?: string; label?: string; barcode?: string; image?: string; packQty?: number; nutrition?: Nutrition; details?: NutritionDetails; nutriscore?: Ingredient['nutriscore']; nova?: number }): Ingredient {
  const fam = familyId ? getIngredient(familyId) : undefined;
  const base = {
    id: `mine:${normalize(name).replace(/\s+/g, '-').slice(0, 40)}-${uid().slice(-4)}`,
    name: name.trim(),
    aliases: [...new Set([name, label].filter((x): x is string => !!x?.trim()))],
    custom: true as const,
    ...(barcode ? { barcode } : {}),
    ...(image ? { image } : {}),
    ...(packQty ? { packQty } : {}),
    ...(details && Object.keys(details).length ? { details } : {}),
    ...(nutriscore ? { nutriscore } : {}),
    ...(nova ? { nova } : {}),
  };
  if (fam) {
    return { ...fam, ...base, aisle: fam.aisle, unit: fam.unit, family: fam.id, subs: [fam.id, ...(fam.subs ?? [])], staple: fam.staple, ...(nutrition ?? {}), partial: !!fam.partial && !nutrition };
  }
  return { ...base, aisle, unit, kcal: 0, protein: 0, carbs: 0, fat: 0, pricePerKg: 0, tags: [], ...(nutrition ?? {}), partial: !nutrition };
}

/** Mon produit portant ce code-barres. */
export function customByBarcode(code: string): Ingredient | undefined {
  const c = code.replace(/\D/g, '');
  return c ? customIngredients().find((i) => i.barcode === c) : undefined;
}

/** Produit personnel dont un nom apparaît dans le libellé (le plus long d'abord). */
export function matchCustom(label: string): string | undefined {
  const n = ` ${normalize(label)} `;
  const k = labelKey(label);
  let best: { id: string; len: number } | undefined;
  for (const ing of customIngredients()) {
    for (const a of ing.aliases.map(normalize)) {
      if (!a) continue;
      if ((n.includes(` ${a} `) || labelKey(a) === k) && (!best || a.length > best.len)) best = { id: ing.id, len: a.length };
    }
  }
  return best?.id;
}
