import { getIngredient } from '../data/ingredients';
import { ALLERGENS, DIETS, EQUIPMENT, EQUIPMENT_ALTERNATIVES, SPEEDS } from '../data/reference';
import { sameFood } from './canonical';
import { isSoon, presenceOnly } from './pantry';
import type { Equipment, FoodTag, FridgeItem, Ingredient, Profile, Recipe, RecipeIngredient } from '../types';
import { costOf, quoteBasket, type BasketQuote } from './pricing';
import { baseToGrams, gramsToBase, toGrams } from './units';

export type SwapReason = 'regime' | 'allergie' | 'interdit' | 'deteste' | 'frigo' | 'manuel';

export interface AdaptedLine {
  index: number;
  original: RecipeIngredient;
  ingredient?: Ingredient;
  /** Ingrédient d'origine si on a substitué. */
  swappedFrom?: Ingredient;
  swapReason?: SwapReason;
  /** Ingrédient optionnel retiré car incompatible. */
  removed?: boolean;
  /** Incompatible et sans remplacement possible. */
  blocked?: string;
  qty: number | null; // quantité affichée (unité d'origine), mise à l'échelle
  grams: number | null;
  baseQty: number | null; // unité naturelle de l'ingrédient
  fridge: 'staple' | 'full' | 'partial' | 'none';
  /** Quantité déjà au frigo (unité naturelle). */
  fridgeHave: number;
  /** Remplacement disponible dans le frigo si l'ingrédient manque. */
  fridgeSwap?: Ingredient;
  /** Alternatives proposées par l'utilisateur (dans le détail recette). */
  alternatives: Ingredient[];
}

export interface EquipmentNote {
  missing: Equipment;
  alternative?: Equipment;
  tip?: string;
}

export interface Nutrition {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  /** Part des ingrédients reconnus (0..1) : fiabilité de l'estimation. */
  coverage: number;
  fromSource: boolean;
}

export interface Adapted {
  recipe: Recipe;
  servings: number;
  lines: AdaptedLine[];
  equipment: EquipmentNote[];
  status: 'ok' | 'adapted' | 'incompatible';
  issues: string[];
  totalMin: number | null;
  nutrition: Nutrition; // par portion
  quote: BasketQuote; // pour toute la recette
  costPerServing: number | null;
  /** Ingrédients nécessaires (hors placard/optionnels) déjà présents : 0..1 */
  fridgeCoverage: number;
  /** Produits du frigo bientôt périmés que la recette utilise. */
  expiring: string[];
  missingCount: number;
  liked: string[];
  disliked: string[];
}

export function excludedTags(profile: Profile): Map<FoodTag, SwapReason> {
  const map = new Map<FoodTag, SwapReason>();
  for (const d of profile.diets) for (const t of DIETS[d].excludes) map.set(t, 'regime');
  for (const a of profile.allergens) map.set(ALLERGENS[a].tag, 'allergie');
  return map;
}

/** Raison pour laquelle l'ingrédient ne convient pas au profil (null = ok). */
export function incompatibility(ing: Ingredient, profile: Profile, excluded = excludedTags(profile)): SwapReason | null {
  if (profile.forbidden.includes(ing.id)) return 'interdit';
  let reason: SwapReason | null = null;
  for (const t of ing.tags) {
    const r = excluded.get(t);
    if (r === 'allergie') return 'allergie';
    if (r) reason = r;
  }
  return reason;
}

function compatibleSubs(ing: Ingredient, profile: Profile, excluded: Map<FoodTag, SwapReason>): Ingredient[] {
  return (ing.subs ?? [])
    .map(getIngredient)
    .filter((s): s is Ingredient => !!s && !incompatibility(s, profile, excluded) && !profile.disliked.includes(s.id));
}

/** Quantité au frigo d'un aliment, variantes comprises (parmesan râpé pour du parmesan…). */
function fridgeQty(fridge: FridgeItem[], id: string): number {
  return fridge.filter((f) => sameFood(f.ingredientId, id)).reduce((s, f) => s + f.qty, 0);
}

