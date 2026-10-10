// Logique serveur partagée entre le serveur Node local (server/index.mjs)
// et les Cloudflare Worker (worker/index.js).
import Anthropic from '@anthropic-ai/sdk';

// ---------- Import depuis une URL (schema.org Recipe en JSON-LD) ----------

function findRecipe(node) {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const r = findRecipe(n);
      if (r) return r;
    }
    return null;
  }
  const type = node['@type'];
  if (type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'))) return node;
  return findRecipe(node['@graph']) ?? findRecipe(node.mainEntity) ?? null;
}

export function extractRecipe(html) {
  const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const [, raw] of blocks) {
    try {
      const r = findRecipe(JSON.parse(raw.trim()));
      if (r) return r;
    } catch {
      // JSON-LD invalide sur certains sites : on passe au bloc suivant.
    }
  }
  return null;
}

/** Renvoie { status, body } — indépendant du runtime (Node ou Workers). */
export async function importFromUrl(target) {
  let parsed;
  try {
    parsed = new URL(target ?? '');
    if (!/^https?:$/.test(parsed.protocol)) throw new Error();
  } catch {
    return { status: 400, body: { error: 'URL invalide.' } };
  }
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[?::1)/.test(parsed.hostname)) {
    return { status: 400, body: { error: 'Adresse non autorisée.' } };
  }
  try {
    const r = await fetch(parsed, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CookingHub/0.1)',
        'Accept-Language': 'fr-FR,fr;q=0.9,pt-PT;q=0.8,en;q=0.6',
        Accept: 'text/html',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(12000),
    });
    if (!r.ok) return { status: 502, body: { error: `Le site a répondu ${r.status}.` } };
    const html = await r.text();
    const recipe = extractRecipe(html);
    if (!recipe) return { status: 422, body: { error: 'Aucune recette structurée trouvée sur cette page. Essaie la photo ou le copier-coller.' } };
    const siteName = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)/i)?.[1];
    return { status: 200, body: { recipe, url: r.url, siteName } };
  } catch (e) {
    return { status: 502, body: { error: `Impossible de récupérer la page (${e.name === 'TimeoutError' ? 'délai dépassé' : e.message}).` } };
  }
}

// ---------- Import depuis une photo (Claude, vision) ----------

const RECIPE_SCHEMA = {
  type: 'object',
  properties: {
    found: { type: 'boolean', description: 'false si les images ne contiennent pas de recette' },
    name: { type: 'string' },
    servings: { type: 'integer' },
    prepMinutes: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
    cookMinutes: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
    category: { type: 'string', enum: ['plat', 'entree', 'soupe', 'salade', 'dessert', 'petit-dej', 'snack'] },
    cuisine: { type: 'string' },
    ingredients: { type: 'array', items: { type: 'string' } },
    steps: { type: 'array', items: { type: 'string' } },
  },
  required: ['found', 'name', 'servings', 'prepMinutes', 'cookMinutes', 'category', 'cuisine', 'ingredients', 'steps'],
  additionalProperties: false,
};

const PHOTO_PROMPT = `Ces images montrent une recette (page de livre, fiche manuscrite, capture d'écran, emballage…), éventuellement sur plusieurs pages dans l'ordre.
Transcris-la fidèlement en français :
- ingredients : une ligne par ingrédient, au format « quantité unité ingrédient » (ex. « 200 g de farine », « 2 c. à soupe d'huile d'olive », « 3 oeufs »). Convertis les unités impériales en métriques.
- steps : une étape par élément, sans numéro.
- servings : nombre de portions indiqué, sinon ton estimation.
- prepMinutes / cookMinutes : seulement s'ils sont indiqués, sinon null.
- Si une partie est illisible, transcris ce qui est lisible sans inventer.
Si les images ne contiennent pas de recette, mets found à false et laisse les listes vides.`;

const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/**
 * Envoie 1 à 4 photos à Claude avec une consigne et un schéma JSON (sortie structurée).
 * Renvoie { status, data } ou { status, body: { error } }.
 */
