// Serveur Cooking Hub pour le développement local (en ligne, ce sont les Cloudflare Worker de worker/index.js).
//  - GET  /api/import?url=…  : extrait le bloc schema.org "Recipe" (JSON-LD) d'une page de recette.
//  - GET  /api/stores, /api/geocode : magasins et lieux via Google Places (GOOGLE_MAPS_API_KEY).
//  - GET  /api/prices, /api/off/product, /api/off/category : Open Prices et Open Food Facts (avec cache).
//  - GET  /api/config        : clé navigateur de la carte Google (GOOGLE_MAPS_BROWSER_KEY).
//  - POST /api/photo         : lit une recette sur 1 à 4 photos (Claude). Nécessite ANTHROPIC_API_KEY.
//  - Sert aussi l'app compilée (dist/) après `npm run build`.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findStoresGoogle, geocodeGoogle, importFromUrl, offCategory, offProduct, offUserAgent, openPrices, publicConfig, receiptFromPhotos, recipeFromPhotos } from './core.mjs';

const PORT = Number(process.env.PORT ?? 8787);
const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.png': 'image/png' };

// Petit cache mémoire pour Open Food Facts / Open Prices (en ligne, c'est le cache de Cloudflare).
const memo = new Map();
async function cachedJson(res, key, ttlMs, compute) {
  const hit = memo.get(key);
  if (hit && hit.until > Date.now()) return json(res, 200, hit.body);
  const { status, body } = await compute();
  if (status === 200) memo.set(key, { body, until: Date.now() + ttlMs });
  return json(res, status, body);
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(body));
}

async function readJson(req, limit = 20_000_000) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new Error('too large');
    chunks.push(c);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function serveStatic(res, pathname) {
  const safe = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  let file = join(DIST, safe);
  try {
    if (!(await stat(file)).isFile()) throw new Error();
  } catch {
    file = join(DIST, 'index.html'); // routage côté client
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('Lance `npm run build` pour générer dist/, ou `npm run dev` pour développer.');
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  if (url.pathname === '/api/health') return json(res, 200, { ok: true, photo: !!process.env.ANTHROPIC_API_KEY, places: !!process.env.GOOGLE_MAPS_API_KEY, map: !!process.env.GOOGLE_MAPS_BROWSER_KEY });
  const ua = offUserAgent(process.env);
  const q = url.searchParams;
  if (url.pathname === '/api/prices') return cachedJson(res, url.pathname + url.search, 12 * 3600e3, () => openPrices({ cat: q.get('cat'), code: q.get('code'), country: q.get('country'), currency: q.get('currency') }, ua));
  if (url.pathname === '/api/off/product') return cachedJson(res, url.pathname + url.search, 7 * 86400e3, () => offProduct(q.get('code'), ua));
  if (url.pathname === '/api/off/category') return cachedJson(res, url.pathname + url.search, 7 * 86400e3, () => offCategory({ cat: q.get('cat'), country: q.get('country') }, ua));
  if (url.pathname === '/api/config') return json(res, 200, publicConfig(process.env));
  if (url.pathname === '/api/geocode') {
    const { status, body } = await geocodeGoogle({ q: url.searchParams.get('q'), country: url.searchParams.get('country') }, process.env.GOOGLE_MAPS_API_KEY);
    return json(res, status, body);
  }
  if (url.pathname === '/api/stores') {
    const { status, body } = await findStoresGoogle({ lat: q.get('lat'), lon: q.get('lon'), radiusM: q.get('radius') }, process.env.GOOGLE_MAPS_API_KEY);
    return json(res, status, body);
  }
  if (url.pathname === '/api/import') {
    const { status, body } = await importFromUrl(url.searchParams.get('url'));
    return json(res, status, body);
  }
  if (url.pathname === '/api/receipt' && req.method === 'POST') {
    let payload;
    try {
      payload = await readJson(req);
    } catch {
      return json(res, 400, { error: 'Requête invalide ou photos trop lourdes.' });
    }
    const { status, body } = await receiptFromPhotos(payload.images, process.env.ANTHROPIC_API_KEY);
    return json(res, status, body);
  }
  if (url.pathname === '/api/photo' && req.method === 'POST') {
    let payload;
    try {
      payload = await readJson(req);
    } catch {
      return json(res, 400, { error: 'Requête invalide ou photos trop lourdes.' });
    }
    const { status, body } = await recipeFromPhotos(payload.images, process.env.ANTHROPIC_API_KEY);
    return json(res, status, body);
  }
  return serveStatic(res, url.pathname);
});

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  server.listen(PORT, () => console.log(`Cooking Hub API sur http://localhost:${PORT}`));
}
