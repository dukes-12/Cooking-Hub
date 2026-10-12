import { AISLE_LABELS, getIngredient } from '../data/ingredients';
import type { FridgeItem, PlannedMeal, Profile, Recipe, ShoppingItem } from '../types';
import { adaptRecipe } from './adapt';
import { sameFood } from './canonical';
import { presenceOnly } from './pantry';
import { roundForShopping } from './units';

/**
 * Génère la liste de courses à partir du menu : agrège les ingrédients (après adaptation au profil),
 * déduit ce qui est déjà dans le frigo et le placard, et conserve les articles ajoutés à la main.
 */
export function buildShoppingList(
  menu: PlannedMeal[],
  recipes: Record<string, Recipe>,
  profile: Profile,
  fridge: FridgeItem[],
  previous: ShoppingItem[],
): ShoppingItem[] {
  const acc = new Map<string, ShoppingItem>();

  for (const meal of menu) {
    const recipe = recipes[meal.recipeId];
    if (!recipe) continue;
    // Le frigo est déduit globalement plus bas, pas recette par recette.
    const adapted = adaptRecipe(recipe, profile, [], { servings: meal.servings });
    for (const l of adapted.lines) {
      if (l.removed || l.original.optional) continue;
      const ing = l.ingredient;
      if (ing?.staple && profile.pantryBasics) continue;
      const key = ing ? ing.id : `raw:${l.original.name.toLowerCase()}`;
      const cur = acc.get(key) ?? {
        key,
        ingredientId: ing?.id,
        name: ing?.name ?? l.original.name,
        qty: ing ? 0 : null,
        unit: ing?.unit ?? null,
        aisle: ing?.aisle ?? 'divers',
        checked: false,
        fromRecipes: [],
      };
      if (cur.qty != null && l.baseQty != null) cur.qty += l.baseQty;
      if (!cur.fromRecipes.includes(recipe.title)) cur.fromRecipes.push(recipe.title);
      acc.set(key, cur);
    }
  }

  const items: ShoppingItem[] = [];
  for (const it of acc.values()) {
    if (it.ingredientId && it.qty != null && it.unit) {
      const have = fridge.filter((f) => sameFood(f.ingredientId, it.ingredientId!)).reduce((s, f) => s + f.qty, 0);
      if (have > 0 && presenceOnly(getIngredient(it.ingredientId))) continue;
      const need = it.qty - have;
      if (need <= (it.unit === 'pc' ? 0.2 : it.qty * 0.05)) continue;
      it.qty = roundForShopping(need, it.unit);
    }
    const prev = previous.find((p) => p.key === it.key);
    items.push({ ...it, checked: prev?.checked ?? false });
  }
  for (const p of previous) if (p.manual && !items.some((i) => i.key === p.key)) items.push(p);
  return sortByAisle(items);
}

export function sortByAisle(items: ShoppingItem[]): ShoppingItem[] {
  return [...items].sort(
    (a, b) => AISLE_LABELS[a.aisle].order - AISLE_LABELS[b.aisle].order || a.name.localeCompare(b.name, 'fr'),
  );
}

export function groupByAisle(items: ShoppingItem[]) {
  const groups = new Map<string, ShoppingItem[]>();
  for (const it of sortByAisle(items)) {
    const list = groups.get(it.aisle) ?? [];
    list.push(it);
    groups.set(it.aisle, list);
  }
  return [...groups.entries()].map(([aisle, list]) => ({ aisle: aisle as ShoppingItem['aisle'], ...AISLE_LABELS[aisle as ShoppingItem['aisle']], items: list }));
}

export function manualItem(name: string, ingredientId?: string): ShoppingItem {
  const ing = getIngredient(ingredientId);
  return {
    key: ing ? ing.id : `manual:${name.toLowerCase()}`,
    ingredientId: ing?.id,
    name: ing?.name ?? name,
    qty: ing ? (ing.unit === 'pc' ? 1 : ing.unit === 'ml' ? 1000 : 500) : null,
    unit: ing?.unit ?? null,
    aisle: ing?.aisle ?? 'divers',
    checked: false,
    fromRecipes: [],
    manual: true,
  };
}
