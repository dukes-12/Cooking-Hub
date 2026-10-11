import { useMemo, useState } from 'react';
import { RecipeRow, useMatches } from '../components/RecipeCard';
import { Empty, Stepper } from '../components/ui';
import { quoteBasket, fmtMoney } from '../lib/pricing';
import { go } from '../router';
import { useApp } from '../state';
import { RecipeFinder } from './Search';
import type { Match } from '../lib/adapt';
import { adaptRecipe } from '../lib/adapt';

type Tab = 'menu' | 'favorites' | 'imported' | 'all';

export function Menu() {
  const { state, actions, recipes } = useApp();
  const matches = useMatches();
  const [tab, setTab] = useState<Tab>(state.menu.length ? 'menu' : 'favorites');
  const byId = useMemo(() => Object.fromEntries(matches.map((m) => [m.adapted.recipe.id, m])) as Record<string, Match>, [matches]);

  const menuQuote = useMemo(() => {
    const items = state.menu.flatMap((m) => {
      const r = recipes[m.recipeId];
      if (!r) return [];
      return adaptRecipe(r, state.profile, [], { servings: m.servings }).lines
        .filter((l) => !l.removed && !l.original.optional)
        .map((l) => ({ ingredientId: l.ingredient?.id, grams: l.grams }));
    });
    return quoteBasket(items, state.profile);
  }, [state.menu, state.profile, recipes]);
  const portions = state.menu.reduce((s, m) => s + m.servings, 0);

  return (
    <div className="screen">
      <header className="screen-head"><h1>Mes recettes</h1></header>
      <div className="segmented">
        <button className={tab === 'menu' ? 'is-active' : ''} onClick={() => setTab('menu')}>Au menu {state.menu.length ? `(${state.menu.length})` : ''}</button>
        <button className={tab === 'favorites' ? 'is-active' : ''} onClick={() => setTab('favorites')}>Favoris {state.favorites.length ? `(${state.favorites.length})` : ''}</button>
        <button className={tab === 'imported' ? 'is-active' : ''} onClick={() => setTab('imported')}>Importées</button>
        <button className={tab === 'all' ? 'is-active' : ''} onClick={() => setTab('all')}>Toutes</button>
      </div>

      {tab === 'menu' && (
        state.menu.length ? (
          <>
            <div className="card summary">
              <div>
                <span className="small muted">{state.menu.length} repas · {portions} portions</span>
                <div className="big">{menuQuote.best ? fmtMoney(menuQuote.best.total, state.profile.country) : '—'}</div>
                <span className="small muted">{menuQuote.best ? `chez ${menuQuote.best.chain.name} · ${fmtMoney(menuQuote.best.total / Math.max(1, portions), state.profile.country)}/portion` : ''}</span>
              </div>
              <button className="btn btn-primary" onClick={() => { actions.regenerateShopping(); go('/shopping'); }}>🛒 Liste de courses</button>
            </div>
            <div className="list">
              {state.menu.map((m) => byId[m.recipeId] && (
                <div key={m.recipeId} className="menu-item">
                  <RecipeRow match={byId[m.recipeId]} />
                  <div className="row between pad-x">
                    <Stepper value={m.servings} onChange={(v) => actions.setMenuServings(m.recipeId, v)} label="pers." />
                    <button className="link danger-text small" onClick={() => actions.removeFromMenu(m.recipeId)}>Retirer</button>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <Empty emoji="📅" title="Ton menu est vide">
            <p className="muted">Swipe vers le haut ou ajoute une recette depuis sa fiche pour planifier tes repas.</p>
            <button className="btn btn-primary" onClick={() => go('/discover')}>Découvrir des recettes</button>
          </Empty>
        )
      )}

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
