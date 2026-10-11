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
- Après la création : **Settings → Variables and Secrets** → ajouter les secrets `ANTHROPIC_API_KEY` (import par photo, tickets), `GOOGLE_MAPS_API_KEY` (magasins, villes) et `GOOGLE_MAPS_BROWSER_KEY` (carte).

Test local de l'environnement Cloudflare : `npm run preview:cf`. Déploiement manuel : `npx wrangler login` puis `npm run deploy`.

## Ce que fait l'app

| Écran | Rôle |
|---|---|
| **Onboarding** | Foyer, pays des courses (prix) et cuisines souhaitées (indépendantes du pays : FR, PT, IT…), magasins (géolocalisation via Google Maps ou choix manuel), régime, allergies, interdits, aliments aimés / détestés, équipement, rythme (express → mijoté), budget/portion, objectif calorique. |
| **Découvrir** | Pile de cartes à swiper : → favori, ← passer, ↑ ajouter au menu. Classées par score de compatibilité (goûts, temps, budget, frigo, calories). |
| **Recherche** (🔍 depuis Découvrir) | Texte + filtres (type de plat, cuisine, temps, prix/portion, calories, « avec ce que j'ai »), tri par pertinence / prix / temps / calories. |
| **Fiche recette** | Format uniformisé : temps, kcal, coût/portion, difficulté, ingrédients mis à l'échelle, état frigo de chaque ingrédient, remplacements (⇄), comparatif de prix par enseigne, macros, étapes cochables, « J'ai cuisiné » (décompte le frigo). |
| **Photos des recettes** | Ta photo (📷 sur la fiche, gardée sur l'appareil dans IndexedDB) › photo du site d'origine › photo libre du plat sur Wikimedia Commons (recherche Wikidata par nom exact, FR/PT/EN, avec crédit) › émoji. |
| **Recettes** | Menu de la semaine (portions, coût total), favoris, recettes importées. |
| **Frigo** | Inventaire par rayon + suggestions « à cuisiner avec ce que tu as ». |
| **Courses** | Liste générée depuis le menu, moins le frigo et le placard, triée par rayon ; meilleure enseigne, économie possible en partageant entre 2 enseignes ; **mode magasin** plein écran (gros boutons, écran maintenu allumé, hors-ligne) ; les articles achetés vont dans le frigo. |
| **Magasins** | Tes magasins (ex. « Continente Lumiar ») avec le coût d'un panier type et les prix relevés ; **carte Google Maps** des supermarchés autour de toi ou d'une ville, ajout en un geste ; **comparatif** de tes magasins : « Mon panier » (les produits de tes tickets, aux quantités habituelles), panier type, et produit par produit (prix payé dans chaque magasin, sinon Open Prices ou estimation). Chaque ticket est rattaché à un magasin précis (trouvé via Google lors de la validation) et peut être déplacé ensuite ; les tickets sans magasin sont signalés. Fiche magasin : prix moyens relevés, tickets, itinéraire Google Maps. |
| **Ticket de caisse** | Photo du ticket (jusqu'à 4 photos, lue par Claude) ou saisie à la main → récapitulatif à vérifier : magasin, date, chaque ligne associée à un produit de l'appli, quantité / format / poids / prix (prix au kilo recalculé), écart avec le total imprimé. Tout est modifiable avant validation. Les prix s'ajoutent au magasin et les articles cochés vont au frigo. |
| **Mes produits** | Un article inconnu (sur un ticket ou dans le frigo) se crée en un geste : « ＋ Nouveau produit ». Rattaché à une grande famille (ex. un sachet d'herbes de marque → Herbes de Provence), il en reprend rayon, calories, allergènes, prix de référence et catégorie Open Prices, et apparaît dans la fiche de la famille. Chaque libellé de ticket validé est retenu : le même article est reconnu tout seul au ticket suivant. |
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
Tout passe par **Google Maps** :
- **Magasins autour** (`/api/stores`) et **recherche de ville** (`/api/geocode`) : notre serveur interroge Google Places (New) avec le secret `GOOGLE_MAPS_API_KEY`, jamais visible dans l'appli. On ne demande que nom, adresse et position (20 supermarchés max. dans un rayon de 4 km), rapprochés des enseignes connues ; rien n'est gardé en cache.
- **Carte** (onglet Magasins) : API Maps JavaScript, chargée dans le navigateur. Elle demande une **seconde clé**, `GOOGLE_MAPS_BROWSER_KEY`, forcément visible par l'appli : dans Google Cloud, restreins-la aux « Sites web » de l'appli (`https://cooking-hub.*.workers.dev/*`) et à la seule « Maps JavaScript API ». Option : `GOOGLE_MAPS_MAP_ID` (style de carte ; sinon `DEMO_MAP_ID`). Sans cette clé, l'appli propose d'ouvrir Google Maps.
- **Itinéraire** : lien vers Google Maps (appli ou site), sans clé.
- Position du téléphone : API Geolocation du navigateur, **HTTPS obligatoire** (OK sur Cloudflare et sur `localhost`).
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
  lib/         adapt (adaptation + score), pricing, shopping, importer (schema.org → Recipe), geo (Google Maps via le serveur), units
  screens/     un fichier par écran
  components/  UI partagée (chips, stepper, sheet, picker d'ingrédients, cartes)
  state.tsx    état global persisté en localStorage
public/        manifest PWA + service worker (hors-ligne)
```

## Prix réels et données produits : Open Prices et Open Food Facts

Ordre des sources de prix (`src/lib/pricing.ts`) : **tes tickets** (médiane 90 jours par enseigne) → **prix en ligne de l'enseigne** (Portugal, relevé chaque semaine, voir ci-dessous) → **Open Prices** (médiane de l'enseigne si ≥ 2 relevés, sinon médiane du pays si ≥ 3 relevés × indice de l'enseigne ; valeurs aberrantes écartées) → **estimation**.

- **Catégories** : chaque aliment du dictionnaire porte sa catégorie Open Food Facts (champ `k` de `public/lexicon.json`, ex. `en:chicken-breasts`), calculée par `npm run lexicon:categories` à partir de la taxonomie des catégories ; corrections manuelles dans `CATEGORY_OVERRIDES` (`src/lib/openprices.ts`).
- **Serveur** (`server/core.mjs`, routes du Worker, réponses mises en cache 12 h à 7 jours) :
  - `GET /api/prices?cat=en:…&country=PT&currency=EUR` : relevés Open Prices des 12 derniers mois (produits en vrac via `category_tag`, produits emballés via les catégories de leur fiche), filtrés par pays, convertis en prix au kilo ;
  - `GET /api/off/category?cat=en:…&country=PT` : produits les plus scannés du rayon (photo, Nutri-Score, valeurs nutritionnelles) ;
  - `GET /api/off/product?code=…` : fiche d'un produit par code-barres.
  - User-Agent `CookingHub/1.0 (contact)` demandé par Open Food Facts : secret `OFF_CONTACT` du Worker.
- **Dans l'appli** : prix « Open Prices » dans les fiches produit, recettes et comparatifs ; section « Prix de la communauté » (par enseigne) et « Dans les rayons » ; photo et valeurs moyennes pour 100 g quand le produit n'en a pas ; bouton **Code-barres** dans le frigo : scan caméra, photo du code ou saisie des chiffres ; lecteur intégré du navigateur quand il existe (Chrome Android), sinon décodeur ZXing en WebAssembly (`barcode-detector`, fichier servi par l'appli) — marche donc aussi sur iPhone.
- **Licences** : données Open Food Facts et Open Prices sous **ODbL** (citées dans l'appli), photos sous **CC BY-SA**.
### Relevé hebdomadaire des prix au Portugal (Continente, Pingo Doce, Auchan)

`worker/scraper.js`, lancé par le cron du Worker (`wrangler.jsonc`, toutes les 10 minutes, une petite étape à chaque fois), résultat dans Cloudflare KV (`PRICES`) et servi par `GET /api/chain-prices?country=PT` (état : `/api/chain-prices/status`).

- **Respect des robots.txt** : les pages de recherche des trois sites sont interdites aux robots ; on n'utilise que les **plans du site (sitemaps)** et les **pages produit**, qui sont autorisés. User-Agent identifié (`CookingHubBot/1.0` + adresse de l'appli), 12 pages toutes les 10 minutes réparties sur les trois sites.
- **Découverte** (toutes les 4 semaines) : lecture des sitemaps produits, et pour chaque ingrédient, choix de 4 produits dont l'adresse correspond (`worker/scraper-catalog.js` : mots portugais attendus et exclus ; marque de l'enseigne et produits les plus simples d'abord).
- **Relevé** (chaque semaine) : prix au kilo / litre affiché sur la page produit, sinon prix ÷ format ; valeurs aberrantes écartées (hors de ×5 / ÷5 du prix de référence).
- **Résultat** : médiane par enseigne et par ingrédient = prix global de l'enseigne ; un produit non relevé une semaine garde son prix précédent.
- Intermarché, Minipreço et El Corte Inglés bloquent les requêtes venant de Cloudflare ; Lidl et Aldi n'ont pas de boutique en ligne avec prix.
- ⚠️ Les conditions d'utilisation des sites peuvent interdire l'extraction automatique, même quand le robots.txt l'autorise : usage personnel, faible fréquence ; à revoir avant toute diffusion publique de l'appli.

- Pistes : renvoyer les tickets validés vers Open Prices (compte Open Food Facts, avec l'accord de l'utilisateur) ; collecte automatique sur les sites des enseignes (voir CGU).

## Limites du prototype & prochaines étapes
- **Prix** : estimations quand ni tes tickets ni Open Prices n'ont de relevé (voir ci-dessus).
- **Base d'ingrédients** : ~110 ingrédients ; à étendre (ou brancher Open Food Facts / Ciqual) pour mieux reconnaître les recettes importées.
- **Compte & synchro** : les données restent sur l'appareil (localStorage) ; un backend (ex. Supabase ou Cloudflare D1) permettrait de partager frigo et liste au sein du foyer.
