import { go } from '../router';
import { useMemo, useState } from 'react';
import { BarcodeSheet } from '../components/BarcodeSheet';
import { NewProductForm } from '../components/NewProduct';
import { RecipeRow, useMatches } from '../components/RecipeCard';
import { SwipeRow } from '../components/SwipeRow';
import { Chip, Empty, IngredientPicker, Section, Sheet } from '../components/ui';
import { AISLE_LABELS, getIngredient } from '../data/ingredients';
import { baseId } from '../lib/canonical';
import { dateIn, daysLeft, defaultShelfDays, expiryLabel, isSoon, locationOf, LOCATIONS, presenceOnly } from '../lib/pantry';
import { toast } from '../lib/toast';
import { fmtBase } from '../lib/units';
import { useApp } from '../state';
import type { FridgeItem, FridgeLocation, Ingredient } from '../types';

const QUICK = ['oeuf', 'lait', 'beurre', 'oignon', 'ail', 'tomate', 'pates', 'riz', 'emmental', 'creme', 'poulet', 'carotte', 'pomme-de-terre', 'courgette', 'citron', 'yaourt'];
const VIEW_KEY = 'cooking-hub:fridge-view';

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

function LocationPicker({ value, onChange }: { value: FridgeLocation; onChange: (v: FridgeLocation) => void }) {
  return (
    <div className="field">
      <span>Rangé dans</span>
      <div className="segmented">
        {LOCATIONS.map((l) => <button key={l.id} className={value === l.id ? 'is-active' : ''} onClick={() => onChange(l.id)}>{l.emoji} {l.label}</button>)}
      </div>
    </div>
  );
}

const readView = (): 'aisle' | 'location' => {
  try {
    return localStorage.getItem(VIEW_KEY) === 'location' ? 'location' : 'aisle';
  } catch {
    return 'aisle';
  }
};

