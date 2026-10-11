// Illustrations des recettes de base qui n'ont pas de vraie photo : image générée une fois par Workers AI
// (modèle FLUX.1 schnell, offre gratuite de Cloudflare), gardée dans KV et servie ensuite telle quelle.
// Seules les recettes de l'appli sont acceptées (le titre vient du serveur, pas de la requête).
import { SEED_RECIPES } from '../src/data/recipes';

const MODEL = '@cf/black-forest-labs/flux-1-schnell';
const byId = new Map(SEED_RECIPES.map((r) => [r.id, r]));

export function imagePrompt(recipe) {
  const main = recipe.ingredients.filter((i) => !i.optional).slice(0, 5).map((i) => i.name).join(', ');
  return `Appetizing home-cooked dish "${recipe.title}" (${recipe.cuisine} cuisine), made with ${main}. Realistic food photography, served on a plate on a rustic wooden table, natural daylight, shallow depth of field, no text, no people.`;
}

/** Image de la recette : depuis KV si elle existe, sinon générée puis gardée. */
export async function recipeImage(id, env) {
  const recipe = byId.get(id);
  if (!recipe) return new Response('Recette inconnue', { status: 404 });
  const key = `recipe-img:${id}`;
  const cached = await env.PRICES.get(key, 'arrayBuffer');
  const headers = { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=2592000, immutable', 'X-Image-Source': 'Workers AI (FLUX.1 schnell)' };
  if (cached) return new Response(cached, { headers });
  if (!env.AI) return new Response('Génération indisponible', { status: 501 });
  try {
    const out = await env.AI.run(MODEL, { prompt: imagePrompt(recipe), steps: 6 });
    // Décodage base64 natif (via une URL data:) : une boucle JavaScript dépasserait le temps de calcul autorisé.
    const bytes = new Uint8Array(await (await fetch(`data:image/jpeg;base64,${out.image}`)).arrayBuffer());
    await env.PRICES.put(key, bytes);
    return new Response(bytes, { headers });
  } catch (e) {
    return new Response(`Génération impossible : ${e.message}`, { status: 502 });
  }
}

/**
 * Pré-génération (clé KV "recipe-img:warm" présente) : quelques illustrations par passage du cron, pour que la
 * première ouverture soit immédiate. Résultat dans "recipe-img:warm-result".
 */
export async function warmRecipeImages(env, perRun = 1) {
  if (!(await env.PRICES.get('recipe-img:warm'))) return null;
  const done = (await env.PRICES.get('recipe-img:warm-result', 'json')) ?? {};
  // Les images déjà gardées (générées lors d'un passage interrompu) comptent comme faites.
  const todo = [];
  for (const r of SEED_RECIPES) {
    if (todo.length >= perRun) break;
    if (done[r.id] === 'en cours') done[r.id] = 'échec (passage interrompu)';
    if (r.id in done || r.image) continue;
    if (await env.PRICES.get(`recipe-img:${r.id}`, 'stream').then((b) => b && (b.cancel(), true))) done[r.id] = 'ok';
    else todo.push(r);
  }
  for (const r of todo) {
    // Marquée « en cours » avant la génération : si le passage s'arrête net, la suivante la saute.
    done[r.id] = 'en cours';
    await env.PRICES.put('recipe-img:warm-result', JSON.stringify(done));
    const res = await recipeImage(r.id, env);
    done[r.id] = res.ok ? 'ok' : `${res.status} ${(await res.text()).slice(0, 120)}`;
  }
  await env.PRICES.put('recipe-img:warm-result', JSON.stringify(done));
  if (!todo.length) await env.PRICES.delete('recipe-img:warm');
  return `illustrations : ${todo.length} générées`;
}
