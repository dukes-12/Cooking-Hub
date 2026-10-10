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
  { id: 'pt-continente', index: 'https://www.continente.pt/sitemap_index.xml', brand: 'continente' },
  { id: 'pt-pingodoce', index: 'https://www.pingodoce.pt/home/sitemap_index.xml', brand: 'pingo-doce' },
  { id: 'pt-auchan', index: 'https://www.auchan.pt/sitemap_index.xml', brand: 'auchan' },
];
const UA = 'CookingHubBot/1.0 (+https://cooking-hub.kronogame.workers.dev; relevé de prix hebdomadaire, quelques pages par heure)';
const PER_INGREDIENT = 4; // produits suivis par ingrédient et par enseigne
const PAGES_PER_RUN = 12;
const REDISCOVER_DAYS = 28;
const PT_FACTOR = 0.9; // indice de prix du Portugal (src/data/reference.ts)
// Sections non alimentaires des sites (on les ignore même si un mot correspond).
const NON_FOOD = /\/(beleza|higiene|limpeza|casa|bebe|animais|bricolage|jardim|electrodomesticos|tecnologia|brinquedos|papelaria|desporto|roupa|saude-e-bem-estar)\//;

// ---------- 1. Découverte ----------

/** Mots de l'adresse d'une page produit, entre tirets : "-arroz-agulha-cigala-1kg-". */
export function slugOf(url) {
  // Auchan met l'identifiant en dernier (".../arroz-agulha-cigala-1kg/40299.html") : on prend alors le segment d'avant.
  const parts = url.split('?')[0].replace(/\.html$/, '').split('/').filter(Boolean);
  const raw = (/^\d+$/.test(parts.at(-1) ?? '') ? parts.at(-2) : parts.at(-1)) ?? '';
  let last = raw;
  try {
    last = decodeURIComponent(raw);
  } catch {
    // adresse mal encodée : on garde le texte brut
  }
  return `-${last.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-')}-`;
}

// Filtre rapide (une seule expression) avant la vérification détaillée : les sitemaps comptent des dizaines de milliers d'adresses.
const ANY_RE = new RegExp(`-(?:${[...new Set(CATALOG.flatMap((e) => e.any))].map((a) => a.replace(/[-]/g, '\\-')).join('|')})-`);

/** Ingrédients du catalogue auxquels correspond une page produit. */
export function matchUrl(url) {
  if (NON_FOOD.test(url)) return [];
  if (!ANY_RE.test(slugOf(url))) return [];
  const s = slugOf(url);
  return CATALOG.filter((e) => e.any.some((a) => s.includes(`-${a}-`)) && !e.not.some((w) => s.includes(`-${w}-`))).map((e) => e.id);
}

/** Garde les meilleurs candidats : marque de l'enseigne d'abord, puis les noms les plus simples (produits de base). */
export function rankCandidates(urls, brand) {
  const score = (u) => (slugOf(u).includes(`-${brand}-`) ? 0 : 1000) + slugOf(u).length;
  return [...new Set(urls)].sort((a, b) => score(a) - score(b)).slice(0, PER_INGREDIENT);
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

/** Un passage : avance d'une étape (un sitemap, ou quelques pages produit, ou la synthèse). */
export async function runScraper(env, now = new Date()) {
  const kv = env.PRICES;
  const week = isoWeek(now);
  const state = await getJson(kv, 'scrape:state', { week: null, phase: 'idle' });
  const tracked = await getJson(kv, 'scrape:tracked', { at: 0, chains: {} });

  // Nouvelle semaine : on (re)découvre les produits si besoin, puis on relève les prix.
  if (state.week !== week) {
    const stale = !tracked.at || now - tracked.at > REDISCOVER_DAYS * 86400000;
    const next = { week, phase: stale ? 'discover' : 'prices', sitemaps: null, queue: null, results: {}, log: [] };
    await kv.put('scrape:state', JSON.stringify(next));
    return `semaine ${week} : ${next.phase}`;
  }

  if (state.phase === 'discover') {
    // Liste des sitemaps produits de chaque enseigne (au premier passage).
    if (!state.sitemaps) {
      state.sitemaps = [];
      for (const c of CHAINS) {
        try {
          for (const u of locs(await fetchText(c.index)).filter((u) => /product/i.test(u))) state.sitemaps.push({ chain: c.id, url: u });
        } catch (e) {
          state.log.push(`${c.id} index: ${e.message}`);
        }
      }
      state.candidates = {};
      await kv.put('scrape:state', JSON.stringify(state));
      return `découverte : ${state.sitemaps.length} sitemaps`;
    }
    const job = state.sitemaps.shift();
    if (job) {
      // Progression enregistrée avant le travail : un passage qui échoue ne bloque pas le cycle sur ce fichier.
      await kv.put('scrape:state', JSON.stringify(state));
      try {
        const cand = (state.candidates[job.chain] ??= {});
        for (const u of locs(await fetchText(job.url))) for (const id of matchUrl(u)) (cand[id] ??= []).push(u);
        const brand = CHAINS.find((c) => c.id === job.chain).brand;
        for (const id of Object.keys(cand)) cand[id] = rankCandidates(cand[id], brand);
      } catch (e) {
        state.log.push(`${job.url}: ${e.message}`);
      }
      await kv.put('scrape:state', JSON.stringify(state));
      return `sitemap lu : ${job.url}`;
    }
    await kv.put('scrape:tracked', JSON.stringify({ at: now.getTime(), chains: state.candidates }));
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
    const batch = state.queue.splice(0, PAGES_PER_RUN);
    await kv.put('scrape:state', JSON.stringify(state));
    for (const { chain, id, url } of batch) {
      try {
        const v = toPerKg(id, parseProductPage(await fetchText(url), url));
        if (v != null) ((state.results[chain] ??= {})[id] ??= []).push(v);
      } catch (e) {
        if (state.log.length < 50) state.log.push(`${url}: ${e.message}`);
      }
    }
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