export function adaptRecipe(
  recipe: Recipe,
  profile: Profile,
  fridge: FridgeItem[],
  opts: { servings?: number; swaps?: Record<number, string> } = {},
): Adapted {
  const servings = opts.servings ?? profile.household ?? recipe.servings;
  const factor = servings / recipe.servings;
  const excluded = excludedTags(profile);
  const issues: string[] = [];
  const liked = new Set<string>();
  const disliked = new Set<string>();

  const lines: AdaptedLine[] = recipe.ingredients.map((orig, index) => {
    const qty = orig.qty == null ? null : orig.qty * factor;
    let ing = getIngredient(orig.ingredientId);
    let swappedFrom: Ingredient | undefined;
    let swapReason: SwapReason | undefined;
    let removed = false;
    let blocked: string | undefined;

    const manual = opts.swaps?.[index];
    if (ing && manual && manual !== ing.id && getIngredient(manual)) {
      swappedFrom = ing;
      ing = getIngredient(manual)!;
      swapReason = 'manuel';
    } else if (ing) {
      const reason = incompatibility(ing, profile, excluded);
      const isDisliked = profile.disliked.includes(ing.id);
      if (reason || isDisliked) {
        const subs = compatibleSubs(ing, profile, excluded);
        if (subs.length) {
          // Préférence pour un remplaçant déjà au frigo.
          const pick = subs.find((s) => fridgeQty(fridge, s.id) > 0) ?? subs[0];
          swappedFrom = ing;
          ing = pick;
          swapReason = reason ?? 'deteste';
        } else if (orig.optional) {
          removed = true;
        } else if (reason) {
          blocked = `${ing.name} (${reasonLabel(reason)})`;
        } else {
          disliked.add(ing.name);
        }
      }
    }
    if (ing && profile.liked.includes(ing.id)) liked.add(ing.name);

    // Conversion des quantités (sur l'ingrédient d'origine pour garder la même "quantité utile").
    const grams = toGrams(swappedFrom ?? ing, qty, orig.unit);
    const baseQty = ing && grams != null ? gramsToBase(ing, grams) : null;

    let fridgeStatus: AdaptedLine['fridge'] = 'none';
    let fridgeSwap: Ingredient | undefined;
    let have = 0;
    if (ing) {
      if (ing.staple && profile.pantryBasics) fridgeStatus = 'staple';
      else {
        have = fridgeQty(fridge, ing.id);
        // Épices, huiles… : on en a ou pas, sans quantité.
        if (have > 0 && (presenceOnly(ing) || baseQty == null || have >= baseQty * 0.95)) fridgeStatus = 'full';
        else if (have > 0) fridgeStatus = 'partial';
        else {
          fridgeSwap = compatibleSubs(ing, profile, excluded).find((s) => fridgeQty(fridge, s.id) > 0);
        }
      }
    }

    const alternatives = ing ? compatibleSubs(swappedFrom ?? ing, profile, excluded).filter((s) => s.id !== ing!.id) : [];
    if (swappedFrom && !alternatives.some((a) => a.id === swappedFrom!.id) && !incompatibility(swappedFrom, profile, excluded)) {
      alternatives.unshift(swappedFrom);
    }

    return {
      index, original: orig, ingredient: ing, swappedFrom, swapReason, removed, blocked,
      qty, grams, baseQty, fridge: fridgeStatus, fridgeHave: have, fridgeSwap, alternatives,
    };
  });

  for (const l of lines) if (l.blocked) issues.push(`Contient ${l.blocked}`);

  // Équipement
  const equipment: EquipmentNote[] = [];
  for (const eq of recipe.equipment) {
    if (profile.equipment.includes(eq)) continue;
    // D'abord ce que la recette prévoit elle-même (« ou à la poêle »), cité tel quel.
    const own = recipe.equipmentAlt?.[eq]?.find((a) => profile.equipment.includes(a.with));
    const alt = own ? { with: own.with, tip: `D'après la recette : « ${own.tip} »` } : EQUIPMENT_ALTERNATIVES[eq]?.find((a) => profile.equipment.includes(a.with));
    equipment.push({ missing: eq, alternative: alt?.with, tip: alt?.tip });
    if (!alt) issues.push(`Nécessite : ${EQUIPMENT[eq].label}`);
  }

  const active = lines.filter((l) => !l.removed);
  const swapped = lines.some((l) => l.swappedFrom && l.swapReason !== 'manuel') || lines.some((l) => l.removed);
  const status: Adapted['status'] = issues.length ? 'incompatible' : swapped || equipment.length ? 'adapted' : 'ok';

  // Nutrition (par portion)
  let kcal = 0, protein = 0, carbs = 0, fat = 0, known = 0;
  for (const l of active) {
    if (!l.ingredient || l.grams == null || l.ingredient.partial) continue;
    known++;
    const g = l.grams / 100;
    kcal += l.ingredient.kcal * g;
    protein += l.ingredient.protein * g;
    carbs += l.ingredient.carbs * g;
    fat += l.ingredient.fat * g;
  }
  const per = (v: number) => v / servings;
  const nutrition: Nutrition = {
    kcal: recipe.sourceKcal && !swapped ? recipe.sourceKcal : per(kcal),
    protein: per(protein),
    carbs: per(carbs),
    fat: per(fat),
    coverage: active.length ? known / active.length : 0,
    fromSource: !!recipe.sourceKcal && !swapped,
  };

  const quote = quoteBasket(active.map((l) => ({ ingredientId: l.ingredient?.id, grams: l.grams })), profile);
  const costPerServing = quote.best ? quote.best.total / servings : null;

  const needed = active.filter((l) => l.ingredient && !l.original.optional && l.fridge !== 'staple');
  const have = needed.filter((l) => l.fridge === 'full').length + needed.filter((l) => l.fridge === 'partial').length * 0.5;
  const fridgeCoverage = needed.length ? have / needed.length : 0;
  const missingCount = needed.filter((l) => l.fridge === 'none' && !l.fridgeSwap).length;
  const soon = new Set(fridge.filter((f) => isSoon(f)).map((f) => f.ingredientId));
  const expiring = [...new Set(active.filter((l) => l.ingredient && [...soon].some((id) => sameFood(id, l.ingredient!.id)) && !presenceOnly(l.ingredient)).map((l) => l.ingredient!.name))];

  const totalMin = recipe.prepMin == null && recipe.cookMin == null ? null : (recipe.prepMin ?? 0) + (recipe.cookMin ?? 0);

  return {
    recipe, servings, lines, equipment, status, issues, totalMin, nutrition, quote, costPerServing,
    fridgeCoverage, expiring, missingCount, liked: [...liked], disliked: [...disliked],
  };
}

