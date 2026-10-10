import type { Aisle, Allergen, Diet, Equipment, FoodTag, Speed } from '../types';

export interface Country {
  code: string;
  name: string;
  flag: string;
  currency: string;
  /** Multiplicateur de prix (et conversion de devise) par rapport à la France. */
  priceFactor: number;
}

export const COUNTRIES: Country[] = [
  { code: 'FR', name: 'France', flag: '🇫🇷', currency: 'EUR', priceFactor: 1 },
  { code: 'BE', name: 'Belgique', flag: '🇧🇪', currency: 'EUR', priceFactor: 1.06 },
  { code: 'CH', name: 'Suisse', flag: '🇨🇭', currency: 'CHF', priceFactor: 1.55 },
  { code: 'LU', name: 'Luxembourg', flag: '🇱🇺', currency: 'EUR', priceFactor: 1.1 },
  { code: 'CA', name: 'Canada', flag: '🇨🇦', currency: 'CAD', priceFactor: 1.75 },
  { code: 'ES', name: 'Espagne', flag: '🇪🇸', currency: 'EUR', priceFactor: 0.88 },
  { code: 'DE', name: 'Allemagne', flag: '🇩🇪', currency: 'EUR', priceFactor: 0.97 },
];

export function getCountry(code: string): Country {
  return COUNTRIES.find((c) => c.code === code) ?? COUNTRIES[0];
}

export interface Chain {
  id: string;
  name: string;
  country: string;
  /** Indice de prix global (1 = moyenne du marché). */
  index: number;
  /** Ajustements par rayon (multiplicateurs appliqués en plus de l'indice). */
  aisleBias?: Partial<Record<Aisle, number>>;
  /** Noms/brands OpenStreetMap correspondants (en minuscules). */
  osm: string[];
  color: string;
}

