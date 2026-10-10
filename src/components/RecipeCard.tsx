import { useMemo } from 'react';
import { adaptRecipe, scoreRecipe, type Adapted, type Match } from '../lib/adapt';
import { useCommunityPrices } from '../lib/openprices';
import { fmtMoney } from '../lib/pricing';
import { go } from '../router';
import { useApp } from '../state';
import type { Recipe } from '../types';

/** Calcule adaptation + score pour toutes les recettes (mémoïsé). */
export function useMatches(): Match[] {
  const { state, recipes } = useApp();
  const community = useCommunityPrices();
  return useMemo(
    () => Object.values(recipes).map((r) => scoreRecipe(adaptRecipe(r, state.profile, state.fridge), state.profile)),
    [recipes, state.profile, state.fridge, state.receipts, community],
  );
}

export function RecipeVisual({ recipe, size = 'md' }: { recipe: Recipe; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <div className={`visual visual-${size}`} style={{ ['--tint' as string]: recipe.color }}>
      {recipe.image ? <img src={recipe.image} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span aria-hidden>{recipe.emoji}</span>}
    </div>
  );
}

export function StatusBadge({ a }: { a: Adapted }) {
  if (a.status === 'incompatible') return <span className="badge badge-danger">Incompatible</span>;
  if (a.status === 'adapted') return <span className="badge badge-warn">Adaptée pour toi</span>;
  return null;
}

export function MetaRow({ a }: { a: Adapted }) {
  const { state } = useApp();
  return (
    <div className="meta">
      {a.totalMin != null && <span>⏱ {a.totalMin} min</span>}
      {a.nutrition.kcal > 0 && <span>🔥 {Math.round(a.nutrition.kcal)} kcal</span>}
      {a.costPerServing != null && <span>💶 {fmtMoney(a.costPerServing, state.profile.country)}/pers.</span>}
    </div>
  );
}

export function RecipeRow({ match, right }: { match: Match; right?: React.ReactNode }) {
  const a = match.adapted;
  return (
    <div className="recipe-row" role="button" tabIndex={0} onClick={() => go(`/recipe/${a.recipe.id}`)} onKeyDown={(e) => e.key === 'Enter' && go(`/recipe/${a.recipe.id}`)}>
      <RecipeVisual recipe={a.recipe} size="sm" />
      <div className="recipe-row-body">
        <div className="recipe-row-title">{a.recipe.title}</div>
        <MetaRow a={a} />
        <div className="row-badges">
          <StatusBadge a={a} />
          {a.fridgeCoverage > 0 && <span className="badge badge-good">🧊 {Math.round(a.fridgeCoverage * 100)} %</span>}
        </div>
      </div>
      {right}
    </div>
  );
}
