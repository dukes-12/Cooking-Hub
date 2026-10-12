import { useEffect, useState } from 'react';
import type { Adapted } from '../lib/adapt';
import { presenceOnly } from '../lib/pantry';
import { fmtBase } from '../lib/units';
import { useApp } from '../state';
import { Sheet } from './ui';

/**
 * « J'ai cuisiné » : une fois la recette faite, on retire du frigo ce qu'elle a utilisé (à cocher).
 * Les épices, huiles et sauces restent : on en a toujours.
 */
export function CookedSheet({ adapted, open, onClose, onDone }: { adapted: Adapted; open: boolean; onClose: () => void; onDone: () => void }) {
  const { actions } = useApp();
  const used = adapted.lines
    .filter((l) => !l.removed && l.ingredient && l.baseQty != null && (l.fridge === 'full' || l.fridge === 'partial') && !presenceOnly(l.ingredient))
    .map((l) => ({ ingredientId: l.ingredient!.id, name: l.ingredient!.name, unit: l.ingredient!.unit, qty: Math.min(l.baseQty!, l.fridgeHave), have: l.fridgeHave }));
  const [skip, setSkip] = useState<string[]>([]);
  useEffect(() => setSkip([]), [open]);

  return (
    <Sheet open={open} onClose={onClose} title="Bravo, c’est cuisiné ! 👩‍🍳">
      <div className="new-product">
        {used.length ? (
          <>
            <p className="small">On retire du frigo ce que la recette a utilisé (décoche ce que tu n’as pas pris) :</p>
            <div className="list">
              {used.map((u) => (
                <label key={u.ingredientId} className="fridge-item">
                  <input type="checkbox" checked={!skip.includes(u.ingredientId)} onChange={(e) => setSkip(e.target.checked ? skip.filter((x) => x !== u.ingredientId) : [...skip, u.ingredientId])} />
                  <span className="grow">{u.name}</span>
                  <span className="small muted">−{fmtBase(u.qty, u.unit)}{u.qty >= u.have ? ' (fini)' : ''}</span>
                </label>
              ))}
            </div>
          </>
        ) : (
          <p className="small muted">Rien à retirer du frigo pour cette recette.</p>
        )}
        <p className="small muted">Les épices, huiles et sauces restent dans ton placard.</p>
        <button
          className="btn btn-primary btn-block"
          onClick={() => {
            actions.markCooked(adapted.recipe.id, used.filter((u) => !skip.includes(u.ingredientId)).map(({ ingredientId, qty }) => ({ ingredientId, qty })));
            onDone();
          }}
        >
          ✓ Mettre le frigo à jour
        </button>
      </div>
    </Sheet>
  );
}
