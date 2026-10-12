// Point d'entrée Cloudflare Workers : les routes /api/* passent par ici,
// tout le reste (l'app compilée dans dist/) est servi directement comme fichiers statiques.
import { findStoresGoogle, geocodeGoogle, importFromUrl, labelFromPhotos, offCategory, offProduct, offUserAgent, openPrices, publicConfig, receiptFromPhotos, recipeFromPhotos } from '../server/core.mjs';

/** Réponses Open Food Facts / Open Prices gardées en cache (Cache API de Cloudflare) pour ménager leurs limites. */
async function cached(request, ttlSeconds, compute) {
  const cache = caches.default;
  const key = new Request(new URL(request.url).toString(), { method: 'GET' });
  const hit = await cache.match(key);
  if (hit) return hit;
  const { status, body } = await compute();
  const res = Response.json(body, { status, headers: status === 200 ? { 'Cache-Control': `public, max-age=${ttlSeconds}` } : {} });
  if (status === 200) await cache.put(key, res.clone());
  return res;
}

import { recipeImage, warmRecipeImages } from './recipeImages.js';
import { recipesJson, runRecipes } from './recipes.js';
import { runScraper } from './scraper.js';

export default {
  async scheduled(event, env, ctx) {
    // Une seule tâche par passage (le forfait gratuit limite le calcul par passage) :
    //  - à :00, :20, :40 → relevé des prix des enseignes portugaises (scraper.js) ;
    //  - à :10 et :50 → récolte de recettes (recipes.js) ; à :30 → illustrations IA à pré-générer (recipeImages.js).
    // Quand les prix de la semaine sont relevés, les créneaux des prix servent aussi aux recettes, et inversement.
    const minute = new Date(event.scheduledTime).getUTCMinutes();
    const task =
      minute % 20 === 0
        ? runScraper(env).then((msg) => (msg === 'rien à faire cette semaine' ? runRecipes(env) : msg))
        : minute === 30
          ? warmRecipeImages(env).then((msg) => msg ?? runRecipes(env))
          : runRecipes(env).then((msg) => (msg.includes('rien à faire') ? warmRecipeImages(env).then((m) => m ?? runScraper(env)) : msg));
    ctx.waitUntil(task.then((msg) => console.log('cron:', msg)));
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    const q = url.searchParams;
    const ua = offUserAgent(env);

    if (url.pathname === '/api/health') {
      return Response.json({ ok: true, photo: !!env.ANTHROPIC_API_KEY, places: !!env.GOOGLE_MAPS_API_KEY, map: !!env.GOOGLE_MAPS_BROWSER_KEY });
    }
    if (url.pathname === '/api/config') {
      return Response.json(publicConfig(env));
    }
    if (url.pathname === '/api/geocode' && request.method === 'GET') {
      const { status, body } = await geocodeGoogle({ q: url.searchParams.get('q'), country: url.searchParams.get('country') }, env.GOOGLE_MAPS_API_KEY);
      return Response.json(body, { status });
    }
    if (url.pathname === '/api/prices' && request.method === 'GET') {
      return cached(request, 12 * 3600, () => openPrices({ cat: q.get('cat'), code: q.get('code'), country: q.get('country'), currency: q.get('currency') }, ua));
    }
    if (url.pathname === '/api/chain-prices' && request.method === 'GET') {
      // Prix en ligne des enseignes (relevé hebdomadaire) ; seul le Portugal est couvert pour l'instant.
      const data = q.get('country') === 'PT' && env.PRICES ? await env.PRICES.get('chain-prices:PT', 'json') : null;
      return Response.json(data ?? { chains: {} }, { headers: { 'Cache-Control': 'public, max-age=3600' } });
    }
    const img = url.pathname.match(/^\/api\/recipe-image\/([a-z0-9-]+)$/);
    if (img && request.method === 'GET') return recipeImage(img[1], env);
    if (url.pathname === '/api/recipes' && request.method === 'GET') {
      // Recettes récoltées chaque semaine (fiches sans le texte des étapes, avec le lien vers la source).
      const cache = caches.default;
      const key = new Request(new URL('/api/recipes', url).toString());
      const hit = await cache.match(key);
      if (hit) return hit;
      const res = new Response(env.PRICES ? await recipesJson(env.PRICES) : '[]', { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=21600' } });
      await cache.put(key, res.clone());
      return res;
    }
    if (url.pathname === '/api/chain-prices/history' && request.method === 'GET') {
      // Évolution hebdomadaire du prix en ligne d'un ingrédient, par enseigne.
      const id = q.get('id') ?? '';
      const h = q.get('country') === 'PT' && env.PRICES ? await env.PRICES.get('chain-history:PT', 'json') : null;
      const chains = {};
      for (const [chain, byId] of Object.entries(h?.series ?? {})) if (byId[id]) chains[chain] = byId[id];
      return Response.json({ id, chains }, { headers: { 'Cache-Control': 'public, max-age=21600' } });
    }
    if (url.pathname === '/api/chain-prices/status' && request.method === 'GET') {
      const st = env.PRICES ? await env.PRICES.get('scrape:state', 'json') : null;
      return Response.json(st ? { week: st.week, phase: st.phase, sitemaps: st.sitemaps?.length ?? null, pages: st.queue?.length ?? null, log: st.log?.slice(-10) } : { phase: 'idle' });
    }
    if (url.pathname === '/api/off/product' && request.method === 'GET') {
      return cached(request, 7 * 86400, () => offProduct(q.get('code'), ua));
    }
    if (url.pathname === '/api/off/category' && request.method === 'GET') {
      return cached(request, 7 * 86400, () => offCategory({ cat: q.get('cat'), country: q.get('country') }, ua));
    }
    if (url.pathname === '/api/import' && request.method === 'GET') {
      const { status, body } = await importFromUrl(url.searchParams.get('url'));
      return Response.json(body, { status });
    }
    if (url.pathname === '/api/stores' && request.method === 'GET') {
      const { status, body } = await findStoresGoogle({ lat: q.get('lat'), lon: q.get('lon'), radiusM: q.get('radius') }, env.GOOGLE_MAPS_API_KEY);
      return Response.json(body, { status });
    }
    if (url.pathname === '/api/photo' && request.method === 'POST') {
      let payload;
      try {
        payload = await request.json();
      } catch {
        return Response.json({ error: 'Requête invalide.' }, { status: 400 });
      }
      const { status, body } = await recipeFromPhotos(payload.images, env.ANTHROPIC_API_KEY);
      return Response.json(body, { status });
    }
    if (url.pathname === '/api/receipt' && request.method === 'POST') {
      let payload;
      try {
        payload = await request.json();
      } catch {
        return Response.json({ error: 'Requête invalide.' }, { status: 400 });
      }
      const { status, body } = await receiptFromPhotos(payload.images, env.ANTHROPIC_API_KEY);
      return Response.json(body, { status });
    }
    if (url.pathname === '/api/label' && request.method === 'POST') {
      let payload;
      try {
        payload = await request.json();
      } catch {
        return Response.json({ error: 'Requête invalide.' }, { status: 400 });
      }
      const { status, body } = await labelFromPhotos(payload.images, env.ANTHROPIC_API_KEY);
      return Response.json(body, { status });
    }
    if (url.pathname.startsWith('/api/')) {
      return Response.json({ error: 'Route inconnue.' }, { status: 404 });
    }
    return env.ASSETS.fetch(request);
  },
};
