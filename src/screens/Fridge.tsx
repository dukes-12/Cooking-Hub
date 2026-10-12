import { go } from '../router';
import { useMemo, useState } from 'react';
import { BarcodeSheet } from '../components/BarcodeSheet';
import { NewProductForm } from '../components/NewProduct';
import { RecipeRow, useMatches } from '../components/RecipeCard';
import { Chip, Empty, IngredientPicker, Section, Sheet } from '../components/ui';
import { AISLE_LABELS, getIngredient } from '../data/ingredients';
import { dateIn, daysLeft, defaultShelfDays, expiryLabel, isSoon, presenceOnly } from '../lib/pantry';
import { fmtBase } from '../lib/units';
import { useApp } from '../state';
import type { FridgeItem, Ingredient } from '../types';

const QUICK = ['oeuf', 'lait', 'beurre', 'oignon', 'ail', 'tomate', 'pates', 'riz', 'emmental', 'creme', 'poulet', 'carotte', 'pomme-de-terre', 'courgette', 'citron', 'yaourt'];

function defaultQty(ing: Ingredient): number {
  if (ing.packQty) return ing.packQty;
  if (ing.unit === 'pc') return ing.id === 'oeuf' ? 6 : 1;
  if (ing.unit === 'ml') return ing.id === 'lait' ? 1000 : 200;
  return ing.aisle === 'epicerie' ? 500 : 250;
}

function stepFor(ing: Ingredient): number {
  if (ing.unit === 'pc') return 1;
  return ing.aisle === 'epicerie' || ing.id === 'lait' ? 100 : 50;
}

const EXPIRY_CHOICES: { label: string; days: number | null }[] = [
  { label: 'Aucune', days: null },
  { label: '2 j', days: 2 },
  { label: '4 j', days: 4 },
  { label: '1 sem.', days: 7 },
  { label: '2 sem.', days: 14 },
  { label: '1 mois', days: 30 },
];

/** Choix de la date de péremption : raccourcis ou date exacte. */
function ExpiryPicker({ value, onChange }: { value: string | undefined; onChange: (v: string | undefined) => void }) {
  return (
    <div className="field">
      <span>Date de péremption</span>
      <div className="chips">
        {EXPIRY_CHOICES.map((c) => {
          const v = c.days == null ? undefined : dateIn(c.days);
          return <Chip key={c.label} active={value === v} onClick={() => onChange(v)}>{c.label}</Chip>;
        })}
      </div>
      <input className="input" type="date" value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)} />
    </div>
  );
}

