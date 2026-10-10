import { useMemo, useRef, useState } from 'react';
import { MetaRow, RecipeVisual, StatusBadge, useMatches } from '../components/RecipeCard';
import { Chip, Empty } from '../components/ui';
import { CATEGORY_LABELS } from '../data/reference';
import type { Match } from '../lib/adapt';
import { go } from '../router';
import { useApp } from '../state';
import type { Category } from '../types';

const FILTERS: (Category | 'all')[] = ['all', 'plat', 'dessert', 'petit-dej', 'soupe', 'salade'];

export function Discover() {
  const { state, actions } = useApp();
  const matches = useMatches();
  const [cat, setCat] = useState<Category | 'all'>('all');
  const [toast, setToast] = useState<string | null>(null);

  const deck = useMemo(
    () =>
      matches
        .filter((m) => m.adapted.status !== 'incompatible')
        .filter((m) => !state.passed.includes(m.adapted.recipe.id) && !state.favorites.includes(m.adapted.recipe.id))
        .filter((m) => cat === 'all' || m.adapted.recipe.category === cat)
        .sort((a, b) => b.score - a.score),
    [matches, state.passed, state.favorites, cat],
  );

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1600);
  };

  const decide = (m: Match, dir: 'left' | 'right' | 'up') => {
    const id = m.adapted.recipe.id;
    if (dir === 'left') actions.pass(id);
    else {
      actions.like(id);
      if (dir === 'up') {
        actions.addToMenu(id, state.profile.household);
        flash('Ajoutée au menu 📅');
      } else flash('Ajoutée aux favoris ❤️');
    }
  };

  const top = deck.slice(0, 3);

  return (
    <div className="screen discover">
      <header className="screen-head">
        <div>
          <p className="muted small">{state.profile.name ? `Salut ${state.profile.name} 👋` : 'Salut 👋'}</p>
          <h1>Qu’est-ce qu’on mange ?</h1>
        </div>
        <button className="avatar" onClick={() => go('/profile')} aria-label="Profil">
          {(state.profile.name || '🙂').slice(0, 1).toUpperCase()}
        </button>
      </header>
      <div className="chips scroll-x">
        {FILTERS.map((f) => (
          <Chip key={f} active={cat === f} onClick={() => setCat(f)}>
            {f === 'all' ? 'Tout' : CATEGORY_LABELS[f]}
          </Chip>
        ))}
      </div>

      <div className="deck">
        {top.length === 0 ? (
          <Empty emoji="🍽️" title="Tu as fait le tour !">
            <p className="muted">Importe de nouvelles recettes ou revois celles que tu as passées.</p>
            <div className="row gap">
              <button className="btn btn-soft" onClick={actions.resetSwipes}>Revoir les recettes</button>
              <button className="btn btn-primary" onClick={() => go('/import')}>Importer</button>
            </div>
          </Empty>
        ) : (
          top
            .slice()
            .reverse()
            .map((m, i, arr) => <SwipeCard key={m.adapted.recipe.id} match={m} depth={arr.length - 1 - i} onDecide={(d) => decide(m, d)} />)
        )}
      </div>

      {top[0] && (
        <div className="deck-actions">
          <button className="round-btn nope" onClick={() => decide(top[0], 'left')} aria-label="Passer">✕</button>
          <button className="round-btn menu" onClick={() => decide(top[0], 'up')} aria-label="Ajouter au menu">📅</button>
          <button className="round-btn like" onClick={() => decide(top[0], 'right')} aria-label="J’aime">♥</button>
        </div>
      )}
      <p className="hint small muted center">Glisse à droite pour garder, à gauche pour passer, vers le haut pour l’ajouter au menu.</p>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function SwipeCard({ match, depth, onDecide }: { match: Match; depth: number; onDecide: (d: 'left' | 'right' | 'up') => void }) {
  const a = match.adapted;
  const [drag, setDrag] = useState({ x: 0, y: 0, active: false });
  const [leaving, setLeaving] = useState<null | 'left' | 'right' | 'up'>(null);
  const start = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const isTop = depth === 0;

  const finish = (dir: 'left' | 'right' | 'up') => {
    setLeaving(dir);
    setTimeout(() => onDecide(dir), 220);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!isTop) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    start.current = { x: e.clientX, y: e.clientY, moved: false };
    setDrag({ x: 0, y: 0, active: true });
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!start.current) return;
    const x = e.clientX - start.current.x;
    const y = e.clientY - start.current.y;
    if (Math.abs(x) + Math.abs(y) > 6) start.current.moved = true;
    setDrag({ x, y, active: true });
  };
  const onPointerUp = () => {
    if (!start.current) return;
    const { moved } = start.current;
    start.current = null;
    if (drag.x > 110) finish('right');
    else if (drag.x < -110) finish('left');
    else if (drag.y < -120) finish('up');
    else {
      setDrag({ x: 0, y: 0, active: false });
      if (!moved) go(`/recipe/${a.recipe.id}`);
    }
  };

  let transform = `translateY(${depth * 10}px) scale(${1 - depth * 0.04})`;
  if (isTop && leaving) {
    const tx = leaving === 'right' ? 600 : leaving === 'left' ? -600 : 0;
    const ty = leaving === 'up' ? -800 : drag.y;
    transform = `translate(${tx}px, ${ty}px) rotate(${tx / 20}deg)`;
  } else if (isTop && drag.active) {
    transform = `translate(${drag.x}px, ${drag.y}px) rotate(${drag.x / 18}deg)`;
  }

  const swaps = a.lines.filter((l) => l.swappedFrom);
  const likeOpacity = Math.max(0, Math.min(1, drag.x / 110));
  const nopeOpacity = Math.max(0, Math.min(1, -drag.x / 110));
  const menuOpacity = Math.max(0, Math.min(1, -drag.y / 120)) * (Math.abs(drag.x) < 60 ? 1 : 0);

  return (
    <article
      className={`swipe-card ${drag.active ? 'dragging' : ''}`}
      style={{ transform, zIndex: 10 - depth, opacity: depth > 2 ? 0 : 1 }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { start.current = null; setDrag({ x: 0, y: 0, active: false }); }}
    >
      <RecipeVisual recipe={a.recipe} size="lg" />
      <div className="stamp stamp-like" style={{ opacity: likeOpacity }}>MIAM</div>
      <div className="stamp stamp-nope" style={{ opacity: nopeOpacity }}>BOF</div>
      <div className="stamp stamp-menu" style={{ opacity: menuOpacity }}>AU MENU</div>
      <div className="swipe-body">
        <div className="row between">
          <span className="small muted">{a.recipe.cuisine} · {'●'.repeat(a.recipe.difficulty)}{'○'.repeat(3 - a.recipe.difficulty)}</span>
          <span className="score" title="Compatibilité avec ton profil">{match.score}%</span>
        </div>
        <h2>{a.recipe.title}</h2>
        <MetaRow a={a} />
        <div className="row-badges">
          <StatusBadge a={a} />
          {match.reasons.map((r) => (
            <span key={r} className="badge">{r}</span>
          ))}
        </div>
        {swaps.length > 0 && (
          <p className="small muted">
            🔄 {swaps.slice(0, 2).map((l) => `${l.swappedFrom!.name} → ${l.ingredient!.name}`).join(' · ')}
          </p>
        )}
        {a.equipment.filter((e) => e.alternative).length > 0 && <p className="small muted">🔧 Adaptée à ton équipement</p>}
      </div>
    </article>
  );
}
