import { useMemo, useState, type ReactNode } from 'react';
import { INGREDIENTS } from '../data/ingredients';
import { normalize } from '../lib/text';
import type { Ingredient } from '../types';

export function Chip({ active, onClick, children, tone }: { active?: boolean; onClick?: () => void; children: ReactNode; tone?: 'danger' | 'good' }) {
  return (
    <button type="button" className={`chip ${active ? 'is-active' : ''} ${tone ? `chip-${tone}` : ''}`} onClick={onClick} aria-pressed={active}>
      {children}
    </button>
  );
}

export function ChipGroup<T extends string>({
  options,
  value,
  onChange,
  tone,
}: {
  options: { id: T; label: ReactNode }[];
  value: T[];
  onChange: (v: T[]) => void;
  tone?: 'danger' | 'good';
}) {
  return (
    <div className="chips">
      {options.map((o) => (
        <Chip key={o.id} tone={tone} active={value.includes(o.id)} onClick={() => onChange(value.includes(o.id) ? value.filter((v) => v !== o.id) : [...value, o.id])}>
          {o.label}
        </Chip>
      ))}
    </div>
  );
}

export function Stepper({ value, onChange, min = 1, max = 20, step = 1, label }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; label?: string }) {
  return (
    <div className="stepper" aria-label={label}>
      <button type="button" onClick={() => onChange(Math.max(min, +(value - step).toFixed(2)))} disabled={value <= min} aria-label="Moins">−</button>
      <span>{value}{label ? ` ${label}` : ''}</span>
      <button type="button" onClick={() => onChange(Math.min(max, +(value + step).toFixed(2)))} disabled={value >= max} aria-label="Plus">+</button>
    </div>
  );
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Fermer">✕</button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

export function Empty({ emoji, title, children }: { emoji: string; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-emoji">{emoji}</div>
      <h3>{title}</h3>
      {children}
    </div>
  );
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="section">
      <div className="section-head">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Recherche d'ingrédient avec autocomplétion sur la base de référence. */
export function IngredientPicker({ onPick, exclude = [], placeholder = 'Rechercher un ingrédient…', allowFree }: { onPick: (ing: Ingredient | null, text: string) => void; exclude?: string[]; placeholder?: string; allowFree?: boolean }) {
  const [q, setQ] = useState('');
  const results = useMemo(() => {
    const n = normalize(q);
    if (!n) return [];
    return INGREDIENTS.filter((i) => !exclude.includes(i.id))
      .map((i) => {
        const names = [i.name, ...i.aliases].map(normalize);
        const rank = names.some((x) => x.startsWith(n)) ? 0 : names.some((x) => x.includes(n)) ? 1 : 2;
        return { i, rank };
      })
      .filter((x) => x.rank < 2)
      .sort((a, b) => a.rank - b.rank || a.i.name.localeCompare(b.i.name))
      .slice(0, 6)
      .map((x) => x.i);
  }, [q, exclude]);

  const pick = (ing: Ingredient | null) => {
    onPick(ing, q.trim());
    setQ('');
  };

  return (
    <div className="picker">
      <input
        className="input"
        value={q}
        placeholder={placeholder}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (results[0]) pick(results[0]);
            else if (allowFree && q.trim()) pick(null);
          }
        }}
      />
      {q && (
        <div className="picker-results">
          {results.map((r) => (
            <button key={r.id} type="button" onClick={() => pick(r)}>
              {r.name}
            </button>
          ))}
          {allowFree && q.trim() && (
            <button type="button" className="muted" onClick={() => pick(null)}>
              Ajouter « {q.trim()} »
            </button>
          )}
          {!results.length && !allowFree && <div className="muted small pad">Aucun ingrédient trouvé</div>}
        </div>
      )}
    </div>
  );
}

export function Meter({ value, label }: { value: number; label?: string }) {
  return (
    <div className="meter" role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div style={{ width: `${Math.round(Math.min(1, value) * 100)}%` }} />
    </div>
  );
}