async function readPhotosWithClaude(images, prompt, schema, apiKey, what) {
  if (!apiKey) {
    return { status: 501, body: { error: 'Lecture de photo non configurée : ajoute la variable ANTHROPIC_API_KEY côté serveur.' } };
  }
  if (!Array.isArray(images) || images.length === 0 || images.length > 4) {
    return { status: 400, body: { error: 'Envoie entre 1 et 4 photos.' } };
  }
  if (images.some((i) => !MEDIA_TYPES.includes(i?.mediaType) || typeof i?.data !== 'string' || i.data.length > 8_000_000)) {
    return { status: 400, body: { error: 'Format de photo non pris en charge.' } };
  }
  const client = new Anthropic({ apiKey });
  try {
    const response = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema } },
      messages: [
        {
          role: 'user',
          content: [
            ...images.map((i) => ({ type: 'image', source: { type: 'base64', media_type: i.mediaType, data: i.data } })),
            { type: 'text', text: prompt },
          ],
        },
      ],
    });
    if (response.stop_reason === 'refusal') return { status: 422, body: { error: 'La photo n’a pas pu être analysée.' } };
    if (response.stop_reason === 'max_tokens') return { status: 422, body: { error: `${what} trop long(ue) pour être lu(e) en une fois.` } };
    const text = response.content.find((b) => b.type === 'text')?.text;
    return { status: 200, data: JSON.parse(text ?? '{}') };
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return { status: 429, body: { error: 'Trop de demandes, réessaie dans une minute.' } };
    if (e instanceof Anthropic.AuthenticationError) return { status: 500, body: { error: 'Clé API Anthropic invalide côté serveur.' } };
    if (e instanceof Anthropic.APIError) return { status: 502, body: { error: `Erreur du service d’analyse (${e.status ?? 'réseau'}).` } };
    return { status: 500, body: { error: 'Analyse de la photo impossible.' } };
  }
}

/** images : [{ mediaType, data (base64) }] */
export async function recipeFromPhotos(images, apiKey) {
  const r = await readPhotosWithClaude(images, PHOTO_PROMPT, RECIPE_SCHEMA, apiKey, 'Recette');
  if (!r.data) return r;
  const data = r.data;
  if (!data.found) return { status: 422, body: { error: 'Aucune recette détectée sur la photo.' } };
  // Format schema.org Recipe, pour réutiliser le même convertisseur que l'import par lien.
  return {
    status: 200,
    body: {
      recipe: {
        '@type': 'Recipe',
        name: data.name,
        recipeYield: String(data.servings),
        prepTime: data.prepMinutes ? `PT${data.prepMinutes}M` : undefined,
        cookTime: data.cookMinutes ? `PT${data.cookMinutes}M` : undefined,
        recipeCategory: data.category,
        recipeCuisine: data.cuisine,
        recipeIngredient: data.ingredients,
        recipeInstructions: data.steps,
      },
      siteName: 'Photo',
    },
  };
}

// ---------- Ticket de caisse ----------

const nullable = (type) => ({ anyOf: [{ type }, { type: 'null' }] });

const RECEIPT_SCHEMA = {
  type: 'object',
  properties: {
    found: { type: 'boolean', description: "false si l'image n'est pas un ticket de caisse" },
    storeName: { type: 'string', description: 'Enseigne et magasin, ex. "Continente Lumiar"' },
    storeAddress: { type: 'string' },
    date: { type: 'string', description: 'AAAA-MM-JJ, chaîne vide si illisible' },
    currency: { type: 'string', description: 'Code ISO, ex. EUR' },
    total: nullable('number'),
    lines: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          count: { type: 'number', description: "nombre d'unités achetées (1 par défaut)" },
          size: nullable('number'),
          sizeUnit: { type: 'string', enum: ['kg', 'g', 'l', 'cl', 'ml', 'pc', 'none'] },
          weightKg: nullable('number'),
          unitPrice: nullable('number'),
          totalPrice: { type: 'number' },
        },
        required: ['label', 'count', 'size', 'sizeUnit', 'weightKg', 'unitPrice', 'totalPrice'],
        additionalProperties: false,
      },
    },
  },
  required: ['found', 'storeName', 'storeAddress', 'date', 'currency', 'total', 'lines'],
  additionalProperties: false,
};

const RECEIPT_PROMPT = `Ces images montrent un ticket de caisse de supermarché (France ou Portugal), éventuellement en plusieurs morceaux dans l'ordre.
Transcris chaque article acheté :
- label : le libellé tel qu'imprimé (abréviations comprises).
- count : nombre d'unités (ex. "2 x 1,49" → 2), 1 par défaut.
- size + sizeUnit : la contenance d'UNE unité si elle figure dans le libellé (ex. "LEITE MG 1L" → 1 et "l" ; "YAOURT 4X125G" → 500 et "g") ; sinon null et "none".
- weightKg : pour un article pesé, le poids en kg (ex. "0,532 kg x 7,99 €/kg" → 0.532) ; sinon null.
- unitPrice : prix unitaire ou prix au kg imprimé, sinon null.
- totalPrice : montant payé pour la ligne, APRÈS les remises qui s'y rapportent (une ligne "remise", "desconto", "poupança" se déduit de l'article concerné et n'est pas une ligne à part).
Ignore les lignes de paiement, TVA/IVA, fidélité, rendu de monnaie et sous-totaux.
storeName : enseigne + nom du magasin ; date au format AAAA-MM-JJ ; total : total payé.
N'invente rien : si une valeur est illisible, mets null. Si l'image n'est pas un ticket de caisse, found = false et lines vide.`;

