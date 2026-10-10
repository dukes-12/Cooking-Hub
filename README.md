# Cooking Hub 🍳

Application web mobile (PWA) pour cuisiner selon **ton budget, ton lieu de vie, ton frigo, ton équipement et tes goûts** — avec la liste de courses qui va avec, utilisable hors-ligne au magasin.

## Lancer le prototype

```bash
npm install
npm run dev        # app sur http://localhost:5173 + API d'import sur :8787
```

Sur ton téléphone (même Wi-Fi) : ouvre `http://<ip-de-ton-ordi>:5173`, puis « Ajouter à l'écran d'accueil ».

Production : `npm run build && npm start` → tout est servi sur http://localhost:8787.

Tests : `npm test` · Vérification des types : `npm run typecheck`.

## Ce que fait l'app

| Écran | Rôle |
|---|---|
| **Onboarding** | Foyer, pays, magasins (géolocalisation via OpenStreetMap ou choix manuel), régime, allergies, interdits, aliments aimés / détestés, équipement, rythme (express → mijoté), budget/portion, objectif calorique. |
| **Découvrir** | Pile de cartes à swiper : → favori, ← passer, ↑ ajouter au menu. Classées par score de compatibilité (goûts, temps, budget, frigo, calories). |
| **Recherche** | Texte + filtres (type de plat, cuisine, temps, prix/portion, calories, « avec ce que j'ai »), tri par pertinence / prix / temps / calories. |
| **Fiche recette** | Format uniformisé : temps, kcal, coût/portion, difficulté, ingrédients mis à l'échelle, état frigo de chaque ingrédient, remplacements (⇄), comparatif de prix par enseigne, macros, étapes cochables, « J'ai cuisiné » (décompte le frigo). |
| **Recettes** | Menu de la semaine (portions, coût total), favoris, recettes importées. |
| **Frigo** | Inventaire par rayon + suggestions « à cuisiner avec ce que tu as ». |
| **Courses** | Liste générée depuis le menu, moins le frigo et le placard, triée par rayon ; meilleure enseigne, économie possible en partageant entre 2 enseignes ; **mode magasin** plein écran (gros boutons, écran maintenu allumé, hors-ligne) ; les articles achetés vont dans le frigo. |
| **Import** | Coller un lien (Marmiton, 750g, Jow, Ricardo, AllRecipes…) ou un texte : la recette est convertie au format Cooking Hub. |

### Comment les recettes sont adaptées (`src/lib/adapt.ts`)
- **Régime / allergies / interdits** : chaque ingrédient porte des étiquettes (gluten, porc, lait…). Un ingrédient incompatible est remplacé par un substitut compatible (lardons → lardons de volaille, bœuf haché → lentilles…), retiré s'il est facultatif, sinon la recette est marquée incompatible.
- **Aliments détestés** : remplacés si possible, sinon la recette descend dans le classement.
- **Équipement** : appareil manquant → alternative avec conseil (four → air fryer −20 °C / −20 % de temps, ou poêle couverte…).
- **Frigo** : chaque ingrédient est marqué « au frigo / en partie / placard / à acheter », avec proposition d'utiliser un substitut déjà présent.

### Prix (`src/lib/pricing.ts`)
Prix de référence par ingrédient (France) × indice pays × indice de l'enseigne (+ biais par rayon). C'est une **estimation** : l'interface `PriceProvider` permet de brancher de vraies sources de prix.

### Nutrition
Calculée à partir de la base d'ingrédients (valeurs pour 100 g, type Ciqual). Si la source importée donne les calories, elles sont utilisées en priorité. Un indice de fiabilité s'affiche quand des ingrédients ne sont pas reconnus.

## Architecture

```
src/
  data/        ingrédients (nutrition, prix, rayons, substituts), recettes de démo, pays/enseignes/régimes
  lib/         adapt (adaptation + score), pricing, shopping, importer (schema.org → Recipe), geo (OpenStreetMap), units
  screens/     un fichier par écran
  components/  UI partagée (chips, stepper, sheet, picker d'ingrédients, cartes)
  state.tsx    état global persisté en localStorage
server/        mini serveur Node sans dépendance : /api/import + service de dist/
public/        manifest PWA + service worker (hors-ligne)
```

## Limites du prototype & prochaines étapes
- **Prix réels** : le scraping direct des sites d'enseignes (Carrefour, Leclerc…) est bloqué par des protections anti-bot et souvent interdit par leurs CGU. Pistes : API [Open Prices](https://prices.openfoodfacts.org) (Open Food Facts, prix collaboratifs géolocalisés), scrapers côté serveur pour les enseignes qui le permettent, ou prix relevés par l'utilisateur pendant ses courses.
- **Base d'ingrédients** : ~110 ingrédients ; à étendre (ou brancher Open Food Facts / Ciqual) pour mieux reconnaître les recettes importées.
- **Catalogue** : 26 recettes de démo ; prochaine étape = un import en masse côté serveur pour alimenter le swipe.
- **Compte & synchro** : les données restent sur l'appareil (localStorage) ; un backend (ex. Supabase) permettrait de partager frigo et liste au sein du foyer.
