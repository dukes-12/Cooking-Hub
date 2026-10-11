import { useMemo, useState } from 'react';
import { RecipeRow, useMatches } from '../components/RecipeCard';
import { Chip, ChipGroup, Empty, IngredientPicker, Sheet } from '../components/ui';
import { getIngredient } from '../data/ingredients';
import { CATEGORY_LABELS, CUISINES, getCountry } from '../data/reference';
import { normalize } from '../lib/text';
import { back, go } from '../router';
import { useApp } from '../state';
import type { Category } from '../types';

type Sort = 'score' | 'name' | 'price' | 'time' | 'kcal';

interface Filters {
  categories: Category[];
  maxMin: number;
  maxCost: number;
  maxKcal: number;
  fromFridge: boolean;
  showIncompatible: boolean;
  cuisines: string[];
  /** Sites d'origine (Cooking Hub, Marmiton, Teleculinária, recettes importées…). */
  sources: string[];
  /** Ingrédients que la recette doit contenir. */
  withIngredients: string[];
}

const DEFAULT: Filters = { categories: [], maxMin: 240, maxCost: 15, maxKcal: 1500, fromFridge: false, showIncompatible: false, cuisines: [], sources: [], withIngredients: [] };
const sourceOf = (r: { source?: { name: string }; imported?: boolean; id: string }) => (r.id.startsWith('imp-') ? 'Mes imports' : r.source?.name ?? 'Cooking Hub');

export function Search() {
  return (
    <div className="screen">
      <header className="screen-head">
        <button className="icon-btn" onClick={() => back('/discover')} aria-label="Retour">←</button>
        <h1 className="grow">Rechercher</h1>
        <button className="btn btn-soft btn-sm" onClick={() => go('/import')}>＋ Importer</button>
      </header>
      <RecipeFinder />
    </div>
  );
}

/**
 * Recherche et filtres de recettes. En mode « browse » (onglet Toutes les recettes), on part de toutes les
 * cuisines, triées par nom, pour parcourir le catalogue à la main.
 */
