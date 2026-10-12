import { useEffect, useState } from 'react';
import type { Adapted } from '../lib/adapt';
import { presenceOnly } from '../lib/pantry';
import { fmtBase } from '../lib/units';
import { useApp } from '../state';
import type { BaseUnit } from '../types';
import { Sheet } from './ui';

const stepOf = (unit: BaseUnit, qty: number) => (unit === 'pc' ? (qty < 2 ? 0.5 : 1) : qty >= 500 ? 50 : 10);
const round = (v: number, unit: BaseUnit) => (unit === 'pc' ? Math.round(v * 2) / 2 : Math.round(v));

/**
 * « J'ai cuisiné » : une fois la recette faite, on retire du frigo ce qu'elle a utilisé.
 * Chaque quantité se règle (− / + ou saisie ; 0 = rien retiré). Les épices, huiles et sauces restent.
 */
export function CookedSheet({ adapted, open, onClose, onDone }: { adapted: Adapted; open: boolean; onClose: () => void; onDone: () => void }) {
  const { actions } = useApp();
  const used = adapted.lines
    .filter((l) => !l.removed && l.ingredient && (l.fridge === 'full' || l.fridge === 'partial') && !presenceOnly(l.ingredient))
    .map((l) => ({
      ingredientId: l.ingredient!.id,
      name: l.ingredient!.name,
      unit: l.ingredient!.unit,
      have: l.fridgeHave,
      planned: round(Math.min(l.baseQty ?? l.fridgeHave, l.fridgeHave), l.ingredient!.unit),
    }));
  const [qty, setQty] = useState<Record<string, number>>({});
  useEffect(() => {
    if (open) setQty(Object.fromEntries(used.map((u) => [u.ingredientId, u.planned])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = (id: string, v: number, max: number) => setQty({ ...qty, [id]: Math.max(0, Math.min(max, v)) });

  return (
    <Sheet open={open} onClose={onClose} title="Bravo, c’est cuisiné ! 👩‍🍳">
      <div className="new-product">
        {used.length ? (
          <>
            <p className="small">Ce qu’on retire du frigo — ajuste chaque quantité (0 = rien retiré) :</p>
            <div className="list">
              {used.map((u) => {
                const v = qty[u.ingredientId] ?? u.planned;
                const step = stepOf(u.unit, u.have);
                return (
                  <div key={u.ingredientId} className="fridge-item cooked-row">
                    <div className="grow">
                      <b>{u.name}</b>
                      <span className="small muted block">au frigo : {fmtBase(u.have, u.unit)}{v >= u.have ? ' · fini' : ` · reste ${fmtBase(round(u.have - v, u.unit), u.unit)}`}</span>
                    </div>
                    <div className="stepper">
                      <button onClick={() => set(u.ingredientId, round(v - step, u.unit), u.have)} aria-label="Moins">−</button>
                      <input
                        className="stepper-input"
                        type="number"
                        inputMode="decimal"
                        min={0}
                        value={v}
                        onChange={(e) => set(u.ingredientId, Number(e.target.value.replace(',', '.')) || 0, u.have)}
                        aria-label={`Quantité de ${u.name} à retirer`}
                      />
                      <span className="small muted">{u.unit === 'pc' ? '' : u.unit}</span>
                      <button onClick={() => set(u.ingredientId, round(v + step, u.unit), u.have)} aria-label="Plus">+</button>
                    </div>
                    <button className="link small" onClick={() => set(u.ingredientId, v >= u.have ? 0 : u.have, u.have)}>{v >= u.have ? 'aucun' : 'tout'}</button>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <p className="small muted">Rien à retirer du frigo pour cette recette.</p>
        )}
        <p className="small muted">Les épices, huiles et sauces restent dans ton placard.</p>
        <button
          className="btn btn-primary btn-block"
          onClick={() => {
            actions.markCooked(
              adapted.recipe.id,
              used.map((u) => ({ ingredientId: u.ingredientId, qty: qty[u.ingredientId] ?? u.planned })).filter((u) => u.qty > 0),
            );
            onDone();
          }}
        >
          ✓ Mettre le frigo à jour
        </button>
      </div>
    </Sheet>
  );
}
