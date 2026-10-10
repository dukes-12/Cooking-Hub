// Relevé hebdomadaire des prix des enseignes portugaises (Continente, Pingo Doce, Auchan).
//
// Respect des robots.txt : les pages de recherche sont interdites aux robots, mais les plans du site
// (sitemaps) et les pages produit sont autorisés. On procède donc ainsi :
//   1. Découverte (toutes les 4 semaines) : lecture des sitemaps produits, un fichier par passage,
//      et sélection, pour chaque ingrédient de l'appli, de quelques produits dont l'adresse correspond.
//   2. Prix (chaque semaine) : lecture lente de ces pages produit (quelques-unes toutes les 10 minutes),
//      extraction du prix au kilo / au litre.
//   3. Synthèse : médiane par enseigne et par ingrédient → clé KV "chain-prices:PT", servie par /api/chain-prices.
import { INGREDIENT_BY_ID } from '../src/data/ingredients';
import { CATALOG } from './scraper-catalog.js';

export const CHAINS = [
  { id: 'pt-pingodoce', index: 'https://www.pingodoce.pt/home/sitemap_index.xml', brand: 'pingo-doce' },
  { id: 'pt-auchan', index: 'https://www.auchan.pt/sitemap_index.xml', brand: 'auchan' },
  { id: 'pt-continente', index: 'https://www.continente.pt/sitemap_index.xml', brand: 'continente' },
];
const UA = 'CookingHubBot/1.0 (+https://cooking-hub.kronogame.workers.dev; relevé de prix hebdomadaire, quelques pages par heure)';
const PER_INGREDIENT = 4; // produits suivis par ingrédient et par enseigne
const PAGES_PER_RUN = 12;
const URLS_PER_RUN = 1000; // adresses de sitemap traitées par passage (les gros sitemaps sont lus en plusieurs fois)
const REDISCOVER_DAYS = 28;
const PT_FACTOR = 0.9; // indice de prix du Portugal (src/data/reference.ts)
// Sections non alimentaires des sites (on les ignore même si un mot correspond).
const NON_FOOD = /\/(beleza|higiene|limpeza|casa|bebe|animais|bricolage|jardim|electrodomesticos|tecnologia|brinquedos|papelaria|desporto|roupa|saude-e-bem-estar)\//;

// ---------- 1. Découverte ----------

/** Mots de l'adresse d'une page produit, entre tirets : "-arroz-agulha-cigala-1kg-". */
export function slugOf(url) {
  // Auchan met l'identifiant en dernier (".../arroz-agulha-cigala-1kg/40299.html") : on prend alors le segment d'avant.
  const parts = url.split('?')[0].replace(/\.html$/, '').split('/');
  let raw = parts.pop() ?? '';
  if (/^\d*$/.test(raw)) raw = parts.pop() ?? '';
  if (raw.includes('%')) {
    try {
      raw = decodeURIComponent(raw);
    } catch {
      // adresse mal encodée : on garde le texte brut
    }
  }
  raw = raw.toLowerCase();
  // La normalisation Unicode (accents) est coûteuse : seulement si nécessaire.
  if (/[^\x00-\x7f]/.test(raw)) raw = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return `-${raw.replace(/[^a-z0-9]+/g, '-')}-`;
}

// Filtre rapide (une seule expression) avant la vérification détaillée : les sitemaps comptent des dizaines de milliers d'adresses.
const ANY_RE = new RegExp(`-(?:${[...new Set(CATALOG.flatMap((e) => e.any))].map((a) => a.replace(/[-]/g, '\\-')).join('|')})-`);

// Motifs entourés de tirets, préparés une fois pour toutes (la découverte teste des dizaines de milliers d'adresses).
const PATTERNS = CATALOG.map((e) => ({ id: e.id, any: e.any.map((a) => `-${a}-`), not: e.not.map((w) => `-${w}-`) }));

/** Ingrédients du catalogue auxquels correspond une page produit (seul le nom du produit, en fin d'adresse, compte). */
export function matchUrl(url) {
  const s = slugOf(url);
  if (!ANY_RE.test(s)) return [];
  if (NON_FOOD.test(url)) return [];
  const out = [];
  for (const e of PATTERNS) if (e.any.some((a) => s.includes(a)) && !e.not.some((w) => s.includes(w))) out.push(e.id);
  return out;
}

/** Garde les meilleurs candidats : marque de l'enseigne d'abord, puis les noms les plus simples (produits de base). */
export function rankCandidates(urls, brand) {
  const score = (u) => (slugOf(u).includes(`-${brand}-`) ? 0 : 1000) + slugOf(u).length;
  return [...new Set(urls)].sort((a, b) => score(a) - score(b)).slice(0, PER_INGREDIENT);
}

