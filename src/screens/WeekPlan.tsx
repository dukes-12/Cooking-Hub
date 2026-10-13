import { useMemo, useState } from 'react';
import { RecipeVisual, useMatches } from '../components/RecipeCard';
import { Chip, Sheet } from '../components/ui';
import type { Match } from '../lib/adapt';
import { dateIn } from '../lib/pantry';
import { fmtMoney } from '../lib/pricing';
import { toast } from '../lib/toast';
import { go } from '../router';
import { useApp } from '../state';
import type { MealSlot, PlannedMeal } from '../types';

const SLOTS: { id: MealSlot; label: string }[] = [
  { id: 'midi', label: 'Midi' },
  { id: 'soir', label: 'Soir' },
];

/** Lundi de la semaine (décalée de `offset` semaines), en AAAA-MM-JJ. */
function mondayOf(offset: number): Date {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offset * 7);
  return d;
}
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Ma semaine : les repas jour par jour (midi, soir), ceux à placer, et un remplissage automatique anti-gaspi. */
export function WeekPlan() {
  const { state, actions, recipes } = useApp();
  const matches = useMatches();
  const [offset, setOffset] = useState(0);
  const [picking, setPicking] = useState<{ day: string; slot: MealSlot } | null>(null);
  const [pickTab, setPickTab] = useState<'suggest' | 'favorites' | 'menu'>('suggest');
  const today = dateIn(0);
  const monday = mondayOf(offset);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
  const dayIds = days.map(iso);
  const byId = useMemo(() => Object.fromEntries(matches.map((m) => [m.adapted.recipe.id, m])) as Record<string, Match>, [matches]);
  const unplaced = state.menu.filter((m) => !m.day);
  const household = state.profile.household;

  // Suggestions : ce qui utilise les produits bientôt périmés d'abord, puis le meilleur score.
  const suggestions = useMemo(
    () =>
      matches
        .filter((m) => m.adapted.status !== 'incompatible' && ['plat', 'soupe', 'salade'].includes(m.adapted.recipe.category))
        .sort((a, b) => b.adapted.expiring.length - a.adapted.expiring.length || b.score - a.score),
    [matches],
  );

  const place = (recipeId: string, day: string, slot: MealSlot) => {
    const before = state.menu;
    actions.addToMenu(recipeId, state.menu.find((m) => m.recipeId === recipeId)?.servings ?? household, day, slot);
    toast(`${recipes[recipeId]?.title ?? 'Recette'} : ${new Date(`${day}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long' })} ${slot}`, () => actions.restore({ menu: before }));
  };

  // Remplit les soirs libres (à partir d'aujourd'hui) avec les meilleures suggestions, sans doublon.
  const autofill = () => {
    const before = state.menu;
    const used = new Set(state.menu.map((m) => m.recipeId));
    let n = 0;
    for (const day of dayIds) {
      if (day < today || state.menu.some((m) => m.day === day && m.slot === 'soir')) continue;
      const pick = suggestions.find((m) => !used.has(m.adapted.recipe.id));
      if (!pick) break;
      used.add(pick.adapted.recipe.id);
      actions.addToMenu(pick.adapted.recipe.id, household, day, 'soir');
      n++;
    }
    toast(n ? `${n} soir${n > 1 ? 's' : ''} rempli${n > 1 ? 's' : ''} (anti-gaspi d’abord)` : 'Tous les soirs sont déjà prévus', n ? () => actions.restore({ menu: before }) : undefined);
  };

  const weekMeals = state.menu.filter((m) => m.day && dayIds.includes(m.day));
  const weekCost = weekMeals.reduce((s, m) => s + (byId[m.recipeId]?.adapted.costPerServing ?? 0) * m.servings, 0);

  const MealRow = ({ m }: { m: PlannedMeal }) => {
    const r = recipes[m.recipeId];
    if (!r) return null;
    const a = byId[m.recipeId]?.adapted;
    return (
      <div className="plan-meal">
        <button className="plan-meal-main" onClick={() => go(`/recipe/${r.id}`)}>
          <RecipeVisual recipe={r} size="sm" />
          <span className="grow">
            <b>{r.title}</b>
            <span className="small muted block">
              {m.servings} pers.{a?.costPerServing != null ? ` · ${fmtMoney(a.costPerServing * m.servings, state.profile.country)}` : ''}
              {a?.expiring.length ? ' · ⏰ anti-gaspi' : ''}
            </span>
          </span>
        </button>
        <button
          className="icon-btn sm"
          onClick={() => {
            const before = state.menu;
            actions.removeFromMenu(m.recipeId);
            toast(`${r.title} retiré du menu`, () => actions.restore({ menu: before }));
          }}
          aria-label="Retirer"
        >
          ✕
        </button>
      </div>
    );
  };

  return (
    <div className="week-plan">
      <div className="row between">
        <button className="icon-btn" onClick={() => setOffset(offset - 1)} aria-label="Semaine précédente">‹</button>
        <div className="center">
          <b>{offset === 0 ? 'Cette semaine' : offset === 1 ? 'Semaine prochaine' : `Semaine du ${days[0].toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`}</b>
          <span className="small muted block">{days[0].toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} – {days[6].toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} · {weekMeals.length} repas{weekCost ? ` · ≈ ${fmtMoney(weekCost, state.profile.country)}` : ''}</span>
        </div>
        <button className="icon-btn" onClick={() => setOffset(offset + 1)} aria-label="Semaine suivante">›</button>
      </div>
      <div className="row gap">
        <button className="btn btn-soft grow" onClick={autofill}>✨ Remplir mes soirs</button>
        <button className="btn btn-primary grow" onClick={() => { actions.regenerateShopping(); go('/shopping'); }}>🛒 Liste de courses</button>
      </div>

      {unplaced.length > 0 && (
        <div className="card">
          <b>À placer dans la semaine</b>
          {unplaced.map((m) => (
            <div key={m.recipeId} className="unplaced">
              <MealRow m={m} />
              <select className="input" value="" onChange={(e) => { const [day, slot] = e.target.value.split('|'); place(m.recipeId, day, slot as MealSlot); }} aria-label="Choisir le jour">
                <option value="">Choisir le jour…</option>
                {days.map((d, i) => SLOTS.map((s) => <option key={`${i}${s.id}`} value={`${dayIds[i]}|${s.id}`}>{d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric' })} · {s.label}</option>))}
              </select>
            </div>
          ))}
        </div>
      )}

      {days.map((d, i) => {
        const id = dayIds[i];
        return (
          <div key={id} className={`plan-day ${id === today ? 'is-today' : ''} ${id < today ? 'is-past' : ''}`}>
            <div className="plan-day-head">
              <b>{d.toLocaleDateString('fr-FR', { weekday: 'long' })}</b>
              <span className="small muted">{d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}{id === today ? ' · aujourd’hui' : ''}</span>
            </div>
            {SLOTS.map((s) => {
              const meals = state.menu.filter((m) => m.day === id && (m.slot ?? 'soir') === s.id);
              return (
                <div key={s.id} className="plan-slot">
                  <span className="plan-slot-label small muted">{s.label}</span>
                  <div className="grow">
                    {meals.map((m) => <MealRow key={m.recipeId} m={m} />)}
                    {!meals.length && <button className="link small" onClick={() => setPicking({ day: id, slot: s.id })}>＋ Ajouter un plat</button>}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      <Sheet open={!!picking} onClose={() => setPicking(null)} title={picking ? `${new Date(`${picking.day}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric' })} · ${picking.slot}` : ''}>
        {picking && (
          <div className="new-product">
            <div className="chips">
              <Chip active={pickTab === 'suggest'} onClick={() => setPickTab('suggest')}>✨ Suggestions</Chip>
              <Chip active={pickTab === 'favorites'} onClick={() => setPickTab('favorites')}>♥ Favoris</Chip>
              {unplaced.length > 0 && <Chip active={pickTab === 'menu'} onClick={() => setPickTab('menu')}>📅 À placer</Chip>}
            </div>
            <div className="list">
              {(pickTab === 'suggest' ? suggestions.slice(0, 12) : pickTab === 'favorites' ? state.favorites.map((f) => byId[f]).filter(Boolean) : unplaced.map((m) => byId[m.recipeId]).filter(Boolean)).map((m) => (
                <button key={m.adapted.recipe.id} className="plan-pick" onClick={() => { place(m.adapted.recipe.id, picking.day, picking.slot); setPicking(null); }}>
                  <RecipeVisual recipe={m.adapted.recipe} size="sm" />
                  <span className="grow">
                    <b>{m.adapted.recipe.title}</b>
                    <span className="small muted block">
                      {m.adapted.totalMin ? `${m.adapted.totalMin} min · ` : ''}
                      {m.adapted.costPerServing != null ? `${fmtMoney(m.adapted.costPerServing, state.profile.country)}/pers.` : ''}
                      {m.adapted.expiring.length ? ` · ⏰ utilise ${m.adapted.expiring.slice(0, 2).join(', ')}` : ''}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}