export function RecipeFinder({ browse = false }: { browse?: boolean }) {
  const { state } = useApp();
  const matches = useMatches();
  const [q, setQ] = useState('');
  const [f, setF] = useState<Filters>(() => ({ ...DEFAULT, cuisines: browse ? [] : state.profile.cuisines }));
  const [sort, setSort] = useState<Sort>(browse ? 'name' : 'score');
  const sources = useMemo(() => [...new Set(matches.map((m) => sourceOf(m.adapted.recipe)))].sort((a, b) => a.localeCompare(b, 'fr')), [matches]);
  const [open, setOpen] = useState(false);
  const currency = getCountry(state.profile.country).currency;


  const results = useMemo(() => {
    const n = normalize(q);
    return matches
      .filter((m) => {
        const a = m.adapted;
        const r = a.recipe;
        if (!f.showIncompatible && a.status === 'incompatible') return false;
        if (n && !normalize([r.title, r.cuisine, ...a.lines.map((l) => l.ingredient?.name ?? l.original.name)].join(' ')).includes(n)) return false;
        if (f.categories.length && !f.categories.includes(r.category)) return false;
        if (f.cuisines.length && r.origin && !f.cuisines.includes(r.origin)) return false;
        if (a.totalMin != null && a.totalMin > f.maxMin) return false;
        if (a.costPerServing != null && a.costPerServing > f.maxCost) return false;
        if (f.maxKcal < 1500 && a.nutrition.kcal > f.maxKcal) return false;
        if (f.fromFridge && a.fridgeCoverage < 0.5) return false;
        if (f.sources.length && !f.sources.includes(sourceOf(r))) return false;
        if (f.withIngredients.length && !f.withIngredients.every((id) => a.lines.some((l) => l.ingredient?.id === id || l.original.ingredientId === id))) return false;
        return true;
      })
      .sort((a, b) => {
        if (sort === 'name') return a.adapted.recipe.title.localeCompare(b.adapted.recipe.title, 'fr');
        if (sort === 'price') return (a.adapted.costPerServing ?? 99) - (b.adapted.costPerServing ?? 99);
        if (sort === 'time') return (a.adapted.totalMin ?? 999) - (b.adapted.totalMin ?? 999);
        if (sort === 'kcal') return a.adapted.nutrition.kcal - b.adapted.nutrition.kcal;
        return b.score - a.score;
      });
  }, [matches, q, f, sort]);

  const activeCount =
    f.categories.length + f.cuisines.length + f.sources.length + f.withIngredients.length + (f.maxMin < 240 ? 1 : 0) + (f.maxCost < 15 ? 1 : 0) + (f.maxKcal < 1500 ? 1 : 0) + (f.showIncompatible ? 1 : 0);

  return (
    <>
      <div className="search-bar">
        <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Plat, ingrédient, cuisine…" />
        <button className="btn btn-soft" onClick={() => setOpen(true)}>Filtres{activeCount ? ` · ${activeCount}` : ''}</button>
      </div>
      <div className="chips scroll-x">
        <Chip active={f.fromFridge} onClick={() => setF({ ...f, fromFridge: !f.fromFridge })}>🧊 Avec ce que j’ai</Chip>
        <Chip active={f.maxMin === 25} onClick={() => setF({ ...f, maxMin: f.maxMin === 25 ? 240 : 25 })}>⚡ Moins de 25 min</Chip>
        <Chip active={f.maxCost === state.profile.budgetPerServing} onClick={() => setF({ ...f, maxCost: f.maxCost === state.profile.budgetPerServing ? 15 : state.profile.budgetPerServing })}>💶 Dans mon budget</Chip>
        <Chip active={f.maxKcal === 600} onClick={() => setF({ ...f, maxKcal: f.maxKcal === 600 ? 1500 : 600 })}>🥗 Léger</Chip>
      </div>
      <div className="row between small muted pad-x">
        <span>{results.length} recette{results.length > 1 ? 's' : ''}</span>
        <label>
          Trier :{' '}
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="score">Pertinence</option>
            <option value="name">Nom (A → Z)</option>
            <option value="price">Prix</option>
            <option value="time">Temps</option>
            <option value="kcal">Calories</option>
          </select>
        </label>
      </div>
      <div className="list">
        {results.map((m) => <RecipeRow key={m.adapted.recipe.id} match={m} />)}
        {!results.length && (
          <Empty emoji="🔍" title="Aucune recette">
            <p className="muted">Assouplis les filtres ou importe une recette depuis un site.</p>
          </Empty>
        )}
      </div>

      <Sheet open={open} onClose={() => setOpen(false)} title="Filtres">
        <div className="field">
          <span>Type de plat</span>
          <ChipGroup<Category> options={Object.entries(CATEGORY_LABELS).map(([id, label]) => ({ id: id as Category, label }))} value={f.categories} onChange={(categories) => setF({ ...f, categories })} />
        </div>
        <div className="field">
          <span>Avec ces ingrédients</span>
          {f.withIngredients.length > 0 && (
            <div className="chips">
              {f.withIngredients.map((id) => <Chip key={id} active onClick={() => setF({ ...f, withIngredients: f.withIngredients.filter((x) => x !== id) })}>{getIngredient(id)?.name ?? id} ✕</Chip>)}
            </div>
          )}
          <IngredientPicker exclude={f.withIngredients} placeholder="ex. poulet, courgette, grão-de-bico…" onPick={(ing) => ing && setF({ ...f, withIngredients: [...f.withIngredients, ing.id] })} />
        </div>
        <div className="field">
          <span>Site d'origine</span>
          <ChipGroup options={sources.map((s) => ({ id: s, label: s }))} value={f.sources} onChange={(src) => setF({ ...f, sources: src })} />
        </div>
        <div className="field">
          <span>Cuisines <span className="small muted">{browse ? '(toutes par défaut)' : '(par défaut celles de ton profil)'}</span></span>
          <ChipGroup options={CUISINES.map((c) => ({ id: c.code, label: `${c.flag} ${c.label}` }))} value={f.cuisines} onChange={(cuisines) => setF({ ...f, cuisines })} />
        </div>
        <label className="field">
          <span>Temps total max : <b>{f.maxMin >= 240 ? 'illimité' : `${f.maxMin} min`}</b></span>
          <input type="range" min={10} max={240} step={5} value={f.maxMin} onChange={(e) => setF({ ...f, maxMin: Number(e.target.value) })} />
        </label>
        <label className="field">
          <span>Prix max par portion : <b>{f.maxCost >= 15 ? 'illimité' : `${f.maxCost} ${currency}`}</b></span>
          <input type="range" min={1} max={15} step={0.5} value={f.maxCost} onChange={(e) => setF({ ...f, maxCost: Number(e.target.value) })} />
        </label>
        <label className="field">
          <span>Calories max par portion : <b>{f.maxKcal >= 1500 ? 'illimité' : `${f.maxKcal} kcal`}</b></span>
          <input type="range" min={200} max={1500} step={50} value={f.maxKcal} onChange={(e) => setF({ ...f, maxKcal: Number(e.target.value) })} />
        </label>
        <label className="toggle-row">
          <input type="checkbox" checked={f.showIncompatible} onChange={(e) => setF({ ...f, showIncompatible: e.target.checked })} />
          <span>Afficher aussi les recettes incompatibles avec mon profil</span>
        </label>
        <div className="row gap">
          <button className="btn btn-ghost" onClick={() => setF({ ...DEFAULT, cuisines: browse ? [] : state.profile.cuisines })}>Réinitialiser</button>
          <button className="btn btn-primary grow" onClick={() => setOpen(false)}>Voir {results.length} recettes</button>
        </div>
      </Sheet>
    </>
  );
}