/**
 * Adresses <loc> d'un sitemap, lues au fil du téléchargement : seules celles de [from, from + count) sont gardées
 * et la lecture s'arrête dès que la tranche est complète (les sitemaps des enseignes font jusqu'à 10 Mo).
 * Renvoie aussi `more` : il reste des adresses après la tranche.
 */
export async function streamLocs(body, from, count) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const out = [];
  let buf = '';
  let seen = 0;
  for (;;) {
    const { value, done } = await reader.read();
    buf += done ? decoder.decode() : decoder.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('<loc>')) >= 0) {
      const j = buf.indexOf('</loc>', i);
      if (j < 0) break;
      if (seen >= from) out.push(buf.slice(i + 5, j).trim().replace(/&amp;/g, '&'));
      seen++;
      buf = buf.slice(j + 6);
      if (out.length >= count) {
        await reader.cancel().catch(() => undefined);
        return { urls: out, more: true };
      }
    }
    // Garde seulement la fin du tampon (une balise <loc> peut être coupée entre deux morceaux).
    const k = buf.lastIndexOf('<loc>');
    buf = k >= 0 ? buf.slice(k) : buf.slice(-6);
    if (done) return { urls: out, more: false };
  }
}

const locs = (xml) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, '&'));

// ---------- 2. Prix d'une page produit ----------

const TO_NUM = (s) => Number(String(s).replace(/\s/g, '').replace(',', '.'));

/** Texte visible d'un morceau de HTML. */
function visible(html) {
  return html.replace(/<[^>]+>/g, '').replace(/&euro;/g, '€').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
}

/** Taille du produit lue dans l'adresse ou le nom : "1kg", "6x1l", "2x125g", "500-gr", "0-5-kg". */
export function sizeFromSlug(s) {
  const t = s.replace(/(\d)-(\d)/g, '$1.$2');
  const multi = t.match(/-(\d+)-?x-?(\d+(?:\.\d+)?)-?(kg|g|gr|grs|l|lt|cl|ml)-/);
  const one = t.match(/-(\d+(?:\.\d+)?)-?(kg|g|gr|grs|l|lt|cl|ml)-/);
  const f = { kg: 1000, g: 1, gr: 1, grs: 1, l: 1000, lt: 1000, cl: 10, ml: 1 };
  if (multi) return Number(multi[1]) * Number(multi[2]) * f[multi[3]];
  if (one) return Number(one[1]) * f[one[2]];
  const units = t.match(/-(\d+)-?(un|unidades|ovos)-/);
  return units ? { pieces: Number(units[1]) } : null;
}

/**
 * Prix d'une page produit : prix au kilo / litre affiché par le site (le plus fiable), sinon prix du produit
 * (JSON-LD ou balise "value") divisé par sa taille. Renvoie { perKg } ou { perPiece }.
 */
