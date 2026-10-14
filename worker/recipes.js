// Récolte hebdomadaire de recettes (Teleculinária pour le Portugal ; Marmiton, CuisineAZ et Jow pour la France).
//
// Respect des sites : uniquement les plans du site (sitemaps) et les pages recette, autorisés par leurs
// robots.txt ; peu de pages par semaine. Droit d'auteur : on ne garde que les faits (titre, ingrédients,
// temps, portions, calories, lien vers la photo) et le lien vers la recette d'origine — le texte des
// étapes reste sur le site source, que l'appli ouvre d'un geste.
import { detectEquipment } from '../src/lib/equipment.ts';
import { extractRecipe } from '../server/core.mjs';
import { streamLocs } from './scraper.js';

const UA = 'CookingHubBot/1.0 (+https://cooking-hub.kronogame.workers.dev; quelques recettes par semaine)';
export const SOURCES = [
  {
    id: 'teleculinaria',
    name: 'Teleculinária',
    sitemaps: Array.from({ length: 12 }, (_, i) => `https://teleculinaria.pt/wprm_recipe-sitemap${i ? i + 1 : ''}.xml`),
    page: /^https:\/\/teleculinaria\.pt\/receitas\/[^/]+\/$/,
  },
  {
    id: 'marmiton',
    name: 'Marmiton',
    index: 'https://www.marmiton.org/wsitemap_recipes_index.xml',
    page: /^https:\/\/www\.marmiton\.org\/recettes\/recette_[^/]+\.aspx$/,
  },
  {
    id: 'cuisineaz',
    name: 'CuisineAZ',
    sitemaps: Array.from({ length: 10 }, (_, i) => `https://www.cuisineaz.com/xml/sitemap-cuisineaz-recette-${i + 1}.xml`),
    // robots.txt : pas d'adresses avec « -- », apostrophe ou commençant par « recette(s)-<chiffre> ».
    page: /^https:\/\/www\.cuisineaz\.com\/recettes\/(?!recettes?-\d)(?!.*--)[a-z0-9-]+-\d+\.aspx$/,
  },
  {
    id: 'jow',
    name: 'Jow',
    sitemaps: ['https://jow.fr/sitemap.xml'],
    page: /^https:\/\/jow\.fr\/recipes\/[a-z0-9-]+$/,
  },
];
const PER_SOURCE_PER_WEEK = 40;
const PAGES_PER_RUN = 5;
const SLICE = 400;
const MAX_RECIPES = 3000;
const CHUNK = 200; // recettes par clé KV (on ne relit que le dernier morceau)

const text = (v) => (typeof v === 'string' ? v : Array.isArray(v) ? text(v[0]) : v && typeof v === 'object' ? text(v.url ?? v['@id'] ?? v.text ?? v.name) : v == null ? '' : String(v));

/** Fiche compacte, sans le texte des étapes. */
/** Tout le texte d'une valeur schema.org (étapes, sections…), à plat. */
const allText = (v) => (typeof v === 'string' ? v : Array.isArray(v) ? v.map(allText).join(' ') : v && typeof v === 'object' ? [v.name, v.text, allText(v.itemListElement ?? '')].filter(Boolean).join(' ') : '');

/** Appareils nécessaires et cuissons de remplacement prévues par la recette (gardés car les étapes ne le sont pas). */
export function recipeEquipment(r) {
  const { equipment, alternatives } = detectEquipment([r.name, r.description, r.keywords, allText(r.recipeInstructions)].map((x) => (typeof x === 'string' ? x : '')).join('\n'));
  return { equipment, ...(Object.keys(alternatives).length ? { equipmentAlt: alternatives } : {}), eqv: EQUIPMENT_VERSION };
}

/** Version de la détection : les recettes lues avec une version plus ancienne sont relues. */
const EQUIPMENT_VERSION = 2;