export const CHAINS: Chain[] = [
  // France
  { id: 'fr-lidl', name: 'Lidl', country: 'FR', index: 0.84, aisleBias: { boucherie: 1.05, poissonnerie: 1.08 }, osm: ['lidl'], color: '#0050aa' },
  { id: 'fr-aldi', name: 'Aldi', country: 'FR', index: 0.85, aisleBias: { 'fruits-legumes': 1.04 }, osm: ['aldi'], color: '#00005f' },
  { id: 'fr-leclerc', name: 'E.Leclerc', country: 'FR', index: 0.9, aisleBias: { epicerie: 0.97 }, osm: ['e.leclerc', 'leclerc'], color: '#0066b3' },
  { id: 'fr-intermarche', name: 'Intermarché', country: 'FR', index: 0.94, aisleBias: { poissonnerie: 0.93 }, osm: ['intermarché', 'intermarche'], color: '#e2001a' },
  { id: 'fr-auchan', name: 'Auchan', country: 'FR', index: 0.95, osm: ['auchan'], color: '#e30613' },
  { id: 'fr-superu', name: 'Super U', country: 'FR', index: 0.97, aisleBias: { 'fruits-legumes': 0.96 }, osm: ['super u', 'hyper u', 'u express', 'système u'], color: '#e2001a' },
  { id: 'fr-carrefour', name: 'Carrefour', country: 'FR', index: 1.0, osm: ['carrefour', 'carrefour market'], color: '#1e4c9a' },
  { id: 'fr-carrefour-city', name: 'Carrefour City / Express', country: 'FR', index: 1.14, osm: ['carrefour city', 'carrefour express'], color: '#1e4c9a' },
  { id: 'fr-monoprix', name: 'Monoprix', country: 'FR', index: 1.22, osm: ['monoprix'], color: '#000000' },
  { id: 'fr-franprix', name: 'Franprix', country: 'FR', index: 1.18, osm: ['franprix'], color: '#ee7203' },
  { id: 'fr-grandfrais', name: 'Grand Frais', country: 'FR', index: 0.95, aisleBias: { 'fruits-legumes': 0.82, epicerie: 1.08 }, osm: ['grand frais'], color: '#5c9c2e' },
  { id: 'fr-biocoop', name: 'Biocoop', country: 'FR', index: 1.45, osm: ['biocoop'], color: '#5aa02c' },
  // Belgique
  { id: 'be-colruyt', name: 'Colruyt', country: 'BE', index: 0.88, osm: ['colruyt'], color: '#e30613' },
  { id: 'be-delhaize', name: 'Delhaize', country: 'BE', index: 1.08, osm: ['delhaize', 'ad delhaize', 'proxy delhaize'], color: '#d2001f' },
  { id: 'be-lidl', name: 'Lidl', country: 'BE', index: 0.85, osm: ['lidl'], color: '#0050aa' },
  { id: 'be-aldi', name: 'Aldi', country: 'BE', index: 0.85, osm: ['aldi'], color: '#00005f' },
  { id: 'be-carrefour', name: 'Carrefour', country: 'BE', index: 1.0, osm: ['carrefour', 'carrefour market', 'carrefour express'], color: '#1e4c9a' },
  // Suisse
  { id: 'ch-migros', name: 'Migros', country: 'CH', index: 1.0, osm: ['migros'], color: '#ff6600' },
  { id: 'ch-coop', name: 'Coop', country: 'CH', index: 1.05, osm: ['coop'], color: '#e2001a' },
  { id: 'ch-denner', name: 'Denner', country: 'CH', index: 0.86, osm: ['denner'], color: '#e2001a' },
  { id: 'ch-lidl', name: 'Lidl', country: 'CH', index: 0.84, osm: ['lidl'], color: '#0050aa' },
  { id: 'ch-aldi', name: 'Aldi Suisse', country: 'CH', index: 0.84, osm: ['aldi', 'aldi suisse'], color: '#00005f' },
  // Luxembourg
  { id: 'lu-cactus', name: 'Cactus', country: 'LU', index: 1.05, osm: ['cactus'], color: '#00843d' },
  { id: 'lu-delhaize', name: 'Delhaize', country: 'LU', index: 1.04, osm: ['delhaize'], color: '#d2001f' },
  { id: 'lu-lidl', name: 'Lidl', country: 'LU', index: 0.86, osm: ['lidl'], color: '#0050aa' },
  { id: 'lu-auchan', name: 'Auchan', country: 'LU', index: 0.96, osm: ['auchan'], color: '#e30613' },
  // Canada
  { id: 'ca-maxi', name: 'Maxi', country: 'CA', index: 0.88, osm: ['maxi'], color: '#ffd200' },
  { id: 'ca-superc', name: 'Super C', country: 'CA', index: 0.89, osm: ['super c'], color: '#e2001a' },
  { id: 'ca-iga', name: 'IGA', country: 'CA', index: 1.06, osm: ['iga'], color: '#e2001a' },
  { id: 'ca-metro', name: 'Metro', country: 'CA', index: 1.05, osm: ['metro'], color: '#e2001a' },
  { id: 'ca-provigo', name: 'Provigo', country: 'CA', index: 1.04, osm: ['provigo'], color: '#e2001a' },
  { id: 'ca-walmart', name: 'Walmart', country: 'CA', index: 0.9, osm: ['walmart'], color: '#0071ce' },
  // Espagne
  { id: 'es-mercadona', name: 'Mercadona', country: 'ES', index: 0.95, osm: ['mercadona'], color: '#00a650' },
  { id: 'es-dia', name: 'Dia', country: 'ES', index: 0.9, osm: ['dia', 'dia %'], color: '#e2001a' },
  { id: 'es-lidl', name: 'Lidl', country: 'ES', index: 0.88, osm: ['lidl'], color: '#0050aa' },
  { id: 'es-carrefour', name: 'Carrefour', country: 'ES', index: 1.0, osm: ['carrefour', 'carrefour express', 'carrefour market'], color: '#1e4c9a' },
  // Allemagne
  { id: 'de-aldi', name: 'Aldi', country: 'DE', index: 0.85, osm: ['aldi', 'aldi süd', 'aldi nord'], color: '#00005f' },
  { id: 'de-lidl', name: 'Lidl', country: 'DE', index: 0.85, osm: ['lidl'], color: '#0050aa' },
  { id: 'de-rewe', name: 'REWE', country: 'DE', index: 1.04, osm: ['rewe'], color: '#cc071e' },
  { id: 'de-edeka', name: 'EDEKA', country: 'DE', index: 1.05, osm: ['edeka'], color: '#ffd400' },
  { id: 'de-kaufland', name: 'Kaufland', country: 'DE', index: 0.92, osm: ['kaufland'], color: '#e10915' },
];

export function chainsFor(country: string): Chain[] {
  return CHAINS.filter((c) => c.country === country);
}

export function getChain(id: string): Chain | undefined {
  return CHAINS.find((c) => c.id === id);
}

