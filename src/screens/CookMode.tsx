import { useEffect, useMemo, useState } from 'react';
import { CookedSheet } from '../components/CookedSheet';
import { Empty } from '../components/ui';
import { adaptRecipe } from '../lib/adapt';
import { fmtQty } from '../lib/units';
import { back, go } from '../router';
import { useApp } from '../state';

interface Timer {
  id: number;
  label: string;
  endAt: number;
  total: number;
}

/** Durées citées dans une étape : « 8 à 10 min », « 1 h 30 », « 45 minutos »… (en minutes). */
export function stepDurations(step: string): number[] {
  const out: number[] = [];
  const re = /(\d+(?:[.,]\d+)?)\s*(?:(?:à|a|-|–)\s*(\d+(?:[.,]\d+)?)\s*)?(h|heures?|horas?|minutos?|min(?:ute)?s?|mn)\b(?:\s*(\d+))?/gi;
  for (const m of step.matchAll(re)) {
    const v = Number((m[2] ?? m[1]).replace(',', '.'));
    const unit = m[3].toLowerCase();
    const minutes = unit.startsWith('h') ? v * 60 + (m[4] ? Number(m[4]) : 0) : v;
    if (minutes > 0 && minutes <= 600 && !out.includes(minutes)) out.push(minutes);
  }
  return out;
}

const fmtClock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
};

function ring() {
  try {
    navigator.vibrate?.([300, 150, 300, 150, 300]);
    const ctx = new AudioContext();
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      o.connect(g).connect(ctx.destination);
      g.gain.setValueAtTime(0.25, ctx.currentTime + i * 0.5);
      o.start(ctx.currentTime + i * 0.5);
      o.stop(ctx.currentTime + i * 0.5 + 0.3);
    }
  } catch {
    // son indisponible
  }
}

/** Mode cuisine : une étape à la fois en grand, écran toujours allumé, minuteurs, puis « J'ai fini ». */
export function CookMode({ id }: { id: string }) {
  const { state, recipes } = useApp();
  const recipe = recipes[id];
  const planned = state.menu.find((m) => m.recipeId === id);
  const servings = planned?.servings ?? state.profile.household;
  const a = useMemo(() => (recipe ? adaptRecipe(recipe, state.profile, state.fridge, { servings }) : null), [recipe, state.profile, state.fridge, servings]);
  const [step, setStep] = useState(0);
  const [showIng, setShowIng] = useState(false);
  const [timers, setTimers] = useState<Timer[]>([]);
  const [now, setNow] = useState(Date.now());
  const [custom, setCustom] = useState('');
  const [finished, setFinished] = useState(false);
  const [done, setDone] = useState(false);

  // Écran toujours allumé pendant qu'on cuisine.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const request = async () => {
      try {
        lock = await (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request('screen') ?? null;
      } catch {
        // refusé (économie d'énergie…)
      }
    };
    request();
    const onVisible = () => document.visibilityState === 'visible' && request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      lock?.release().catch(() => undefined);
    };
  }, []);

  // Minuteurs : sonnerie et vibration à la fin.
  useEffect(() => {
    if (!timers.length) return;
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      setTimers((list) => {
        const ended = list.filter((x) => x.endAt > 0 && x.endAt <= n);
        if (ended.length) ring();
        return ended.length ? list.map((x) => (x.endAt > 0 && x.endAt <= n ? { ...x, endAt: 0 } : x)) : list;
      });
    }, 500);
    return () => clearInterval(t);
  }, [timers.length]);

  if (!recipe || !a) {
    return (
      <div className="screen">
        <Empty emoji="🤷" title="Recette introuvable">
          <button className="btn btn-primary" onClick={() => go('/discover')}>Retour</button>
        </Empty>
      </div>
    );
  }

  const steps = recipe.steps;
  const startTimer = (minutes: number, label: string) => setTimers((t) => [...t, { id: Date.now(), label, endAt: Date.now() + minutes * 60000, total: minutes }]);
  const durations = steps[step] ? stepDurations(steps[step]) : [];
  const last = steps.length === 0 || step === steps.length - 1;

  return (
    <div className="cook-mode">
      <header className="cook-head">
        <button className="icon-btn" onClick={() => back(`/recipe/${id}`)} aria-label="Quitter le mode cuisine">✕</button>
        <div className="grow">
          <b>{recipe.title}</b>
          <span className="small muted block">{servings} pers.{steps.length ? ` · étape ${step + 1}/${steps.length}` : ''}</span>
        </div>
        <button className={`btn btn-sm ${showIng ? 'btn-primary' : 'btn-soft'}`} onClick={() => setShowIng(!showIng)}>🧺 Ingrédients</button>
      </header>

      {showIng && (
        <ul className="cook-ings">
          {a.lines.filter((l) => !l.removed).map((l) => (
            <li key={l.index}>
              <b>{l.qty != null ? fmtQty(l.qty, l.original.unit) : ''}</b> {l.ingredient?.name ?? l.original.name}
              {l.original.optional && <span className="muted small"> (facultatif)</span>}
            </li>
          ))}
        </ul>
      )}

      {timers.length > 0 && (
        <div className="cook-timers">
          {timers.map((t) => (
            <div key={t.id} className={`cook-timer ${t.endAt === 0 ? 'is-done' : ''}`}>
              <span className="grow">{t.label}</span>
              <b>{t.endAt === 0 ? '⏰ Terminé !' : fmtClock(t.endAt - now)}</b>
              <button className="icon-btn sm" onClick={() => setTimers(timers.filter((x) => x.id !== t.id))} aria-label="Arrêter">✕</button>
            </div>
          ))}
        </div>
      )}

      <main className="cook-step">
        {steps.length ? (
          <p>{steps[step]}</p>
        ) : (
          <div className="center">
            <p>Les étapes de cette recette sont sur {recipe.source?.name ?? 'le site d’origine'}.</p>
            {recipe.source?.url && <a className="btn btn-soft" href={recipe.source.url} target="_blank" rel="noreferrer">Ouvrir la recette ↗</a>}
          </div>
        )}
        <div className="row gap wrap center-row">
          {durations.map((m) => (
            <button key={m} className="btn btn-soft" onClick={() => startTimer(m, `Étape ${step + 1} · ${m} min`)}>⏱ {m} min</button>
          ))}
          <span className="row gap-sm">
            <input className="input timer-input" type="number" inputMode="numeric" min={1} placeholder="min" value={custom} onChange={(e) => setCustom(e.target.value)} />
            <button className="btn btn-ghost" disabled={!(Number(custom) > 0)} onClick={() => { startTimer(Number(custom), `Minuteur ${custom} min`); setCustom(''); }}>⏱ Lancer</button>
          </span>
        </div>
      </main>

      <footer className="cook-nav">
        {steps.length > 0 && <button className="btn btn-soft" disabled={step === 0} onClick={() => setStep(step - 1)}>← Précédent</button>}
        {last ? (
          done ? (
            <button className="btn btn-soft grow" onClick={() => go('/fridge')}>✅ Frigo mis à jour · voir</button>
          ) : (
            <button className="btn btn-primary grow" onClick={() => setFinished(true)}>✓ J’ai fini la recette</button>
          )
        ) : (
          <button className="btn btn-primary grow" onClick={() => setStep(step + 1)}>Suivant →</button>
        )}
      </footer>

      <CookedSheet adapted={a} open={finished} onClose={() => setFinished(false)} onDone={() => { setFinished(false); setDone(true); }} />
    </div>
  );
}
