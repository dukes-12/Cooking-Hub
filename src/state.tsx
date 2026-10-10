import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { SEED_RECIPES } from './data/recipes';
import { getIngredient, setCustomIngredients } from './data/ingredients';
import { getChain } from './data/reference';
import { labelKey } from './lib/custom';
import type { AppState, ChosenStore, FridgeItem, Ingredient, PlannedMeal, Profile, Receipt, Recipe, ShoppingItem } from './types';
import { observationsFromReceipts } from './lib/receipts';
import { setObservedPrices } from './lib/pricing';
import { storeKey } from './lib/stores';
import { buildShoppingList, sortByAisle } from './lib/shopping';

const KEY = 'cooking-hub:v1';

export const DEFAULT_PROFILE: Profile = {
  name: '',
  household: 2,
  country: 'FR',
  cuisines: [],
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
  receipts: [],
  customProducts: [],
  labelMemory: {},
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
  // Les produits personnels doivent être connus avant tout rendu (getIngredient("mine:…")).
  setCustomIngredients(state.customProducts);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      // stockage indisponible (navigation privée) : l'app reste utilisable pour la session.
    }
  }, [state]);

  // Catalogue généré par `npm run recipes:import` (public/catalog.json), chargé à la volée.
  const [catalog, setCatalog] = useState<Recipe[]>([]);
  useEffect(() => {
    fetch('/catalog.json')
      .then((r) => (r.ok ? r.json() : []))
      .then((list: Recipe[]) => Array.isArray(list) && setCatalog(list))
      .catch(() => undefined);
  }, []);

  const recipes = useMemo<Record<string, Recipe>>(
    () => Object.fromEntries([...SEED_RECIPES, ...catalog, ...state.imported].map((r) => [r.id, r])),
    [catalog, state.imported],
  );

  // Les prix relevés sur les tickets alimentent le calcul des prix avant l'affichage des écrans.
  const observations = useMemo(() => {
    const list = observationsFromReceipts(state.receipts);
    setObservedPrices(list);
    return list;
  }, [state.receipts]);

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

      addStore: (store: ChosenStore) =>
        patch((s) => ({
          profile: { ...s.profile, stores: [...s.profile.stores.filter((x) => storeKey(x) !== storeKey(store)), store] },
        })),
      removeStore: (key: string) =>
        patch((s) => ({ profile: { ...s.profile, stores: s.profile.stores.filter((x) => storeKey(x) !== key) } })),
      /** Ticket validé : enregistre les prix, crée le magasin si besoin et range les articles cochés au frigo. */
      addReceipt: (receipt: Receipt, newStore: ChosenStore | undefined, toFridge: { ingredientId: string; qty: number }[]) =>
        patch((s) => {
          let fridge = s.fridge;
          for (const { ingredientId, qty } of toFridge) {
            if (!(qty > 0)) continue;
            fridge = fridge.some((f) => f.ingredientId === ingredientId)
              ? fridge.map((f) => (f.ingredientId === ingredientId ? { ...f, qty: f.qty + qty } : f))
              : [{ ingredientId, qty, addedAt: Date.now() }, ...fridge];
          }
          const stores = newStore && !s.profile.stores.some((x) => storeKey(x) === storeKey(newStore)) ? [...s.profile.stores, newStore] : s.profile.stores;
          // L'appli retient l'article choisi pour chaque libellé : le prochain ticket le reconnaîtra tout seul.
          const labelMemory = { ...s.labelMemory };
          for (const l of receipt.lines) if (l.productId && labelKey(l.label)) labelMemory[labelKey(l.label)] = l.productId;
          return {
            fridge,
            profile: { ...s.profile, stores },
            receipts: [receipt, ...s.receipts.filter((r) => r.id !== receipt.id)],
            labelMemory,
          };
        }),
      addCustomProduct: (ing: Ingredient) => patch((s) => ({ customProducts: [...s.customProducts.filter((x) => x.id !== ing.id), ing] })),
      updateCustomProduct: (id: string, patchIng: Partial<Ingredient>) =>
        patch((s) => ({ customProducts: s.customProducts.map((x) => (x.id === id ? { ...x, ...patchIng, id } : x)) })),
      deleteCustomProduct: (id: string) =>
        patch((s) => ({
          customProducts: s.customProducts.filter((x) => x.id !== id),
          fridge: s.fridge.filter((f) => f.ingredientId !== id),
          labelMemory: Object.fromEntries(Object.entries(s.labelMemory).filter(([, v]) => v !== id)),
        })),
      /** Rattache un ticket (et donc ses prix) à un autre magasin. */
      moveReceipt: (id: string, toKey: string) =>
        patch((s) => {
          const store = s.profile.stores.find((x) => storeKey(x) === toKey);
          if (!store) return {};
          const chain = getChain(store.chainId);
          return { receipts: s.receipts.map((r) => (r.id === id ? { ...r, storeKey: toKey, chainId: store.chainId, country: chain?.country ?? r.country } : r)) };
        }),
      deleteReceipt: (id: string) => patch((s) => ({ receipts: s.receipts.filter((r) => r.id !== id) })),

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

  return { state, recipes, actions, observations };
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