export const DIETS: Record<Diet, { label: string; emoji: string; excludes: FoodTag[] }> = {
  vegetarian: { label: 'Végétarien', emoji: '🥕', excludes: ['meat', 'fish', 'seafood'] },
  vegan: { label: 'Végétalien / vegan', emoji: '🌱', excludes: ['meat', 'fish', 'seafood', 'dairy', 'egg', 'honey'] },
  pescatarian: { label: 'Pescétarien', emoji: '🐟', excludes: ['meat'] },
  'no-pork': { label: 'Sans porc', emoji: '🐖', excludes: ['pork'] },
  halal: { label: 'Halal', emoji: '☪️', excludes: ['pork', 'alcohol'] },
  'gluten-free': { label: 'Sans gluten', emoji: '🌾', excludes: ['gluten'] },
  'lactose-free': { label: 'Sans lactose', emoji: '🥛', excludes: ['dairy'] },
};

export const ALLERGENS: Record<Allergen, { label: string; tag: FoodTag }> = {
  gluten: { label: 'Gluten', tag: 'gluten' },
  dairy: { label: 'Lait', tag: 'dairy' },
  egg: { label: 'Œufs', tag: 'egg' },
  peanut: { label: 'Arachides', tag: 'peanut' },
  nuts: { label: 'Fruits à coque', tag: 'nuts' },
  soy: { label: 'Soja', tag: 'soy' },
  fish: { label: 'Poisson', tag: 'fish' },
  seafood: { label: 'Crustacés & mollusques', tag: 'seafood' },
  sesame: { label: 'Sésame', tag: 'sesame' },
  mustard: { label: 'Moutarde', tag: 'mustard' },
  celery: { label: 'Céleri', tag: 'celery' },
};

export const EQUIPMENT: Record<Equipment, { label: string; emoji: string }> = {
  stovetop: { label: 'Plaques de cuisson', emoji: '🔥' },
  oven: { label: 'Four', emoji: '♨️' },
  microwave: { label: 'Micro-ondes', emoji: '📡' },
  airfryer: { label: 'Air fryer', emoji: '🌀' },
  blender: { label: 'Blender / mixeur', emoji: '🥤' },
  mixer: { label: 'Batteur électrique', emoji: '🎛️' },
  foodProcessor: { label: 'Robot multifonction', emoji: '🤖' },
  pressureCooker: { label: 'Autocuiseur / Cookeo', emoji: '🍲' },
};

/** Remplacements possibles d'un équipement manquant, avec conseil d'adaptation. */
export const EQUIPMENT_ALTERNATIVES: Partial<Record<Equipment, { with: Equipment; tip: string }[]>> = {
  oven: [
    { with: 'airfryer', tip: 'Air fryer : baisse la température de 20 °C et réduis le temps d’environ 20 %. Cuis en plusieurs fournées si besoin.' },
    { with: 'stovetop', tip: 'Poêle ou cocotte couverte à feu moyen-doux : retourne à mi-cuisson. Pour un gratin, finis à couvert pour que ça cuise à cœur.' },
    { with: 'microwave', tip: 'Micro-ondes : cuisson plus rapide (÷3 environ) mais sans dorure. Couvre et vérifie toutes les 2 min.' },
  ],
  blender: [
    { with: 'foodProcessor', tip: 'Robot : mixe en plusieurs fois pour une texture lisse.' },
    { with: 'stovetop', tip: 'Sans mixeur : écrase au presse-purée ou à la fourchette, la texture sera plus rustique.' },
  ],
  mixer: [{ with: 'stovetop', tip: 'Au fouet à la main : compte 3 à 5 min d’huile de coude 💪.' }],
  foodProcessor: [{ with: 'blender', tip: 'Blender : procède par petites quantités.' }],
  pressureCooker: [{ with: 'stovetop', tip: 'En cocotte classique : multiplie le temps de cuisson par 2 à 3.' }],
  airfryer: [{ with: 'oven', tip: 'Four : ajoute 20 °C et environ 20 % de temps.' }],
  microwave: [{ with: 'stovetop', tip: 'Au bain-marie ou à la casserole à feu doux.' }],
};

export const SPEEDS: Record<Speed, { label: string; desc: string; maxMin: number }> = {
  express: { label: 'Express', desc: '≤ 25 min, le soir en semaine', maxMin: 25 },
  balanced: { label: 'Équilibré', desc: '≤ 45 min la plupart du temps', maxMin: 45 },
  slow: { label: 'J’aime mijoter', desc: 'Le temps n’est pas un problème', maxMin: 600 },
};

export const CATEGORY_LABELS: Record<string, string> = {
  plat: 'Plat',
  entree: 'Entrée',
  soupe: 'Soupe',
  salade: 'Salade',
  dessert: 'Dessert',
  'petit-dej': 'Petit-déj',
  snack: 'Snack',
};