export function Fridge() {
  const { state, actions } = useApp();
  const matches = useMatches();
  const [adding, setAdding] = useState<Ingredient | null>(null);
  const [qty, setQty] = useState(0);
  const [expiry, setExpiry] = useState<string | undefined>();
  const [editing, setEditing] = useState<FridgeItem | null>(null);
  const [barcode, setBarcode] = useState(false);
  const [newProduct, setNewProduct] = useState<string | null>(null);

  // Ce qui va périmer d'abord, puis ce qui couvre le mieux la recette.
  const cookNow = useMemo(
    () =>
      matches
        .filter((m) => m.adapted.status !== 'incompatible' && (m.adapted.fridgeCoverage >= 0.4 || m.adapted.expiring.length > 0))
        .sort((a, b) => b.adapted.expiring.length - a.adapted.expiring.length || b.adapted.fridgeCoverage - a.adapted.fridgeCoverage || b.score - a.score)
        .slice(0, 4),
    [matches],
  );
  const soon = useMemo(() => state.fridge.filter((f) => isSoon(f)).sort((a, b) => (daysLeft(a) ?? 0) - (daysLeft(b) ?? 0)), [state.fridge]);

  const groups = useMemo(() => {
    const g = new Map<string, typeof state.fridge>();
    for (const f of state.fridge) {
      const ing = getIngredient(f.ingredientId);
      if (!ing) continue;
      g.set(ing.aisle, [...(g.get(ing.aisle) ?? []), f]);
    }
    // Dans chaque rayon : ce qui périme en premier en haut.
    for (const list of g.values()) list.sort((a, b) => (daysLeft(a) ?? 999) - (daysLeft(b) ?? 999));
    return [...g.entries()].sort((a, b) => AISLE_LABELS[a[0] as keyof typeof AISLE_LABELS].order - AISLE_LABELS[b[0] as keyof typeof AISLE_LABELS].order);
  }, [state.fridge]);

  const open = (ing: Ingredient) => {
    setAdding(ing);
    setQty(defaultQty(ing));
    const shelf = defaultShelfDays(ing);
    setExpiry(shelf ? dateIn(shelf) : undefined);
  };

  return (
    <div className="screen">
      <header className="screen-head">
        <div>
          <h1>Mon frigo</h1>
          <p className="small muted">{state.fridge.length} produit{state.fridge.length > 1 ? 's' : ''} · frigo, congélo et placard</p>
        </div>
        <div className="row gap-sm">
          <button className="btn btn-soft btn-sm" onClick={() => go('/scan')}>⚡ Rafale</button>
          <button className="btn btn-soft btn-sm" onClick={() => setBarcode(true)}>▥ Code-barres</button>
        </div>
      </header>
      <BarcodeSheet open={barcode} onClose={() => setBarcode(false)} onAdd={(id, q) => actions.addFridge(id, q)} onOpenProduct={(id) => go(`/product/${encodeURIComponent(id)}`)} />

      <IngredientPicker onPick={(ing) => ing && open(ing)} onCreate={(text) => setNewProduct(text.charAt(0).toUpperCase() + text.slice(1))} placeholder="Ajouter un produit (ex. courgette)…" />
      <Sheet open={newProduct != null} onClose={() => setNewProduct(null)} title="Nouveau produit">
        {newProduct != null && (
          <NewProductForm
            initialName={newProduct}
            onCancel={() => setNewProduct(null)}
            onCreate={(ing) => {
              setNewProduct(null);
              open(ing);
            }}
          />
        )}
      </Sheet>
      <div className="chips scroll-x">
        {QUICK.filter((id) => !state.fridge.some((f) => f.ingredientId === id)).map((id) => (
          <Chip key={id} onClick={() => open(getIngredient(id)!)}>+ {getIngredient(id)!.name}</Chip>
        ))}
      </div>

      {soon.length > 0 && (
        <div className="card soon-card">
          <b>⏰ À consommer vite</b>
          <div className="chips">
            {soon.map((f) => {
              const ing = getIngredient(f.ingredientId);
              const d = daysLeft(f)!;
              return ing ? <span key={f.ingredientId} className={`badge ${d < 0 ? 'badge-danger' : 'badge-warn'}`}>{ing.name} · {d < 0 ? 'périmé' : d === 0 ? "aujourd'hui" : d === 1 ? 'demain' : `${d} j`}</span> : null;
            })}
          </div>
        </div>
      )}

      {cookNow.length > 0 && (
        <Section title={cookNow.some((m) => m.adapted.expiring.length) ? 'À cuisiner en priorité (anti-gaspi)' : 'À cuisiner avec ce que tu as'}>
          <div className="list">{cookNow.map((m) => <RecipeRow key={m.adapted.recipe.id} match={m} />)}</div>
        </Section>
      )}

      {state.fridge.length === 0 ? (
        <Empty emoji="🧊" title="Ton frigo est vide">
          <p className="muted">Ajoute ce que tu as : on te proposera des recettes qui l’utilisent et on le déduira de ta liste de courses.</p>
        </Empty>
      ) : (
        groups.map(([aisle, items]) => (
          <Section key={aisle} title={`${AISLE_LABELS[aisle as keyof typeof AISLE_LABELS].emoji} ${AISLE_LABELS[aisle as keyof typeof AISLE_LABELS].label}`}>
            <div className="list">
              {items.map((f) => {
                const ing = getIngredient(f.ingredientId)!;
                const step = stepFor(ing);
                const presence = presenceOnly(ing);
                const exp = expiryLabel(f);
                return (
                  <div key={f.ingredientId} className="fridge-item">
                    <div className="grow">
                      <button className="link-plain" onClick={() => go(`/product/${encodeURIComponent(ing.id)}`)}><b>{ing.name}</b></button>
                      {!presence && (
                        <button className={`link-plain small block ${isSoon(f) ? 'warn-text' : 'muted'}`} onClick={() => setEditing(f)}>
                          {exp ? `📅 ${exp}` : '📅 ajouter une date'}
                        </button>
                      )}
                    </div>
                    {presence ? (
                      <div className="row gap-sm">
                        <span className="badge badge-good">✓ J’en ai</span>
                        <button className="icon-btn sm" onClick={() => actions.setFridgeQty(f.ingredientId, 0)} aria-label="Je n’en ai plus" title="Je n’en ai plus">✕</button>
                      </div>
                    ) : (
                      <div className="stepper">
                        <button onClick={() => actions.setFridgeQty(f.ingredientId, +(f.qty - step).toFixed(2))} aria-label="Moins">−</button>
                        <span>{fmtBase(f.qty, ing.unit)}</span>
                        <button onClick={() => actions.setFridgeQty(f.ingredientId, f.qty + step)} aria-label="Plus">+</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Section>
        ))
      )}

      <Sheet open={!!adding} onClose={() => setAdding(null)} title={`Ajouter : ${adding?.name ?? ''}`}>
        {adding &&
          (presenceOnly(adding) ? (
            <>
              <p className="small muted">Pas besoin de quantité pour les épices, huiles et sauces : dis juste si tu en as.</p>
              <button className="btn btn-primary btn-block" onClick={() => { actions.addFridge(adding.id, 1); setAdding(null); }}>✓ J’en ai</button>
            </>
          ) : (
            <div className="new-product">
              <div className="qty-picker">
                <button className="round-btn" onClick={() => setQty(Math.max(stepFor(adding), qty - stepFor(adding)))}>−</button>
                <div className="big">{fmtBase(qty, adding.unit)}</div>
                <button className="round-btn" onClick={() => setQty(qty + stepFor(adding))}>+</button>
              </div>
              <ExpiryPicker value={expiry} onChange={setExpiry} />
              <button className="btn btn-primary btn-block" onClick={() => { actions.addFridge(adding.id, qty, expiry); setAdding(null); }}>Ajouter au frigo</button>
            </div>
          ))}
      </Sheet>

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing ? getIngredient(editing.ingredientId)?.name ?? '' : ''}>
        {editing && (
          <div className="new-product">
            <ExpiryPicker value={editing.expiresOn} onChange={(v) => setEditing({ ...editing, expiresOn: v })} />
            <button className="btn btn-primary btn-block" onClick={() => { actions.setFridgeExpiry(editing.ingredientId, editing.expiresOn); setEditing(null); }}>Enregistrer</button>
          </div>
        )}
      </Sheet>
    </div>
  );
}