export function parseProductPage(html, url) {
  const windows = [];
  for (const marker of ['ct-pdp--prices', 'auc-measures--price-per-unit', 'auc-pdp__price', 'product-unit-measure', 'class="prices"']) {
    const i = html.indexOf(marker);
    if (i >= 0) windows.push(visible(html.slice(i, i + 2500)));
  }
  for (const w of windows) {
    const m = w.match(/(\d+(?:\s?[.,]\d+)?)\s*€\s*\/\s*(kg|lt|l)\b/i);
    if (m) return { perKg: TO_NUM(m[1]) };
  }
  for (const w of windows) {
    const m = w.match(/(\d+(?:\s?[.,]\d+)?)\s*€\s*\/\s*(un|dz)\b/i);
    if (m) return { perPiece: TO_NUM(m[1]) / (m[2].toLowerCase() === 'dz' ? 12 : 1) };
  }
  const ld = html.match(/"offers"\s*:\s*\{[^}]*"price"\s*:\s*"?([\d.]+)/)?.[1] ?? html.match(/class="value"[^>]*content="([\d.]+)"/)?.[1];
  const price = ld ? Number(ld) : null;
  const size = sizeFromSlug(slugOf(url));
  if (price && typeof size === 'number' && size > 0) return { perKg: price / (size / 1000) };
  if (price && size?.pieces) return { perPiece: price / size.pieces };
  return null;
}

/** Prix au kilo (ou au litre) pour l'ingrédient, en écartant les valeurs invraisemblables. */
export function toPerKg(ingredientId, parsed) {
  const ing = INGREDIENT_BY_ID[ingredientId];
  if (!ing || !parsed) return null;
  let v = parsed.perKg ?? (parsed.perPiece && ing.pieceG ? (parsed.perPiece / ing.pieceG) * 1000 : null);
  if (!(v > 0)) return null;
  const ref = ing.pricePerKg * PT_FACTOR;
  // Hors de [référence / 5 ; référence × 5] : produit mal identifié (lot, préparation, accessoire…).
  return v >= ref / 5 && v <= ref * 5 ? Math.round(v * 100) / 100 : null;
}

// ---------- 3. Cycle hebdomadaire (appelé par le cron toutes les 10 minutes) ----------

const isoWeek = (d) => {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-W${String(Math.ceil(((t - y) / 86400000 + 1) / 7)).padStart(2, '0')}`;
};

const median = (v) => {
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'pt-PT,pt;q=0.9' }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.text();
}

const getJson = async (kv, key, fallback) => (await kv.get(key, 'json')) ?? fallback;

/** Diagnostic (clé KV "scrape:diag" = liste d'adresses) : statut, durée et taille reçue selon le User-Agent. */
async function diagnose(kv, urls) {
  const out = [];
  for (const url of urls) {
    for (const [name, ua] of [['bot', UA], ['navigateur', 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36']]) {
      const t0 = Date.now();
      try {
        const res = await fetch(url, { headers: { 'User-Agent': ua }, signal: AbortSignal.timeout(30000) });
        const reader = res.body.getReader();
        let bytes = 0;
        while (bytes < 2_000_000) {
          const { value, done } = await reader.read();
          if (done) break;
          bytes += value.length;
        }
        await reader.cancel().catch(() => undefined);
        out.push({ url, ua: name, status: res.status, bytes, ms: Date.now() - t0 });
        if (name === 'bot' && /sitemap/.test(url)) {
          const sample = await fetch(url, { headers: { 'User-Agent': ua } }).then((r) => r.text());
          await kv.put(`scrape:sample:${new URL(url).hostname}`, sample.slice(0, 400000));
        }
      } catch (e) {
        out.push({ url, ua: name, error: String(e), ms: Date.now() - t0 });
      }
    }
  }
  await kv.put('scrape:diag-result', JSON.stringify(out));
}

/** Un passage : avance d'une étape (un sitemap, ou quelques pages produit, ou la synthèse). */
export async function runScraper(env, now = new Date()) {
  const kv = env.PRICES;
  const diag = await kv.get('scrape:diag', 'json');
  if (diag) {
    await kv.delete('scrape:diag');
    await diagnose(kv, diag);
    return 'diagnostic enregistré';
  }
  const week = isoWeek(now);
  const state = await getJson(kv, 'scrape:state', { week: null, phase: 'idle' });
  const tracked = await getJson(kv, 'scrape:tracked', { at: 0, chains: {} });

  // Relance manuelle d'un cycle complet (découverte comprise) : clé "scrape:force" posée dans KV.
  const force = await kv.get('scrape:force');
  if (force) await kv.delete('scrape:force');

  // Nouvelle semaine : on (re)découvre les produits si besoin, puis on relève les prix.
  if (state.week !== week || force) {
    const stale = force || !tracked.at || now - tracked.at > REDISCOVER_DAYS * 86400000;
    const next = { week, phase: stale ? 'discover' : 'prices', sitemaps: null, queue: null, results: {}, log: [] };
    await kv.put('scrape:state', JSON.stringify(next));
    return `semaine ${week} : ${next.phase}`;
  }

  if (state.phase === 'discover') {
    // Premier passage : un index de sitemaps par enseigne, lu lors des passages suivants.
    if (!state.sitemaps) {
      state.sitemaps = CHAINS.map((c) => ({ chain: c.id, url: c.index, isIndex: true, tries: 0 }));
      state.candidates = {};
      await kv.put('scrape:state', JSON.stringify(state));
      return `découverte : ${CHAINS.length} enseignes`;
    }
    if (state.sitemaps[0]?.isIndex) {
      const job = state.sitemaps.shift();
      let msg;
      try {
        const subs = locs(await fetchText(job.url)).filter((u) => /product/i.test(u));
        state.sitemaps.unshift(...subs.map((url) => ({ chain: job.chain, url })));
        msg = `${job.chain} : ${subs.length} sitemaps produits`;
      } catch (e) {
        // Erreur passagère (502…) : on réessaie plus tard dans le cycle, deux fois au plus.
        if (job.tries < 2) state.sitemaps.push({ ...job, tries: job.tries + 1 });
        msg = `${job.chain} index : ${e.message}`;
      }
      state.log = [...state.log, msg].slice(-30);
      await kv.put('scrape:state', JSON.stringify(state));
      return msg;
    }
    // Passage précédent encore en cours (gros fichier lent à télécharger) : on attend.
    // Au-delà de 5 minutes, on le considère comme arrêté (limite de calcul) : on le note et on continue.
    if (state.current) {
      if (now - (state.current.startedAt ?? 0) < 5 * 60000) return 'passage précédent en cours';
      state.log.push(`échec : ${state.current.url} à partir de ${state.current.offset ?? 0}`);
      state.current = null;
    }
    const job = state.sitemaps.shift();
    if (job) {
      // Progression enregistrée avant le travail : un passage qui échoue ne bloque pas le cycle sur ce fichier.
      state.current = { ...job, startedAt: now.getTime() };
      await kv.put('scrape:state', JSON.stringify(state));
      const offset = job.offset ?? 0;
      const t0 = Date.now();
      let msg;
      try {
        const res = await fetch(job.url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60000) });
        if (!res.ok || !res.body) throw new Error(`${res.status}`);
        const { urls, more } = await streamLocs(res.body, offset, URLS_PER_RUN);
        const cand = (state.candidates[job.chain] ??= {});
        let hits = 0;
        for (const u of urls) for (const id of matchUrl(u)) (cand[id] ??= []).push(u), hits++;
        const brand = CHAINS.find((c) => c.id === job.chain).brand;
        for (const id of Object.keys(cand)) cand[id] = rankCandidates(cand[id], brand);
        if (more) state.sitemaps.unshift({ ...job, offset: offset + URLS_PER_RUN });
        msg = `sitemap ${job.url} [${offset}-${offset + urls.length}] : ${hits} correspondances (${Math.round((Date.now() - t0) / 1000)} s)`;
      } catch (e) {
        msg = `${job.url}: ${e.message}`;
      }
      state.current = null;
      state.log = [...state.log, msg].slice(-30);
      await kv.put('scrape:state', JSON.stringify(state));
      return msg;
    }
    // Une enseigne sans résultat ce cycle (site indisponible) garde ses produits suivis précédents.
    const chains = { ...tracked.chains };
    for (const [chain, byId] of Object.entries(state.candidates)) if (Object.keys(byId).length) chains[chain] = byId;
    await kv.put('scrape:tracked', JSON.stringify({ at: now.getTime(), chains }));
    Object.assign(state, { phase: 'prices', candidates: undefined, sitemaps: undefined });
    await kv.put('scrape:state', JSON.stringify(state));
    return 'découverte terminée';
  }

  if (state.phase === 'prices') {
    if (!state.queue) {
      state.queue = [];
      for (const [chain, byId] of Object.entries(tracked.chains)) for (const [id, urls] of Object.entries(byId)) for (const url of urls) state.queue.push({ chain, id, url });
      await kv.put('scrape:state', JSON.stringify(state));
      return `prix : ${state.queue.length} pages à lire`;
    }
    if (state.current && now - (state.current.startedAt ?? 0) < 5 * 60000) return 'passage précédent en cours';
    const batch = state.queue.splice(0, PAGES_PER_RUN);
    state.current = { prices: true, startedAt: now.getTime() };
    await kv.put('scrape:state', JSON.stringify(state));
    for (const { chain, id, url } of batch) {
      try {
        const v = toPerKg(id, parseProductPage(await fetchText(url), url));
        if (v != null) ((state.results[chain] ??= {})[id] ??= []).push(v);
      } catch (e) {
        if (state.log.length < 50) state.log.push(`${url}: ${e.message}`);
      }
    }
    state.current = null;
    if (state.queue.length) {
      await kv.put('scrape:state', JSON.stringify(state));
      return `prix : ${batch.length} pages lues, ${state.queue.length} restantes`;
    }
    // Synthèse : médiane par enseigne et par ingrédient.
    const chains = {};
    for (const [chain, byId] of Object.entries(state.results)) {
      chains[chain] = {};
      for (const [id, values] of Object.entries(byId)) chains[chain][id] = { perKg: Math.round(median(values) * 100) / 100, n: values.length, min: Math.min(...values) };
    }
    const previous = await getJson(kv, 'chain-prices:PT', { chains: {} });
    // Un produit non relevé cette semaine garde son prix précédent (marqué ancien).
    for (const [chain, byId] of Object.entries(previous.chains ?? {})) for (const [id, p] of Object.entries(byId)) if (!chains[chain]?.[id]) (chains[chain] ??= {})[id] = { ...p, stale: true };
    await kv.put('chain-prices:PT', JSON.stringify({ updatedAt: now.toISOString(), week, chains, source: 'Sites des enseignes (pages produit publiques)' }));
    Object.assign(state, { phase: 'done', queue: undefined, results: undefined });
    await kv.put('scrape:state', JSON.stringify(state));
    return 'prix enregistrés';
  }
  return 'rien à faire cette semaine';
}
