# Cooking Hub 🍳

Application web mobile (PWA) pour cuisiner selon **ton budget, ton lieu de vie, ton frigo, ton équipement et tes goûts** — avec la liste de courses qui va avec, utilisable hors-ligne au magasin.

## Lancer le prototype

```bash
npm install
cp .env.example .env   # optionnel : mets ta clé ANTHROPIC_API_KEY pour l'import par photo
npm run dev            # app sur http://localhost:5173 + API d'import sur :8787
```

Sur ton téléphone (même Wi-Fi) : ouvre `http://<ip-de-ton-ordi>:5173`, puis « Ajouter à l'écran d'accueil ».

Production : `npm run build && npm start` → tout est servi sur http://localhost:8787.

Tests : `npm test` · Vérification des types : `npm run typecheck`.

## Mise en ligne sur Cloudflare Pages (une URL de test à chaque push)

Configuration unique, dans le tableau de bord Cloudflare :

1. **Workers & Pages → Create → Pages → Connect to Git** → choisis `dukes-12/cooking-hub`.
2. Réglages de build : *Framework preset* `None`, **Build command** `npm run build`, **Build output directory** `dist`.
3. **Settings → Variables and Secrets** : ajoute le secret `ANTHROPIC_API_KEY` (pour l'import par photo), en *Production* et en *Preview*.
4. Lance le premier déploiement.

Ensuite, chaque push déploie automatiquement :
- la branche `main` → `https://cooking-hub.pages.dev` (production) ;
- toute autre branche / PR → une URL de prévisualisation `https://<branche>.cooking-hub.pages.dev`, commentée sur la PR. C'est l'URL à ouvrir sur ton téléphone pour tester chaque lot.

Le dossier `functions/` est déployé automatiquement en Pages Functions (`/api/import`, `/api/photo`, `/api/health`).
Déploiement manuel possible : `npx wrangler login` puis `npm run deploy`. Test local de l'environnement Cloudflare : `npm run build && npx wrangler pages dev`.

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
| **Import** | Coller un lien (Marmiton, 750g, Jow, Ricardo, AllRecipes, receitas Continente / Pingo Doce…), **prendre en photo** une recette (livre, fiche manuscrite, capture — jusqu'à 4 pages, lue par Claude) ou coller un texte : la recette est convertie au format Cooking Hub. |

### Comment les recettes sont adaptées (`src/lib/adapt.ts`)
- **Régime / allergies / interdits** : chaque ingrédient porte des étiquettes (gluten, porc, lait…). Un ingrédient incompatible est remplacé par un substitut compatible (lardons → lardons de volaille, bœuf haché → lentilles…), retiré s'il est facultatif, sinon la recette est marquée incompatible.
- **Aliments détestés** : remplacés si possible, sinon la recette descend dans le classement.
- **Équipement** : appareil manquant → alternative avec conseil (four → air fryer −20 °C / −20 % de temps, ou poêle couverte…).
- **Frigo** : chaque ingrédient est marqué « au frigo / en partie / placard / à acheter », avec proposition d'utiliser un substitut déjà présent.

### Prix (`src/lib/pricing.ts`)
Prix de référence par ingrédient (France) × indice pays × indice de l'enseigne (+ biais par rayon). C'est une **estimation** : l'interface `PriceProvider` permet de brancher de vraies sources de prix.

### Nutrition
Calculée à partir de la base d'ingrédients (valeurs pour 100 g, type Ciqual). Si la source importée donne les calories, elles sont utilisées en priorité. Un indice de fiabilité s'affiche quand des ingrédients ne sont pas reconnus.

### Géolocalisation
- Bouton « Trouver les magasins près de moi » : position du téléphone (API Geolocation du navigateur, **HTTPS obligatoire** — OK sur Cloudflare, et sur `localhost`), puis supermarchés à 4 km via OpenStreetMap (API Overpass, gratuite, sans clé), rapprochés des enseignes connues.
- Si la localisation est refusée : saisie d'une ville ou d'un code postal (géocodage OpenStreetMap Nominatim).
- En http sur l'IP locale (`http://192.168…:5173`), les navigateurs bloquent la géolocalisation : utilise l'URL Cloudflare.

### Agrandir le catalogue de recettes
Les 26 recettes actuelles (`src/data/recipes.ts`) sont des classiques de la cuisine familiale, rédigés pour le prototype (pas copiés d'un site). Pour en ajouter en masse :

```bash
# 1. colle des URLs de recettes dans scripts/recipe-urls.txt (une par ligne)
npm run recipes:import      # 2. génère public/catalog.json, chargé par l'app au démarrage
```

Le script réutilise l'import schema.org, ignore les URLs déjà importées et attend 1,5 s entre deux requêtes. Il indique pour chaque recette combien d'ingrédients n'ont pas été reconnus (à ajouter dans `src/data/ingredients.ts`).
⚠️ Les listes d'ingrédients sont des faits, mais le texte des étapes et les photos sont protégés par le droit d'auteur : pour une app publique, garder le lien vers la source et reformuler les étapes.

## Architecture

```
functions/api/  Cloudflare Pages Functions (import lien, import photo, santé)
server/         core.mjs (logique partagée) + index.mjs (serveur local)
scripts/        import en masse de recettes → public/catalog.json
src/
  data/        ingrédients (nutrition, prix, rayons, substituts), recettes de démo, pays/enseignes/régimes
  lib/         adapt (adaptation + score), pricing, shopping, importer (schema.org → Recipe), geo (OpenStreetMap), units
  screens/     un fichier par écran
  components/  UI partagée (chips, stepper, sheet, picker d'ingrédients, cartes)
  state.tsx    état global persisté en localStorage
public/        manifest PWA + service worker (hors-ligne)
```

## Prix réels : plan pour la France et le Portugal

Aujourd'hui les prix sont **estimés** (prix de référence × indice pays × indice enseigne). Pour de vrais prix, par ordre de priorité :

1. **Open Prices (Open Food Facts)** — base ouverte (licence ODbL) de prix relevés en magasin, avec l'enseigne et le lieu, couvrant la France et le Portugal. API publique documentée sur `prices.openfoodfacts.org/api/docs`. C'est la source légale la plus simple à brancher (un `PriceProvider` dans `src/lib/pricing.ts`). Limite : couverture inégale selon les produits et les villes.
2. **Tickets de caisse en photo** — même mécanique que l'import photo : l'utilisateur photographie son ticket, Claude en extrait articles + prix, rattachés à l'enseigne. Les prix deviennent personnels et exacts, et peuvent alimenter Open Prices.
3. **Collecte automatique sur les drives**, via un Cloudflare Worker planifié (cron) qui interroge chaque nuit une liste fixe de ~150 produits de référence et stocke les prix au kg dans Cloudflare D1 :
   - **France** : Carrefour, E.Leclerc Drive, Auchan, Intermarché ont des catalogues en ligne, mais protégés par des anti-robots et des CGU qui interdisent l'extraction automatique ;
   - **Portugal** : Continente, Pingo Doce (via Mercadão), Auchan.pt, Intermarché : catalogues en ligne plus accessibles. Des prestataires vendent déjà ces données agrégées (Apify, Jsonify) ;
   - à faire seulement après lecture des CGU et du `robots.txt` de chaque enseigne, à faible fréquence ; ou via un prestataire de données sous licence.

## Limites du prototype & prochaines étapes
- **Prix** : estimations (voir ci-dessus).
- **Base d'ingrédients** : ~110 ingrédients ; à étendre (ou brancher Open Food Facts / Ciqual) pour mieux reconnaître les recettes importées.
- **Compte & synchro** : les données restent sur l'appareil (localStorage) ; un backend (ex. Supabase ou Cloudflare D1) permettrait de partager frigo et liste au sein du foyer.