export function compactRecipe(r, url, source) {
  const ingredients = (Array.isArray(r.recipeIngredient) ? r.recipeIngredient : []).map((x) => String(x).trim()).filter(Boolean);
  if (ingredients.length < 3 || !r.name) return null;
  const steps = Array.isArray(r.recipeInstructions) ? r.recipeInstructions.length : r.recipeInstructions ? 1 : 0;
  return {
    name: String(r.name).replace(/\s*[:|–-]\s*(la meilleure recette|recette.*|receita.*)$/i, '').trim(),
    recipeIngredient: ingredients,
    prepTime: r.prepTime ?? null,
    cookTime: r.cookTime ?? null,
    totalTime: r.totalTime ?? null,
    recipeYield: text(r.recipeYield) || null,
    recipeCategory: text(r.recipeCategory) || null,
    recipeCuisine: text(r.recipeCuisine) || null,
    keywords: typeof r.keywords === 'string' ? r.keywords.slice(0, 200) : null,
    image: text(r.image) || null,
    nutrition: r.nutrition?.calories ? { calories: text(r.nutrition.calories) } : null,
    stepCount: steps,
    ...recipeEquipment(r),
    url,
    source,
  };
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'pt-PT,fr-FR;q=0.9' }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.text();
}

const isoWeek = (d) => {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-W${String(Math.ceil(((t - y) / 86400000 + 1) / 7)).padStart(2, '0')}`;
};

/** Un passage : collecte d'adresses (une tranche de sitemap) ou lecture de quelques recettes. */
export async function runRecipes(env, now = new Date()) {
  const kv = env.PRICES;
  const week = isoWeek(now);
  const state = (await kv.get('recipes:state', 'json')) ?? { week: null, cursors: {}, failed: [] };
  if (state.current && now - state.current < 5 * 60000) return 'recettes : passage précédent en cours';

  if (state.week !== week) {
    Object.assign(state, { week, phase: 'collect', queue: [], exhausted: {}, quota: Object.fromEntries(SOURCES.map((s) => [s.id, PER_SOURCE_PER_WEEK])), tries: 0, current: null });
    await kv.put('recipes:state', JSON.stringify(state));
    return `recettes : semaine ${week}`;
  }
  // Source ajoutée en cours de semaine : elle reçoit son quota et la récolte reprend.
  for (const src of SOURCES) {
    if (state.quota[src.id] != null) continue;
    state.quota[src.id] = PER_SOURCE_PER_WEEK;
    if (state.phase !== 'fetch') state.phase = 'collect';
  }
  state.current = now.getTime();
  await kv.put('recipes:state', JSON.stringify(state));
  // Index léger : adresses déjà récoltées et nombre de morceaux "recipes:chunk:N".
  const index = (await kv.get('recipes:index', 'json')) ?? { chunks: 0, count: 0, urls: [], equipV: EQUIPMENT_VERSION };
  const known = new Set([...index.urls, ...(state.failed ?? [])]);
  let msg = 'recettes : rien à faire cette semaine';

  // Recettes ciblées (ex. sauces) : liste d'adresses posée dans « recipes:wanted », lue en priorité.
  const wanted = await kv.get('recipes:wanted', 'json');
  if (Array.isArray(wanted) && wanted.length) {
    await kv.delete('recipes:wanted');
    const queued = new Set((state.priority ?? []).map((w) => w.url));
    state.priority = [...(state.priority ?? []), ...wanted.filter((w) => w?.url && SOURCES.some((s) => s.id === w.src && s.page.test(w.url)) && !known.has(w.url) && !queued.has(w.url))];
  }

  try {
    // Relecture des recettes déjà récoltées (version de détection plus récente) : après la récolte de la semaine.
    if (index.count && index.equipV !== EQUIPMENT_VERSION && state.phase === 'done' && !state.priority?.length) {
      // Recettes récoltées avant la détection des appareils : on relit leur page (5 par passage).
      let todo = PAGES_PER_RUN;
      for (let n = 0; n < index.chunks && todo > 0; n++) {
        const chunk = (await kv.get(`recipes:chunk:${n}`, 'json')) ?? [];
        let changed = false;
        for (const c of chunk) {
          if (c.eqv === EQUIPMENT_VERSION || todo <= 0) continue;
          todo--;
          try {
            Object.assign(c, recipeEquipment(extractRecipe(await fetchText(c.url)) ?? { name: c.name }));
          } catch {
            Object.assign(c, recipeEquipment({ name: c.name }));
          }
          changed = true;
        }
        if (changed) await kv.put(`recipes:chunk:${n}`, JSON.stringify(chunk));
      }
      if (todo > 0) {
        index.equipV = EQUIPMENT_VERSION;
        await kv.put('recipes:index', JSON.stringify(index));
      }
      msg = `recettes : appareils relus (${PAGES_PER_RUN - todo})`;
    } else if (state.phase === 'collect' && !state.priority?.length) {
      // Les sources tournent : chacune lit la tranche suivante de ses sitemaps, jusqu'à son quota de la semaine
      // ou jusqu'à avoir parcouru tous ses sitemaps.
      const open = SOURCES.filter((s) => state.quota[s.id] > 0 && !state.exhausted?.[s.id]);
      const src = open[state.tries % Math.max(1, open.length)];
      if (!src || state.tries > 120) {
        state.phase = 'fetch';
        msg = `recettes : ${state.queue.length} à lire`;
      } else {
        state.tries++;
        const cur = (state.cursors[src.id] ??= { sitemap: 0, offset: 0, list: null });
        if (!cur.list) {
          cur.list = src.sitemaps ?? (await streamLocs((await fetch(src.index, { headers: { 'User-Agent': UA } })).body, 0, 500)).urls;
          cur.sitemap = 0;
          cur.offset = 0;
        }
        const res = await fetch(cur.list[cur.sitemap], { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60000) });
        if (!res.ok || !res.body) throw new Error(`${res.status}`);
        const { urls, more } = await streamLocs(res.body, cur.offset, SLICE);
        const fresh = urls.filter((u) => src.page.test(u) && !known.has(u)).slice(0, state.quota[src.id]);
        state.queue.push(...fresh.map((url) => ({ src: src.id, url })));
        state.quota[src.id] -= fresh.length;
        cur.offset += SLICE;
        if (!more) {
          // Fin du fichier : sitemap suivant (on reprend au début quand tout a été parcouru).
          cur.sitemap = (cur.sitemap + 1) % cur.list.length;
          cur.offset = 0;
          if (cur.sitemap === 0) {
            cur.list = null;
            (state.exhausted ??= {})[src.id] = true;
          }
        }
        msg = `recettes : ${src.name}, ${fresh.length} nouvelles adresses`;
      }
    } else if (state.priority?.length || state.phase === 'fetch') {
      // Recettes demandées (clé « recipes:wanted ») d'abord, puis la file de la semaine.
      const fromPriority = !!state.priority?.length;
      const batch = fromPriority ? state.priority.splice(0, PAGES_PER_RUN) : state.queue.splice(0, PAGES_PER_RUN);
      let added = 0;
      const lastKey = `recipes:chunk:${Math.max(0, index.chunks - 1)}`;
      let chunk = index.chunks ? ((await kv.get(lastKey, 'json')) ?? []) : [];
      for (const { src, url } of batch) {
        try {
          const r = extractRecipe(await fetchText(url));
          const c = r && compactRecipe(r, url, SOURCES.find((s) => s.id === src).name);
          if (c && !known.has(url)) {
            if (chunk.length >= CHUNK || !index.chunks) {
              if (index.chunks && chunk.length) await kv.put(lastKey, JSON.stringify(chunk));
              chunk = [];
              index.chunks++;
            }
            chunk.push(c);
            index.urls.push(url);
            index.count++;
            known.add(url);
            added++;
          }
          else state.failed = [...(state.failed ?? []), url].slice(-2000);
        } catch {
          state.failed = [...(state.failed ?? []), url].slice(-2000);
        }
      }
      if (added) {
        await kv.put(`recipes:chunk:${index.chunks - 1}`, JSON.stringify(chunk));
        await kv.put('recipes:index', JSON.stringify(index));
      }
      if (!fromPriority && (!state.queue.length || index.count >= MAX_RECIPES)) state.phase = 'done';
      msg = `recettes : ${added} ajoutées (${index.count} au total), ${fromPriority ? `${state.priority.length} demandées` : state.queue.length} restantes`;
    }
  } catch (e) {
    msg = `recettes : erreur ${e.message}`;
  }
  state.current = null;
  await kv.put('recipes:state', JSON.stringify(state));
  return msg;
}

/** Toutes les recettes récoltées, en assemblant les morceaux sans les relire (simple concaténation de texte). */
export async function recipesJson(kv) {
  const index = (await kv.get('recipes:index', 'json')) ?? { chunks: 0 };
  const parts = await Promise.all(Array.from({ length: index.chunks }, (_, i) => kv.get(`recipes:chunk:${i}`)));
  const inner = parts.filter(Boolean).map((p) => p.trim().slice(1, -1)).filter((p) => p.trim());
  return `[${inner.join(',')}]`;
}
