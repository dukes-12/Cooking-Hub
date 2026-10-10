// ---------- Référentiels ----------

export type Aisle =
  | 'fruits-legumes'
  | 'boucherie'
  | 'poissonnerie'
  | 'cremerie'
  | 'epicerie'
  | 'conserves'
  | 'boulangerie'
  | 'surgeles'
  | 'epices'
  | 'boissons'
  | 'divers';

/** Étiquettes servant aux régimes et aux allergies. */
export type FoodTag =
  | 'meat'
  | 'pork'
  | 'beef'
  | 'poultry'
  | 'fish'
  | 'seafood'
  | 'dairy'
  | 'egg'
  | 'gluten'
  | 'nuts'
  | 'peanut'
  | 'soy'
  | 'sesame'
  | 'mustard'
  | 'celery'
  | 'alcohol'
  | 'honey';

export type BaseUnit = 'g' | 'ml' | 'pc';

export interface Ingredient {
  id: string;
  name: string;
  aliases: string[];
  aisle: Aisle;
  /** Unité naturelle pour les courses et le frigo. */
  unit: BaseUnit;
  /** Poids moyen d'une pièce (g). */
  pieceG?: number;
  /** Densité (g/ml) pour les conversions cuillères/volumes. */
  density?: number;
  /** Valeurs pour 100 g. */
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  /** Prix de référence France, € par kg (ou par litre). */
  pricePerKg: number;
  tags: FoodTag[];
  /** Ingrédients de remplacement possibles (ids). */
  subs?: string[];
  /** Considéré comme "fond de placard" (sel, poivre…). */
  staple?: boolean;
}

export type Unit = BaseUnit | 'kg' | 'cl' | 'l' | 'cas' | 'cac' | 'pincee' | 'gousse' | 'tranche' | 'botte' | 'sachet';

export interface RecipeIngredient {
  ingredientId?: string; // absent = ingrédient non reconnu (import)
  name: string;
  qty: number | null;
  unit: Unit;
  optional?: boolean;
  note?: string;
}

export type Equipment =
  | 'stovetop'
  | 'oven'
  | 'microwave'
  | 'airfryer'
  | 'blender'
  | 'mixer'
  | 'foodProcessor'
  | 'pressureCooker';

export type Category = 'plat' | 'entree' | 'soupe' | 'salade' | 'dessert' | 'petit-dej' | 'snack';

export interface Recipe {
  id: string;
  title: string;
  emoji: string;
  color: string;
  image?: string;
  cuisine: string;
  category: Category;
  servings: number;
  prepMin: number | null;
  cookMin: number | null;
  difficulty: 1 | 2 | 3;
  equipment: Equipment[];
  ingredients: RecipeIngredient[];
  steps: string[];
  source?: { name: string; url?: string };
  /** kcal/portion fournies par la source (prioritaires sur l'estimation). */
  sourceKcal?: number;
  imported?: boolean;
}

// ---------- Utilisateur ----------

export type Diet =
  | 'vegetarian'
  | 'vegan'
  | 'pescatarian'
  | 'no-pork'
  | 'halal'
  | 'gluten-free'
  | 'lactose-free';

export type Allergen =
  | 'gluten'
  | 'dairy'
  | 'egg'
  | 'peanut'
  | 'nuts'
  | 'soy'
  | 'fish'
  | 'seafood'
  | 'sesame'
  | 'mustard'
  | 'celery';

export type Speed = 'express' | 'balanced' | 'slow';

export interface ChosenStore {
  chainId: string;
  label: string; // ex. "Lidl – Rue de la Paix"
  distanceM?: number;
}

export interface Profile {
  name: string;
  household: number;
  country: string;
  city?: string;
  location?: { lat: number; lon: number };
  stores: ChosenStore[];
  diets: Diet[];
  allergens: Allergen[];
  forbidden: string[]; // ids d'ingrédients
  liked: string[];
  disliked: string[];
  equipment: Equipment[];
  speed: Speed;
  budgetPerServing: number; // devise locale
  kcalTarget?: number; // par portion
  pantryBasics: boolean;
}

export interface FridgeItem {
  ingredientId: string;
  qty: number; // dans l'unité naturelle de l'ingrédient
  addedAt: number;
}

export interface ShoppingItem {
  key: string;
  ingredientId?: string;
  name: string;
  qty: number | null;
  unit: BaseUnit | null;
  aisle: Aisle;
  checked: boolean;
  fromRecipes: string[];
  manual?: boolean;
}

export interface PlannedMeal {
  recipeId: string;
  servings: number;
}

export interface AppState {
  onboarded: boolean;
  profile: Profile;
  fridge: FridgeItem[];
  favorites: string[];
  passed: string[];
  menu: PlannedMeal[];
  shopping: ShoppingItem[];
  imported: Recipe[];
}
