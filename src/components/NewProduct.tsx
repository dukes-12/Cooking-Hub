import { useState } from 'react';
import { AISLE_LABELS, getIngredient } from '../data/ingredients';
import { makeCustomProduct } from '../lib/custom';
import type { Aisle, BaseUnit, Ingredient } from '../types';
import { IngredientPicker } from './ui';

const UNITS: { id: BaseUnit; label: string }[] = [
  { id: 'g', label: 'au poids (g)' },
  { id: 'ml', label: 'au volume (ml)' },
  { id: 'pc', label: 'à la pièce' },
];

/** Formulaire de création d'un produit personnel (depuis un ticket, le frigo…). */
export function NewProductForm({ initialName, label, onCreate, onCancel }: { initialName: string; label?: string; onCreate: (ing: Ingredient) => void; onCancel: () => void }) {
  const [name, setName] = useState(initialName);
  const [familyId, setFamilyId] = useState<string | undefined>();
  const [aisle, setAisle] = useState<Aisle>('epicerie');
  const [unit, setUnit] = useState<BaseUnit>('g');
  const family = familyId ? getIngredient(familyId) : undefined;

  return (
    <div className="new-product">
      <label className="field">
        <span>Nom du produit</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="ex. Mélange oignon et ail" />
      </label>
      <div className="field">
        <span>Grande famille <span className="muted small">(facultatif)</span></span>
        {family ? (
          <div className="row between chosen-family">
            <span>↳ <b>{family.name}</b></span>
            <button className="icon-btn sm" onClick={() => setFamilyId(undefined)} aria-label="Retirer la famille">✕</button>
          </div>
        ) : (
          <IngredientPicker placeholder="ex. Herbes de Provence, Oignon…" onPick={(i) => i && setFamilyId(i.id)} />
        )}
        <span className="small muted">
          {family ? 'Le produit reprend le rayon, les calories, les allergènes et le prix de référence de sa famille, et ses prix s’affichent avec elle.' : 'Rattache-le à un produit proche pour profiter de ses calories et de ses prix ; sinon il reste « sans fiche détaillée ».'}
        </span>
      </div>
      {!family && (
        <div className="row gap">
          <label className="field grow">
            <span>Rayon</span>
            <select className="input" value={aisle} onChange={(e) => setAisle(e.target.value as Aisle)}>
              {(Object.keys(AISLE_LABELS) as Aisle[]).map((a) => <option key={a} value={a}>{AISLE_LABELS[a].emoji} {AISLE_LABELS[a].label}</option>)}
            </select>
          </label>
          <label className="field grow">
            <span>Vendu</span>
            <select className="input" value={unit} onChange={(e) => setUnit(e.target.value as BaseUnit)}>
              {UNITS.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
            </select>
          </label>
        </div>
      )}
      <div className="row gap">
        <button className="btn btn-ghost grow" onClick={onCancel}>Annuler</button>
        <button className="btn btn-primary grow" disabled={!name.trim()} onClick={() => onCreate(makeCustomProduct({ name, aisle, unit, familyId, label }))}>Créer le produit</button>
      </div>
    </div>
  );
}
