// Point d'entrée Cloudflare Workers : les routes /api/* passent par ici,
// tout le reste (l'app compilée dans dist/) est servi directement comme fichiers statiques.
import { findStoresGoogle, geocodeGoogle, importFromUrl, offCategory, offProduct, offUserAgent, openPrices, publicConfig, receiptFromPhotos, recipeFromPhotos } from '../server/core.mjs';

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

export default {
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
    if (url.pathname.startsWith('/api/')) {
      return Response.json({ error: 'Route inconnue.' }, { status: 404 });
    }
    return env.ASSETS.fetch(request);
  },
};