export function reasonLabel(r: SwapReason): string {
  return { regime: 'régime', allergie: 'allergie', interdit: 'interdit', deteste: 'pas aimé', frigo: 'dans ton frigo', manuel: 'ton choix' }[r];
}

/** Coût des ingrédients qu'il faut encore acheter. */
export function missingCost(a: Adapted, chainId: string | null, country: string): number {
  let total = 0;
  for (const l of a.lines) {
    if (l.removed || !l.ingredient || l.original.optional || l.grams == null) continue;
    if (l.fridge === 'full' || l.fridge === 'staple') continue;
    const remaining = l.fridge === 'partial' ? Math.max(0, l.grams - baseToGrams(l.ingredient, l.fridgeHave)) : l.grams;
    total += costOf(l.ingredient.id, remaining, chainId, country) ?? 0;
  }
  return total;
}

export interface Match {
  adapted: Adapted;
  score: number;
  reasons: string[];
}

/** Score de pertinence 0..100 pour le swipe et le tri. */
export function scoreRecipe(a: Adapted, profile: Profile): Match {
  const reasons: string[] = [];
  let score = 50;
  if (a.liked.length) {
    score += Math.min(24, a.liked.length * 8);
    reasons.push(`❤️ ${a.liked.slice(0, 2).join(', ')}`);
  }
  score -= a.disliked.length * 10;

  const maxMin = SPEEDS[profile.speed].maxMin;
  if (a.totalMin != null) {
    if (a.totalMin <= maxMin) {
      score += 10;
      if (profile.speed === 'express') reasons.push(`⚡ ${a.totalMin} min`);
    } else score -= Math.min(25, ((a.totalMin - maxMin) / 10) * 4);
  }

  if (a.costPerServing != null && profile.budgetPerServing > 0) {
    const ratio = a.costPerServing / profile.budgetPerServing;
    if (ratio <= 1) {
      score += 10 * (1 - ratio) + 5;
      if (ratio < 0.7) reasons.push('💰 Petit budget');
    } else score -= Math.min(25, (ratio - 1) * 30);
  }

  if (profile.kcalTarget && a.nutrition.kcal) {
    const diff = Math.abs(a.nutrition.kcal - profile.kcalTarget) / profile.kcalTarget;
    score += diff < 0.15 ? 6 : -Math.min(10, diff * 10);
  }

  score += a.fridgeCoverage * 25;
  // Anti-gaspi : ce qui va périmer passe en premier.
  if (a.expiring.length) {
    score += 12 * Math.min(3, a.expiring.length);
    reasons.unshift(`⏰ Utilise ${a.expiring.slice(0, 2).join(', ')} avant péremption`);
  }
  if (a.fridgeCoverage >= 0.5) reasons.push(`🧊 ${Math.round(a.fridgeCoverage * 100)} % dans ton frigo`);
  if (a.status === 'adapted') score -= 4;
  if (a.status === 'incompatible') score -= 60;

  return { adapted: a, score: Math.max(0, Math.min(100, Math.round(score))), reasons };
}

