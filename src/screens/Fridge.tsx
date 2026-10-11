import { go } from '../router';
import { useMemo, useState } from 'react';
import { BarcodeSheet } from '../components/BarcodeSheet';
import { NewProductForm } from '../components/NewProduct';
import { RecipeRow, useMatches } from '../components/RecipeCard';
import { Chip, Empty, IngredientPicker, Section, Sheet } from '../components/ui';
import { AISLE_LABELS, getIngredient } from '../data/ingredients';
import { fmtBase } from '../lib/units';
import { useApp } from '../state';
import type { Ingredient } from '../types';

const QUICK = ['oeuf', 'lait', 'beurre', 'oignon', 'ail', 'tomate', 'pates', 'riz', 'emmental', 'creme', 'poulet', 'carotte', 'pomme-de-terre', 'courgette', 'citron', 'yaourt'];

function defaultQty(ing: Ingredient): number {
  if (ing.unit === 'pc') return ing.id === 'oeuf' ? 6 : 1;
  if (ing.unit === 'ml') return ing.id === 'lait' ? 1000 : 200;
  return ing.aisle === 'epicerie' ? 500 : 250;
}

function stepFor(ing: Ingredient): number {
  if (ing.unit === 'pc') return 1;
  return ing.aisle === 'epicerie' || ing.id === 'lait' ? 100 : 50;
}

export function Fridge() {
  const { state, actions } = useApp();
  const matches = useMatches();
  const [adding, setAdding] = useState<Ingredient | null>(null);
  const [qty, setQty] = useState(0);
  const [barcode, setBarcode] = useState(false);
  const [newProduct, setNewProduct] = useState<string | null>(null);

  const cookNow = useMemo(
    () => matches.filter((m) => m.adapted.status !== 'incompatible' && m.adapted.fridgeCoverage >= 0.4).sort((a, b) => b.adapted.fridgeCoverage - a.adapted.fridgeCoverage || b.score - a.score).slice(0, 4),
    [matches],
  );

  const groups = useMemo(() => {
    const g = new Map<string, typeof state.fridge>();
    for (const f of state.fridge) {
      const ing = getIngredient(f.ingredientId);
      if (!ing) continue;
      g.set(ing.aisle, [...(g.get(ing.aisle) ?? []), f]);
    }
    return [...g.entries()].sort((a, b) => AISLE_LABELS[a[0] as keyof typeof AISLE_LABELS].order - AISLE_LABELS[b[0] as keyof typeof AISLE_LABELS].order);
  }, [state.fridge]);

  const open = (ing: Ingredient) => {
    setAdding(ing);
    setQty(defaultQty(ing));
  };

  return (
    <div className="screen">
      <header className="screen-head">
        <div>
          <h1>Mon frigo</h1>
          <p className="small muted">{state.fridge.length} produit{state.fridge.length > 1 ? 's' : ''} · frigo, congélo et placard</p>
        </div>
        <button className="btn btn-soft btn-sm" onClick={() => setBarcode(true)}>▥ Code-barres</button>
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

      {cookNow.length > 0 && (
        <Section title="À cuisiner avec ce que tu as">
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
                const days = Math.floor((Date.now() - f.addedAt) / 86400000);
                return (
                  <div key={f.ingredientId} className="fridge-item">
                    <div className="grow">
                      <button className="link-plain" onClick={() => go(`/product/${encodeURIComponent(ing.id)}`)}><b>{ing.name}</b></button>
                      <span className="small muted block">{days === 0 ? 'ajouté aujourd’hui' : `il y a ${days} j`}</span>
                    </div>
                    <div className="stepper">
                      <button onClick={() => actions.setFridgeQty(f.ingredientId, +(f.qty - step).toFixed(2))} aria-label="Moins">−</button>
                      <span>{fmtBase(f.qty, ing.unit)}</span>
                      <button onClick={() => actions.setFridgeQty(f.ingredientId, f.qty + step)} aria-label="Plus">+</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>
        ))
      )}

      <Sheet open={!!adding} onClose={() => setAdding(null)} title={`Ajouter : ${adding?.name ?? ''}`}>
        {adding && (
          <>
            <div className="qty-picker">
              <button className="round-btn" onClick={() => setQty(Math.max(stepFor(adding), qty - stepFor(adding)))}>−</button>
              <div className="big">{fmtBase(qty, adding.unit)}</div>
              <button className="round-btn" onClick={() => setQty(qty + stepFor(adding))}>+</button>
            </div>
            <button className="btn btn-primary btn-block" onClick={() => { actions.addFridge(adding.id, qty); setAdding(null); }}>Ajouter au frigo</button>
          </>
        )}
      </Sheet>
    </div>
  );
}
