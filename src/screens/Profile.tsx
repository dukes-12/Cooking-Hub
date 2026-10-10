import { useState } from 'react';
import { DietFields, EquipmentFields, HouseholdFields, LocationFields, RhythmFields, TasteFields } from '../components/ProfileFields';
import { back } from '../router';
import { useApp } from '../state';

const SECTIONS = [
  { id: 'foyer', title: '👤 Foyer', C: HouseholdFields },
  { id: 'lieu', title: '📍 Pays & magasins', C: LocationFields },
  { id: 'regime', title: '🥗 Régime & allergies', C: DietFields },
  { id: 'gouts', title: '💚 Goûts', C: TasteFields },
  { id: 'equipement', title: '🍳 Équipement', C: EquipmentFields },
  { id: 'rythme', title: '⏱ Rythme & budget', C: RhythmFields },
];

export function Profile() {
  const { state, actions } = useApp();
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="screen">
      <header className="screen-head">
        <button className="icon-btn" onClick={() => back()} aria-label="Retour">←</button>
        <h1 className="grow">Mon profil</h1>
      </header>
      <p className="muted small">Chaque modification met à jour immédiatement les suggestions, les prix et les adaptations.</p>
      {SECTIONS.map(({ id, title, C }) => (
        <div key={id} className={`accordion ${open === id ? 'open' : ''}`}>
          <button className="accordion-head" onClick={() => setOpen(open === id ? null : id)} aria-expanded={open === id}>
            <span>{title}</span>
            <span>{open === id ? '−' : '+'}</span>
          </button>
          {open === id && <div className="accordion-body"><C p={state.profile} set={actions.updateProfile} /></div>}
        </div>
      ))}
      <button className="btn btn-ghost btn-block danger-text" onClick={() => confirm('Effacer toutes tes données (profil, frigo, listes) ?') && actions.resetAll()}>
        Réinitialiser l’application
      </button>
      <p className="small muted center">Tes données restent sur ton appareil.</p>
    </div>
  );
}