export function Fridge() {
  const { state, actions } = useApp();
  const matches = useMatches();
  const [adding, setAdding] = useState<Ingredient | null>(null);
  const [qty, setQty] = useState(0);
  const [expiry, setExpiry] = useState<string | undefined>();
  const [location, setLocation] = useState<FridgeLocation>('frigo');
  const [editing, setEditing] = useState<FridgeItem | null>(null);
  const [barcode, setBarcode] = useState(false);
  const [newProduct, setNewProduct] = useState<string | null>(null);
  const [view, setView] = useState(readView);
  const favorites = state.favoriteProducts ?? [];

  const changeView = (v: 'aisle' | 'location') => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // stockage indisponible : la vue reste celle de la session
    }
  };

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

  // Produits groupés par rayon (de leur grande famille) ou par emplacement ; ce qui périme d'abord en haut.
  const groups = useMemo(() => {
    const g = new Map<string, FridgeItem[]>();
    for (const f of state.fridge) {
      const ing = getIngredient(f.ingredientId);
      if (!ing) continue;
      const fam = getIngredient(baseId(ing.id)) ?? ing;
      const key = view === 'location' ? locationOf(f, ing) : fam.aisle;
      g.set(key, [...(g.get(key) ?? []), f]);
    }
    for (const list of g.values()) list.sort((a, b) => (daysLeft(a) ?? 999) - (daysLeft(b) ?? 999));
    const order = (k: string) => (view === 'location' ? LOCATIONS.findIndex((l) => l.id === k) : AISLE_LABELS[k as keyof typeof AISLE_LABELS].order);
    return [...g.entries()].sort((a, b) => order(a[0]) - order(b[0]));
  }, [state.fridge, view]);

  const groupTitle = (key: string) => {
    if (view === 'location') {
      const l = LOCATIONS.find((x) => x.id === key)!;
      return `${l.emoji} ${l.label}`;
    }
    const a = AISLE_LABELS[key as keyof typeof AISLE_LABELS];
    return `${a.emoji} ${a.label}`;
  };

  const open = (ing: Ingredient) => {
    setAdding(ing);
    setQty(defaultQty(ing));
    const shelf = defaultShelfDays(ing);
    setExpiry(shelf ? dateIn(shelf) : undefined);
    setLocation(locationOf({ ingredientId: ing.id, qty: 0, addedAt: 0 }, ing));
  };

  /** Action défaisable : le frigo d'avant est gardé pour « Annuler ». */
  const withUndo = (message: string, run: () => void) => {
    const before = state.fridge;
    run();
    toast(message, () => actions.restore({ fridge: before }));
  };

  const add = (ing: Ingredient, q: number, exp?: string, loc?: FridgeLocation) =>
    withUndo(`${ing.name} ajouté${presenceOnly(ing) ? '' : ` (${fmtBase(q, ing.unit)})`}`, () => {
      actions.addFridge(ing.id, q, exp);
      if (loc && loc !== locationOf({ ingredientId: ing.id, qty: 0, addedAt: 0 }, ing)) actions.setFridgeLocation(ing.id, loc);
    });

  // Ajout rapide : mes favoris d'abord, puis les classiques.
  const quick = [...new Set([...favorites, ...QUICK])].filter((id) => getIngredient(id) && !state.fridge.some((f) => f.ingredientId === id)).slice(0, 18);

  return (
    <div className="screen">
      <header className="screen-head">
        <div>
          <h1>Mon frigo</h1>
          <p className="small muted">{state.fridge.length} produit{state.fridge.length > 1 ? 's' : ''} · glisse ← fini, → racheté</p>
        </div>
        <div className="row gap-sm">
          <button className="btn btn-soft btn-sm" onClick={() => go('/scan')}>⚡ Rafale</button>
          <button className="btn btn-soft btn-sm" onClick={() => setBarcode(true)}>▥ Code-barres</button>
        </div>
      </header>
      <BarcodeSheet
        open={barcode}
        onClose={() => setBarcode(false)}
        onAdd={(id, q) => { const ing = getIngredient(id); if (ing) add(ing, q); }}
        onOpenProduct={(id) => go(`/product/${encodeURIComponent(id)}`)}
      />

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
        {quick.map((id) => (
          <Chip key={id} onClick={() => open(getIngredient(id)!)}>{favorites.includes(id) ? '★' : '+'} {getIngredient(id)!.name}</Chip>
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

      {state.fridge.length > 0 && (
        <div className="segmented">
          <button className={view === 'aisle' ? 'is-active' : ''} onClick={() => changeView('aisle')}>Par rayon</button>
          <button className={view === 'location' ? 'is-active' : ''} onClick={() => changeView('location')}>Frigo · congélo · placard</button>
        </div>
      )}

      {state.fridge.length === 0 ? (
        <Empty emoji="🧊" title="Ton frigo est vide">
          <p className="muted">Ajoute ce que tu as : on te proposera des recettes qui l’utilisent et on le déduira de ta liste de courses.</p>
        </Empty>
      ) : (
        groups.map(([key, items]) => (
          <Section key={key} title={groupTitle(key)}>
            <div className="list">
              {items.map((f) => {
                const ing = getIngredient(f.ingredientId)!;
                // Produit exact affiché sous sa grande famille (« Œuf » · Œufs bio Continente ×12).
                const fam = getIngredient(baseId(ing.id));
                const exact = fam && fam.id !== ing.id ? ing : null;
                const step = stepFor(ing);
                const presence = presenceOnly(ing);
                const exp = expiryLabel(f);
                const fav = favorites.includes(ing.id) || (!!fam && favorites.includes(fam.id));
                return (
                  <SwipeRow
                    key={f.ingredientId}
                    left={{ label: '✓ Fini', run: () => withUndo(`${ing.name} : fini`, () => actions.setFridgeQty(f.ingredientId, 0)) }}
                    right={presence ? undefined : { label: '↻ Racheté', run: () => withUndo(`${ing.name} : +${fmtBase(defaultQty(ing), ing.unit)}`, () => actions.addFridge(ing.id, defaultQty(ing), (() => { const d = defaultShelfDays(ing); return d ? dateIn(d) : undefined; })())) }}
                  >
                    <div className="fridge-item">
                      <div className="grow">
                        <button className="link-plain" onClick={() => go(`/product/${encodeURIComponent(ing.id)}`)}>
                          <b>{fav ? '★ ' : ''}{(fam ?? ing).name}</b>
                        </button>
                        {exact && <span className="small muted block">{exact.name}</span>}
                        {!presence && (
                          <button className={`link-plain small block ${isSoon(f) ? 'warn-text' : 'muted'}`} onClick={() => setEditing(f)}>
                            {exp ? `📅 ${exp}` : '📅 ajouter une date'}
                          </button>
                        )}
                      </div>
                      {presence ? (
                        <div className="row gap-sm">
                          <span className="badge badge-good">✓ J’en ai</span>
                          <button className="icon-btn sm" onClick={() => withUndo(`${ing.name} : plus en stock`, () => actions.setFridgeQty(f.ingredientId, 0))} aria-label="Je n’en ai plus" title="Je n’en ai plus">✕</button>
                        </div>
                      ) : (
                        <div className="stepper">
                          <button onClick={() => actions.setFridgeQty(f.ingredientId, +(f.qty - step).toFixed(2))} aria-label="Moins">−</button>
                          <span>{fmtBase(f.qty, ing.unit)}</span>
                          <button onClick={() => actions.setFridgeQty(f.ingredientId, f.qty + step)} aria-label="Plus">+</button>
                        </div>
                      )}
                    </div>
                  </SwipeRow>
                );
              })}
            </div>
          </Section>
        ))
      )}

      <Sheet open={!!adding} onClose={() => setAdding(null)} title={`Ajouter : ${adding?.name ?? ''}`}>
        {adding && (
          <div className="new-product">
            {presenceOnly(adding) ? (
              <p className="small muted">Pas besoin de quantité pour les épices, huiles et sauces : dis juste si tu en as.</p>
            ) : (
              <>
                <div className="qty-picker">
                  <button className="round-btn" onClick={() => setQty(Math.max(stepFor(adding), qty - stepFor(adding)))}>−</button>
                  <div className="big">{fmtBase(qty, adding.unit)}</div>
                  <button className="round-btn" onClick={() => setQty(qty + stepFor(adding))}>+</button>
                </div>
                <ExpiryPicker value={expiry} onChange={setExpiry} />
                <LocationPicker value={location} onChange={setLocation} />
              </>
            )}
            <button className="btn btn-ghost btn-sm" onClick={() => actions.toggleFavoriteProduct(adding.id)}>
              {favorites.includes(adding.id) ? '★ Dans mes favoris' : '☆ Ajouter à mes favoris'}
            </button>
            <button className="btn btn-primary btn-block" onClick={() => { add(adding, presenceOnly(adding) ? 1 : qty, presenceOnly(adding) ? undefined : expiry, presenceOnly(adding) ? undefined : location); setAdding(null); }}>
              {presenceOnly(adding) ? '✓ J’en ai' : 'Ajouter au frigo'}
            </button>
          </div>
        )}
      </Sheet>

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing ? getIngredient(editing.ingredientId)?.name ?? '' : ''}>
        {editing && (
          <div className="new-product">
            <ExpiryPicker value={editing.expiresOn} onChange={(v) => setEditing({ ...editing, expiresOn: v })} />
            <LocationPicker value={locationOf(editing, getIngredient(editing.ingredientId))} onChange={(v) => setEditing({ ...editing, location: v })} />
            <button
              className="btn btn-primary btn-block"
              onClick={() => {
                actions.setFridgeExpiry(editing.ingredientId, editing.expiresOn);
                if (editing.location) actions.setFridgeLocation(editing.ingredientId, editing.location);
                setEditing(null);
              }}
            >
              Enregistrer
            </button>
          </div>
        )}
      </Sheet>
    </div>
  );
}
