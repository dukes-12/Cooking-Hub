// Mini serveur Cooking Hub (Node, sans dépendance).
//  - GET /api/import?url=…  : récupère une page de recette et extrait le bloc schema.org "Recipe" (JSON-LD).
//    La quasi-totalité des sites de recettes (Marmiton, 750g, Cuisine AZ, Jow, AllRecipes, BBC Good Food…) le publient.
//  - En production, sert aussi l'app compilée (dist/).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT ?? 8787);
const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.png': 'image/png' };

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(body));
}

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

async function handleImport(req, res, url) {
  const target = url.searchParams.get('url');
  let parsed;
  try {
    parsed = new URL(target ?? '');
    if (!/^https?:$/.test(parsed.protocol)) throw new Error();
  } catch {
    return json(res, 400, { error: 'URL invalide.' });
  }
  // Pas d'accès au réseau local depuis l'import.
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[?::1)/.test(parsed.hostname)) {
    return json(res, 400, { error: 'Adresse non autorisée.' });
  }
  try {
    const r = await fetch(parsed, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CookingHub/0.1; +https://github.com/dukes-12/cooking-hub)',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.6',
        Accept: 'text/html',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(12000),
    });
    if (!r.ok) return json(res, 502, { error: `Le site a répondu ${r.status}.` });
    const html = await r.text();
    const recipe = extractRecipe(html);
    if (!recipe) return json(res, 422, { error: 'Aucune recette structurée trouvée sur cette page. Essaie la saisie manuelle.' });
    const siteName = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)/i)?.[1];
    return json(res, 200, { recipe, url: r.url, siteName });
  } catch (e) {
    return json(res, 502, { error: `Impossible de récupérer la page (${e.name === 'TimeoutError' ? 'délai dépassé' : e.message}).` });
  }
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
  if (url.pathname === '/api/health') return json(res, 200, { ok: true });
  if (url.pathname === '/api/import') return handleImport(req, res, url);
  return serveStatic(res, url.pathname);
});

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  server.listen(PORT, () => console.log(`Cooking Hub API sur http://localhost:${PORT}`));
}