export async function receiptFromPhotos(images, apiKey) {
  const r = await readPhotosWithClaude(images, RECEIPT_PROMPT, RECEIPT_SCHEMA, apiKey, 'Ticket');
  if (!r.data) return r;
  if (!r.data.found || !r.data.lines?.length) return { status: 422, body: { error: 'Aucun ticket de caisse lisible sur la photo.' } };
  return { status: 200, body: { receipt: r.data } };
}

// ---------- Magasins autour d'une position (Google Places API "New") ----------

/**
 * Supermarchés à proximité via Google Places. La clé reste côté serveur (secret GOOGLE_MAPS_API_KEY).
 * On ne demande que id, nom, adresse et position : ce sont les champs les moins chers, et on ne garde
 * rien en cache (les conditions de Google n'autorisent à conserver durablement que le place_id).
 */
export async function findStoresGoogle({ lat, lon, radiusM }, apiKey, fetchImpl = fetch) {
  if (!apiKey) return { status: 501, body: { error: 'Recherche Google non configurée : ajoute le secret GOOGLE_MAPS_API_KEY.' } };
  const la = Number(lat);
  const lo = Number(lon);
  if (!Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) {
    return { status: 400, body: { error: 'Position invalide.' } };
  }
  const radius = Math.min(5000, Math.max(300, Number(radiusM) || 4000));
  try {
    const res = await fetchImpl('https://places.googleapis.com/v1/places:searchNearby', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location',
      },
      body: JSON.stringify({
        includedTypes: ['supermarket', 'grocery_store'],
        maxResultCount: 20,
        rankPreference: 'DISTANCE',
        languageCode: 'fr',
        locationRestriction: { circle: { center: { latitude: la, longitude: lo }, radius } },
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const detail = (await res.json().catch(() => ({})))?.error?.status;
      if (res.status === 403 || res.status === 400) return { status: 502, body: { error: `Google a refusé la requête (${detail ?? res.status}). Vérifie que l'API Places (New) est activée et que la clé n'est pas restreinte à un autre service.` } };
      return { status: 502, body: { error: `Google indisponible (${res.status}).` } };
    }
    const data = await res.json();
    const stores = (data.places ?? [])
      .filter((p) => p.location)
      .map((p) => ({ id: p.id, name: p.displayName?.text ?? '', address: p.formattedAddress ?? '', lat: p.location.latitude, lon: p.location.longitude }));
    return { status: 200, body: { stores, attribution: 'Google' } };
  } catch (e) {
    return { status: 502, body: { error: `Impossible de joindre Google (${e.name === 'TimeoutError' ? 'délai dépassé' : e.message}).` } };
  }
}

/** Position d'une ville / d'un code postal via Google Places (Text Search), avec la même clé serveur. */
export async function geocodeGoogle({ q, country }, apiKey, fetchImpl = fetch) {
  if (!apiKey) return { status: 501, body: { error: 'Recherche Google non configurée : ajoute le secret GOOGLE_MAPS_API_KEY.' } };
  const query = String(q ?? '').trim().slice(0, 200);
  if (!query) return { status: 400, body: { error: 'Indique une ville ou un code postal.' } };
  try {
    const res = await fetchImpl('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': 'places.formattedAddress,places.location' },
      body: JSON.stringify({ textQuery: query, languageCode: 'fr', ...(/^[A-Z]{2}$/.test(country ?? '') ? { regionCode: country } : {}), pageSize: 1 }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { status: 502, body: { error: `Google a refusé la recherche du lieu (${res.status}).` } };
    const hit = (await res.json()).places?.[0];
    if (!hit?.location) return { status: 404, body: { error: `Lieu « ${query} » introuvable.` } };
    return { status: 200, body: { lat: hit.location.latitude, lon: hit.location.longitude, label: hit.formattedAddress ?? query } };
  } catch (e) {
    return { status: 502, body: { error: `Impossible de joindre Google (${e.name === 'TimeoutError' ? 'délai dépassé' : e.message}).` } };
  }
}

/**
 * Réglages publics de l'appli. La carte Google s'affiche dans le navigateur : elle a besoin d'une clé
 * visible par l'appli, donc d'une clé dédiée (GOOGLE_MAPS_BROWSER_KEY) restreinte au domaine du site
 * et à l'API Maps JavaScript — jamais la clé serveur.
 */
export function publicConfig(env) {
  return { mapsKey: env.GOOGLE_MAPS_BROWSER_KEY || null, mapId: env.GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID' };
}
