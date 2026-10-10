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

/** images : [{ mediaType, data (base64) }] */
export async function recipeFromPhotos(images, apiKey) {
  if (!apiKey) {
    return { status: 501, body: { error: 'Import photo non configuré : ajoute la variable ANTHROPIC_API_KEY côté serveur.' } };
  }
  if (!Array.isArray(images) || images.length === 0 || images.length > 4) {
    return { status: 400, body: { error: 'Envoie entre 1 et 4 photos.' } };
  }
  if (images.some((i) => !MEDIA_TYPES.includes(i?.mediaType) || typeof i?.data !== 'string' || i.data.length > 6_000_000)) {
    return { status: 400, body: { error: 'Format de photo non pris en charge.' } };
  }

  const client = new Anthropic({ apiKey });
  try {
    const response = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: RECIPE_SCHEMA } },
      messages: [
        {
          role: 'user',
          content: [
            ...images.map((i) => ({ type: 'image', source: { type: 'base64', media_type: i.mediaType, data: i.data } })),
            { type: 'text', text: PHOTO_PROMPT },
          ],
        },
      ],
    });
    if (response.stop_reason === 'refusal') return { status: 422, body: { error: 'La photo n’a pas pu être analysée.' } };
    if (response.stop_reason === 'max_tokens') return { status: 422, body: { error: 'Recette trop longue pour être lue en une fois.' } };
    const text = response.content.find((b) => b.type === 'text')?.text;
    const data = JSON.parse(text ?? '{}');
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
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return { status: 429, body: { error: 'Trop de demandes, réessaie dans une minute.' } };
    if (e instanceof Anthropic.AuthenticationError) return { status: 500, body: { error: 'Clé API Anthropic invalide côté serveur.' } };
    if (e instanceof Anthropic.APIError) return { status: 502, body: { error: `Erreur du service d’analyse (${e.status ?? 'réseau'}).` } };
    return { status: 500, body: { error: 'Analyse de la photo impossible.' } };
  }
}
