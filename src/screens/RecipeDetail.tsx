import { useMemo, useState } from 'react';
import { RecipeVisual, StatusBadge } from '../components/RecipeCard';
import { Empty, Sheet, Stepper } from '../components/ui';
import { EQUIPMENT } from '../data/reference';
import { adaptRecipe, missingCost, reasonLabel, type AdaptedLine } from '../lib/adapt';
import { fmtMoney } from '../lib/pricing';
import { fmtBase, fmtQty } from '../lib/units';
import { back, go } from '../router';
import { useApp } from '../state';
import type { Recipe } from '../types';

export function RecipeDetail({ id }: { id: string }) {
  const { recipes } = useApp();
  const recipe = recipes[id];
  if (!recipe) {
    return (
      <div className="screen">
        <Empty emoji="🤷" title="Recette introuvable">
          <button className="btn btn-primary" onClick={() => go('/discover')}>Retour</button>
        </Empty>
      </div>
    );
  }
  return <RecipeView recipe={recipe} />;
}

export function RecipeView({ recipe, preview, onSave }: { recipe: Recipe; preview?: boolean; onSave?: () => void }) {
  const { state, actions } = useApp();
  const { profile, fridge } = state;
  const planned = state.menu.find((m) => m.recipeId === recipe.id);
  const [servings, setServings] = useState(planned?.servings ?? profile.household);
  const [swaps, setSwaps] = useState<Record<number, string>>({});
  const [swapLine, setSwapLine] = useState<AdaptedLine | null>(null);
  const [doneSteps, setDoneSteps] = useState<number[]>([]);
  const [cooked, setCooked] = useState(false);

  const a = useMemo(() => adaptRecipe(recipe, profile, fridge, { servings, swaps }), [recipe, profile, fridge, servings, swaps]);
  const fav = state.favorites.includes(recipe.id);
  const country = profile.country;
  const best = a.quote.best;
  const toBuy = best ? missingCost(a, best.chain.id, country) : null;
  const n = a.nutrition;
  const macroTotal = n.protein * 4 + n.carbs * 4 + n.fat * 9 || 1;

  const cook = () => {
    const used = a.lines
      .filter((l) => !l.removed && l.ingredient && l.baseQty != null && (l.fridge === 'full' || l.fridge === 'partial'))
      .map((l) => ({ ingredientId: l.ingredient!.id, qty: Math.min(l.baseQty!, l.fridgeHave) }));
    actions.markCooked(recipe.id, used);
    setCooked(true);
  };

  return (
    <div className="screen recipe">
      <div className="recipe-hero" style={{ ['--tint' as string]: recipe.color }}>
        <RecipeVisual recipe={recipe} size="lg" />
        <div className="hero-actions">
          <button className="icon-btn glass" onClick={() => back()} aria-label="Retour">←</button>
          {!preview && (
            <button className={`icon-btn glass ${fav ? 'is-fav' : ''}`} onClick={() => actions.toggleFavorite(recipe.id)} aria-label="Favori">
              {fav ? '♥' : '♡'}
            </button>
          )}
        </div>
      </div>

      <div className="recipe-body">
        <p className="small muted">{recipe.cuisine} · {recipe.source?.name ?? 'Cooking Hub'}</p>
        <h1>{recipe.title}</h1>
        <StatusBadge a={a} />

        <div className="stats">
          <div><b>{a.totalMin != null ? `${a.totalMin}` : '—'}</b><span>min{recipe.prepMin != null && recipe.cookMin != null ? ` (${recipe.prepMin}+${recipe.cookMin})` : ''}</span></div>
          <div><b>{n.kcal ? Math.round(n.kcal) : '—'}</b><span>kcal/pers.</span></div>
          <div><b>{a.costPerServing != null ? fmtMoney(a.costPerServing, country) : '—'}</b><span>par pers.</span></div>
          <div><b>{'●'.repeat(recipe.difficulty)}{'○'.repeat(3 - recipe.difficulty)}</b><span>difficulté</span></div>
        </div>

        {(a.issues.length > 0 || a.lines.some((l) => (l.swappedFrom && l.swapReason !== 'manuel') || l.removed) || a.equipment.length > 0) && (
          <div className="callout">
            <b>{a.status === 'incompatible' ? '⚠️ Attention' : '✨ Recette adaptée à ton profil'}</b>
            <ul>
              {a.issues.map((i) => <li key={i} className="danger-text">{i}</li>)}
              {a.lines.filter((l) => l.swappedFrom && l.swapReason !== 'manuel').map((l) => (
                <li key={l.index}>{l.swappedFrom!.name} → <b>{l.ingredient!.name}</b> <span className="muted">({reasonLabel(l.swapReason!)})</span></li>
              ))}
              {a.lines.filter((l) => l.removed).map((l) => <li key={l.index}>{l.original.name} retiré (optionnel)</li>)}
              {a.equipment.filter((e) => e.alternative).map((e) => (
                <li key={e.missing}>Pas de {EQUIPMENT[e.missing].label.toLowerCase()} → {e.tip}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="section-head">
          <h2>Ingrédients</h2>
          <Stepper value={servings} onChange={setServings} min={1} max={20} label="pers." />
        </div>
        {a.missingCount > 0 && toBuy != null ? (
          <p className="small muted">Il te manque {a.missingCount} ingrédient{a.missingCount > 1 ? 's' : ''} · environ {fmtMoney(toBuy, country)} chez {best!.chain.name}</p>
        ) : (
          <p className="small good-text">🎉 Tu as tout ce qu’il faut !</p>
        )}
        <ul className="ingredients">
          {a.lines.map((l) => (
            <li key={l.index} className={`ing ing-${l.removed ? 'removed' : l.fridge} ${l.blocked ? 'ing-blocked' : ''}`}>
              <span className="ing-dot" title={fridgeLabel(l)} />
              <span className="ing-qty">{l.ingredient && l.original.unit === 'pc' && l.qty != null ? fmtBase(Math.round(l.qty * 10) / 10, 'pc') : fmtQty(l.qty, l.original.unit)}</span>
              <span className="ing-name">
                {l.ingredient ? <button className="link-plain" onClick={() => go(`/product/${encodeURIComponent(l.ingredient!.id)}`)}>{l.ingredient.name}</button> : l.original.name}
                {l.original.optional && <span className="muted small"> (facultatif)</span>}
                {l.swappedFrom && <span className="muted small"> · au lieu de {l.swappedFrom.name}</span>}
                {!l.ingredient && <span className="muted small"> · non reconnu</span>}
                {l.fridgeSwap && <button className="link small block" onClick={() => setSwaps({ ...swaps, [l.index]: l.fridgeSwap!.id })}>🧊 Utiliser {l.fridgeSwap.name} de ton frigo</button>}
              </span>
              {l.alternatives.length > 0 && !l.removed && (
                <button className="icon-btn sm" onClick={() => setSwapLine(l)} aria-label="Remplacer">⇄</button>
              )}
            </li>
          ))}
        </ul>
        <p className="legend small muted"><span className="ing-dot full" /> au frigo <span className="ing-dot partial" /> en partie <span className="ing-dot staple" /> placard <span className="ing-dot none" /> à acheter</p>

        <h2>Où acheter ?</h2>
        {a.quote.perChain.length ? (
          <div className="price-table">
            {a.quote.perChain.slice(0, 6).map((p, i) => (
              <div key={p.chain.id} className={`price-row ${i === 0 ? 'best' : ''}`}>
                <span className="store-dot" style={{ background: p.chain.color }} />
                <span className="grow">{p.chain.name}{i === 0 && <span className="badge badge-good">le moins cher</span>}</span>
                <span className="muted small">{fmtMoney(p.total / servings, country)}/pers.</span>
                <b>{fmtMoney(p.total, country)}</b>
              </div>
            ))}
            <p className="small muted">
              Estimation pour {servings} pers., sur la base des prix moyens en {profile.country} ajustés par enseigne{profile.stores.length ? '' : ' (choisis tes magasins dans ton profil pour affiner)'}.
              {a.quote.unknown > 0 && ` ${a.quote.unknown} ingrédient(s) non chiffré(s).`}
            </p>
          </div>
        ) : <p className="muted">Pas de magasin pour ce pays.</p>}

        <h2>Valeurs nutritionnelles <span className="muted small">/ portion</span></h2>
        <div className="macros">
          <div className="macro-bar">
            <span style={{ flex: n.protein * 4, background: 'var(--c-protein)' }} />
            <span style={{ flex: n.carbs * 4, background: 'var(--c-carbs)' }} />
            <span style={{ flex: n.fat * 9, background: 'var(--c-fat)' }} />
          </div>
          <div className="macro-legend small">
            <span><i style={{ background: 'var(--c-protein)' }} /> Protéines {Math.round(n.protein)} g · {Math.round((n.protein * 400) / macroTotal)} %</span>
            <span><i style={{ background: 'var(--c-carbs)' }} /> Glucides {Math.round(n.carbs)} g</span>
            <span><i style={{ background: 'var(--c-fat)' }} /> Lipides {Math.round(n.fat)} g</span>
          </div>
          <p className="small muted">
            {n.fromSource ? 'Calories indiquées par la source. ' : 'Estimation à partir des ingrédients. '}
            {n.coverage < 1 && `Fiabilité ${Math.round(n.coverage * 100)} % (ingrédients non reconnus).`}
          </p>
        </div>

        <h2>Préparation</h2>
        <ol className="steps">
          {recipe.steps.map((s, i) => (
            <li key={i} className={doneSteps.includes(i) ? 'done' : ''} onClick={() => setDoneSteps(doneSteps.includes(i) ? doneSteps.filter((x) => x !== i) : [...doneSteps, i])}>
              <span className="step-num">{i + 1}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
        {recipe.source?.url && (
          <p className="small"><a href={recipe.source.url} target="_blank" rel="noreferrer">Voir la recette originale sur {recipe.source.name} ↗</a></p>
        )}
        <div className="spacer" />
      </div>

      <div className="bottom-bar">
        {preview ? (
          <button className="btn btn-primary grow" onClick={onSave}>Enregistrer la recette</button>
        ) : cooked ? (
          <button className="btn btn-soft grow" onClick={() => go('/fridge')}>✅ Frigo mis à jour · voir</button>
        ) : (
          <>
            {planned ? (
              <button className="btn btn-soft" onClick={cook}>👩‍🍳 J’ai cuisiné</button>
            ) : null}
            <button
              className="btn btn-primary grow"
              onClick={() => {
                actions.addToMenu(recipe.id, servings);
                actions.like(recipe.id);
                go('/menu');
              }}
            >
              {planned ? `Menu : ${servings} pers. ✓` : `Ajouter au menu (${servings} pers.)`}
            </button>
          </>
        )}
      </div>

      <Sheet open={!!swapLine} onClose={() => setSwapLine(null)} title={`Remplacer ${swapLine?.ingredient?.name ?? ''}`}>
        <div className="list">
          {swapLine?.alternatives.map((alt) => {
            const inFridge = fridge.some((f) => f.ingredientId === alt.id);
            return (
              <button key={alt.id} className="list-btn" onClick={() => { setSwaps({ ...swaps, [swapLine.index]: alt.id }); setSwapLine(null); }}>
                <span className="grow">{alt.name}</span>
                {inFridge && <span className="badge badge-good">au frigo</span>}
                <span className="small muted">{alt.kcal} kcal/100 g</span>
              </button>
            );
          })}
          {swapLine && swaps[swapLine.index] && (
            <button className="list-btn muted" onClick={() => { const s = { ...swaps }; delete s[swapLine.index]; setSwaps(s); setSwapLine(null); }}>
              ↺ Revenir à l’ingrédient d’origine
            </button>
          )}
        </div>
      </Sheet>
    </div>
  );
}

function fridgeLabel(l: AdaptedLine): string {
  return { full: 'Au frigo', partial: 'En partie au frigo', staple: 'Placard', none: 'À acheter' }[l.fridge];
}
