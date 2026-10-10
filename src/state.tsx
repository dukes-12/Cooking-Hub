import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { SEED_RECIPES } from './data/recipes';
import { getIngredient } from './data/ingredients';
import type { AppState, FridgeItem, PlannedMeal, Profile, Recipe, ShoppingItem } from './types';
import { buildShoppingList, sortByAisle } from './lib/shopping';

const KEY = 'cooking-hub:v1';

export const DEFAULT_PROFILE: Profile = {
  name: '',
  household: 2,
  country: 'FR',
  stores: [],
  diets: [],
  allergens: [],
  forbidden: [],
  liked: [],
  disliked: [],
  equipment: ['stovetop', 'oven', 'microwave'],
  speed: 'balanced',
  budgetPerServing: 3.5,
  pantryBasics: true,
};

const INITIAL: AppState = {
  onboarded: false,
  profile: DEFAULT_PROFILE,
  fridge: [],
  favorites: [],
  passed: [],
  menu: [],
  shopping: [],
  imported: [],
};

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return INITIAL;
    const parsed = JSON.parse(raw) as Partial<AppState>;
    return { ...INITIAL, ...parsed, profile: { ...DEFAULT_PROFILE, ...parsed.profile } };
  } catch {
    return INITIAL;
  }
}

function useStore() {
  const [state, setState] = useState<AppState>(load);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      // stockage indisponible (navigation privée) : l'app reste utilisable pour la session.
    }
  }, [state]);

  const recipes = useMemo<Record<string, Recipe>>(
    () => Object.fromEntries([...SEED_RECIPES, ...state.imported].map((r) => [r.id, r])),
    [state.imported],
  );

  const patch = useCallback((fn: (s: AppState) => Partial<AppState>) => setState((s) => ({ ...s, ...fn(s) })), []);

  const actions = useMemo(
    () => ({
      completeOnboarding: (profile: Profile) => patch(() => ({ profile, onboarded: true })),
      updateProfile: (p: Partial<Profile>) => patch((s) => ({ profile: { ...s.profile, ...p } })),
      resetAll: () => setState(INITIAL),

      toggleFavorite: (id: string) =>
        patch((s) => ({ favorites: s.favorites.includes(id) ? s.favorites.filter((f) => f !== id) : [id, ...s.favorites] })),
      like: (id: string) => patch((s) => ({ favorites: s.favorites.includes(id) ? s.favorites : [id, ...s.favorites] })),
      pass: (id: string) => patch((s) => ({ passed: [...s.passed, id] })),
      resetSwipes: () => patch(() => ({ passed: [] })),

      addToMenu: (recipeId: string, servings: number) =>
        patch((s) => ({
          menu: s.menu.some((m) => m.recipeId === recipeId)
            ? s.menu.map((m) => (m.recipeId === recipeId ? { ...m, servings } : m))
            : [...s.menu, { recipeId, servings }],
        })),
      removeFromMenu: (recipeId: string) => patch((s) => ({ menu: s.menu.filter((m) => m.recipeId !== recipeId) })),
      setMenuServings: (recipeId: string, servings: number) =>
        patch((s) => ({ menu: s.menu.map((m: PlannedMeal) => (m.recipeId === recipeId ? { ...m, servings } : m)) })),
      /** Recette cuisinée : retire du menu et décompte les ingrédients du frigo. */
      markCooked: (recipeId: string, used: { ingredientId: string; qty: number }[]) =>
        patch((s) => ({
          menu: s.menu.filter((m) => m.recipeId !== recipeId),
          fridge: consume(s.fridge, used),
        })),

      addFridge: (ingredientId: string, qty: number) =>
        patch((s) => ({
          fridge: s.fridge.some((f) => f.ingredientId === ingredientId)
            ? s.fridge.map((f) => (f.ingredientId === ingredientId ? { ...f, qty: f.qty + qty } : f))
            : [{ ingredientId, qty, addedAt: Date.now() }, ...s.fridge],
        })),
      setFridgeQty: (ingredientId: string, qty: number) =>
        patch((s) => ({
          fridge: qty <= 0 ? s.fridge.filter((f) => f.ingredientId !== ingredientId) : s.fridge.map((f) => (f.ingredientId === ingredientId ? { ...f, qty } : f)),
        })),

      regenerateShopping: () =>
        patch((s) => ({ shopping: buildShoppingList(s.menu, recipes, s.profile, s.fridge, s.shopping) })),
      toggleShopping: (key: string) =>
        patch((s) => ({ shopping: s.shopping.map((i) => (i.key === key ? { ...i, checked: !i.checked } : i)) })),
      addShopping: (item: ShoppingItem) =>
        patch((s) => ({ shopping: sortByAisle([...s.shopping.filter((i) => i.key !== item.key), item]) })),
      removeShopping: (key: string) => patch((s) => ({ shopping: s.shopping.filter((i) => i.key !== key) })),
      clearChecked: () => patch((s) => ({ shopping: s.shopping.filter((i) => !i.checked) })),
      /** Fin des courses : les articles cochés vont dans le frigo. */
      storeChecked: () =>
        patch((s) => {
          let fridge = s.fridge;
          for (const it of s.shopping.filter((i) => i.checked && i.ingredientId && i.qty != null)) {
            const ing = getIngredient(it.ingredientId)!;
            if (ing.staple) continue;
            const existing = fridge.find((f) => f.ingredientId === ing.id);
            fridge = existing
              ? fridge.map((f) => (f.ingredientId === ing.id ? { ...f, qty: f.qty + it.qty! } : f))
              : [{ ingredientId: ing.id, qty: it.qty!, addedAt: Date.now() }, ...fridge];
          }
          return { fridge, shopping: s.shopping.filter((i) => !i.checked) };
        }),

      saveImported: (r: Recipe) => patch((s) => ({ imported: [r, ...s.imported.filter((x) => x.id !== r.id)] })),
      deleteImported: (id: string) =>
        patch((s) => ({
          imported: s.imported.filter((r) => r.id !== id),
          favorites: s.favorites.filter((f) => f !== id),
          menu: s.menu.filter((m) => m.recipeId !== id),
        })),
    }),
    [patch, recipes],
  );

  return { state, recipes, actions };
}

function consume(fridge: FridgeItem[], used: { ingredientId: string; qty: number }[]): FridgeItem[] {
  return fridge
    .map((f) => {
      const u = used.filter((x) => x.ingredientId === f.ingredientId).reduce((s, x) => s + x.qty, 0);
      return u ? { ...f, qty: f.qty - u } : f;
    })
    .filter((f) => f.qty > 0.01);
}

type Store = ReturnType<typeof useStore>;
const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const store = useStore();
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useApp(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useApp hors StoreProvider');
  return s;
}
