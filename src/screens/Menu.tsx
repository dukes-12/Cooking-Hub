import { useMemo, useState } from 'react';
import { RecipeRow, useMatches } from '../components/RecipeCard';
import { Empty } from '../components/ui';
import { go } from '../router';
import { useApp } from '../state';
import { RecipeFinder } from './Search';
import { WeekPlan } from './WeekPlan';
import type { Match } from '../lib/adapt';

type Tab = 'menu' | 'favorites' | 'imported' | 'all';

export function Menu() {
  const { state, actions } = useApp();
  const matches = useMatches();
  const [tab, setTab] = useState<Tab>('menu');
  const byId = useMemo(() => Object.fromEntries(matches.map((m) => [m.adapted.recipe.id, m])) as Record<string, Match>, [matches]);


  return (
    <div className="screen">
      <header className="screen-head"><h1>Mes recettes</h1></header>
      <div className="segmented">
        <button className={tab === 'menu' ? 'is-active' : ''} onClick={() => setTab('menu')}>Semaine</button>
        <button className={tab === 'favorites' ? 'is-active' : ''} onClick={() => setTab('favorites')}>Favoris {state.favorites.length ? `(${state.favorites.length})` : ''}</button>
        <button className={tab === 'imported' ? 'is-active' : ''} onClick={() => setTab('imported')}>Importées</button>
        <button className={tab === 'all' ? 'is-active' : ''} onClick={() => setTab('all')}>Toutes</button>
      </div>

      {tab === 'menu' && <WeekPlan />}

      {tab === 'favorites' && (
        state.favorites.length ? (
          <div className="list">
            {state.favorites.map((id) => byId[id] && (
              <RecipeRow key={id} match={byId[id]} right={
                <button className="icon-btn sm" onClick={(e) => { e.stopPropagation(); actions.addToMenu(id, state.profile.household); }} aria-label="Ajouter au menu" title="Ajouter au menu">
                  {state.menu.some((m) => m.recipeId === id) ? '✓' : '📅'}
                </button>
              } />
            ))}
          </div>
        ) : (
          <Empty emoji="❤️" title="Pas encore de favoris">
            <p className="muted">Swipe à droite les recettes qui te font envie.</p>
          </Empty>
        )
      )}

      {tab === 'all' && <RecipeFinder browse />}

      {tab === 'imported' && (
        <>
          <button className="btn btn-soft btn-block" onClick={() => go('/import')}>＋ Importer une recette (lien ou texte)</button>
          <div className="list">
            {state.imported.map((r) => byId[r.id] && (
              <RecipeRow key={r.id} match={byId[r.id]} right={
                <button className="icon-btn sm" onClick={(e) => { e.stopPropagation(); if (confirm('Supprimer cette recette ?')) actions.deleteImported(r.id); }} aria-label="Supprimer">🗑</button>
              } />
            ))}
          </div>
          {!state.imported.length && <p className="muted center small">Colle le lien d’une recette (Marmiton, 750g, Jow, Cuisine AZ…) : elle sera convertie au format Cooking Hub avec calories, prix et adaptations.</p>}
        </>
      )}
    </div>
  );
}
