// Point d'entrée Cloudflare Workers : les routes /api/* passent par ici,
// tout le reste (l'app compilée dans dist/) est servi directement comme fichiers statiques.
import { findStoresGoogle, importFromUrl, receiptFromPhotos, recipeFromPhotos } from '../server/core.mjs';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/health') {
      return Response.json({ ok: true, photo: !!env.ANTHROPIC_API_KEY, places: !!env.GOOGLE_MAPS_API_KEY });
    }
    if (url.pathname === '/api/import' && request.method === 'GET') {
      const { status, body } = await importFromUrl(url.searchParams.get('url'));
      return Response.json(body, { status });
    }
    if (url.pathname === '/api/stores' && request.method === 'GET') {
      const q = url.searchParams;
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
