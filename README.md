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

## Mise en ligne sur Cloudflare Workers (une URL de test à chaque push)

Le projet se déploie en **Worker avec fichiers statiques** (`wrangler.jsonc`) : `dist/` est servi en statique, et `worker/index.js` répond aux routes `/api/*` (import lien, import photo, santé).

Configuration unique, dans le tableau de bord Cloudflare : **Workers & Pages → Create → Import a repository** → `dukes-12/cooking-hub`
- Commande de build : `npm run build` · Commande de déploiement : `npx wrangler deploy` · Commande d'aperçu : `npx wrangler preview`
- Builds d'aperçu activés : chaque branche / PR obtient sa propre URL de test.
- Après la création : **Settings → Variables and Secrets** → ajouter le secret `ANTHROPIC_API_KEY` (import par photo).

Test local de l'environnement Cloudflare : `npm run preview:cf`. Déploiement manuel : `npx wrangler login` puis `npm run deploy`.

## Ce que fait l'app

| Écran | Rôle |
|---|---|
| **Onboarding** | Foyer, pays des courses (prix) et cuisines souhaitées (indépendantes du pays : FR, PT, IT…), magasins (géolocalisation via OpenStreetMap ou choix manuel), régime, allergies, interdits, aliments aimés / détestés, équipement, rythme (express → mijoté), budget/portion, objectif calorique. |
| **Découvrir** | Pile de cartes à swiper : → favori, ← passer, ↑ ajouter au menu. Classées par score de compatibilité (goûts, temps, budget, frigo, calories). |
| **Recherche** (🔍 depuis Découvrir) | Texte + filtres (type de plat, cuisine, temps, prix/portion, calories, « avec ce que j'ai »), tri par pertinence / prix / temps / calories. |
| **Fiche recette** | Format uniformisé : temps, kcal, coût/portion, difficulté, ingrédients mis à l'échelle, état frigo de chaque ingrédient, remplacements (⇄), comparatif de prix par enseigne, macros, étapes cochables, « J'ai cuisiné » (décompte le frigo). |
| **Recettes** | Menu de la semaine (portions, coût total), favoris, recettes importées. |
| **Frigo** | Inventaire par rayon + suggestions « à cuisiner avec ce que tu as ». |
| **Courses** | Liste générée depuis le menu, moins le frigo et le placard, triée par rayon ; meilleure enseigne, économie possible en partageant entre 2 enseignes ; **mode magasin** plein écran (gros boutons, écran maintenu allumé, hors-ligne) ; les articles achetés vont dans le frigo. |
| **Magasins** | Tes magasins (ex. « Continente Lumiar ») avec le coût d'un panier type et les prix relevés ; **carte** (OpenStreetMap) des supermarchés autour de toi ou d'une ville, ajout en un geste ; **comparatif** des magasins sur le panier type. Fiche magasin : prix moyens relevés, tickets, itinéraire Google Maps. |
| **Ticket de caisse** | Photo du ticket (jusqu'à 4 photos, lue par Claude) ou saisie à la main → récapitulatif à vérifier : magasin, date, chaque ligne associée à un produit de l'appli, quantité / format / poids / prix (prix au kilo recalculé), écart avec le total imprimé. Tout est modifiable avant validation. Les prix s'ajoutent au magasin et les articles cochés vont au frigo. |
| **Fiche produit** | Une fiche par famille de produit (« blanc de poulet » regroupe tous les grammages) : photo (Wikimedia Commons, via Wikidata), noms FR/PT/EN, résumé, valeurs pour 100 g, prix dans tes magasins (relevé dans ce magasin > relevé dans l'enseigne > estimation), prix ailleurs triables par pays ou par prix, historique d'achat, recettes qui l'utilisent. Accessible depuis le frigo, les recettes et les magasins. |
| **Import** | Coller un lien (Marmiton, 750g, Jow, Ricardo, AllRecipes, receitas Continente / Pingo Doce…), **prendre en photo** une recette (livre, fiche manuscrite, capture — jusqu'à 4 pages, lue par Claude) ou coller un texte : la recette est convertie au format Cooking Hub. |

### Comment les recettes sont adaptées (`src/lib/adapt.ts`)
- **Régime / allergies / interdits** : chaque ingrédient porte des étiquettes (gluten, porc, lait…). Un ingrédient incompatible est remplacé par un substitut compatible (lardons → lardons de volaille, bœuf haché → lentilles…), retiré s'il est facultatif, sinon la recette est marquée incompatible.
- **Aliments détestés** : remplacés si possible, sinon la recette descend dans le classement.
- **Équipement** : appareil manquant → alternative avec conseil (four → air fryer −20 °C / −20 % de temps, ou poêle couverte…).
- **Frigo** : chaque ingrédient est marqué « au frigo / en partie / placard / à acheter », avec proposition d'utiliser un substitut déjà présent.

### Prix (`src/lib/pricing.ts`)
Prix de référence par ingrédient (France) × indice pays × indice de l'enseigne (+ biais par rayon). C'est une **estimation**, remplacée dès qu'un ticket validé donne le vrai prix : médiane des prix au kilo relevés sur 90 jours pour l'enseigne (`observedProvider`, prioritaire sur `estimatedProvider`).

### Nutrition
Calculée à partir de la base d'ingrédients (valeurs pour 100 g, type Ciqual). Si la source importée donne les calories, elles sont utilisées en priorité. Un indice de fiabilité s'affiche quand des ingrédients ne sont pas reconnus.

### Géolocalisation
- **Google Places en secours** : si OpenStreetMap trouve moins de 3 enseignes connues, notre serveur (`/api/stores`) interroge Google Places (secret `GOOGLE_MAPS_API_KEY`, jamais dans le code ni dans l'appli). On ne demande que id, nom, adresse et position, et on ne garde rien en cache. Sans clé, l'appli reste sur OpenStreetMap.
- Bouton « Trouver les magasins près de moi » : position du téléphone (API Geolocation du navigateur, **HTTPS obligatoire** — OK sur Cloudflare, et sur `localhost`), puis supermarchés à 4 km via OpenStreetMap (API Overpass, gratuite, sans clé), rapprochés des enseignes connues.
- Si la localisation est refusée : saisie d'une ville ou d'un code postal (géocodage OpenStreetMap Nominatim).
- En http sur l'IP locale (`http://192.168…:5173`), les navigateurs bloquent la géolocalisation : utilise l'URL Cloudflare.

### Dictionnaire multilingue des aliments (français, portugais, anglais)
`public/lexicon.json` (≈ 520 Ko, 100 Ko compressé) contient **3 423 aliments**, dont **2 955 avec leurs noms dans les 3 langues** ; il est chargé au démarrage et sert à :
- reconnaître un ingrédient dans une recette importée sous n'importe quel nom (« artichaut », « alcachofra », « artichoke » → même ingrédient) ;
- chercher dans le frigo et la liste de courses dans les 3 langues ;
- classer l'aliment par rayon et lui donner ses étiquettes (gluten, lait, porc…) pour les régimes et allergies.

Un ingrédient du dictionnaire sans fiche détaillée est « partiel » : il est reconnu et rangé, mais sans calories ni prix (fiabilité affichée plus bas dans la fiche recette). Les ≈ 110 ingrédients détaillés sont rattachés à leur entrée du dictionnaire.

Régénérer : `npm run lexicon:build` (télécharge la taxonomie des ingrédients d'[Open Food Facts](https://github.com/openfoodfacts/openfoodfacts-server/tree/main/taxonomies/food) — **à citer comme source** ; la licence du contenu de la taxonomie reste à confirmer avant diffusion publique).
- `scripts/lexicon-translations.csv` : ≈ 2 100 noms portugais et français **complétés par traduction (Claude), à relire** ; marqués `x` dans le dictionnaire.
- `scripts/lexicon-corrections.tsv` : corrections d'erreurs de la source (ex. « Leite de cocô » → « leite de coco »).
- Il reste ≈ 470 entrées (noms composés rares : « huile de palme hydrogénée »…) sans l'une des trois langues.
- Les étiquettes de régime et d'allergènes sont déduites des catégories parentes : **indicatives**, pas une garantie.

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
worker/         Cloudflare Worker : routes /api/* (import lien, import photo, ticket, magasins Google, santé)
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
