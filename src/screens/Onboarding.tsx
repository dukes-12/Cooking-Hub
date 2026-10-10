import { useState } from 'react';
import { DietFields, EquipmentFields, HouseholdFields, LocationFields, RhythmFields, TasteFields } from '../components/ProfileFields';
import { DEFAULT_PROFILE, useApp } from '../state';
import type { Profile } from '../types';

const STEPS = [
  { title: 'Faisons connaissance', sub: 'Pour adapter les portions et les quantités.', C: HouseholdFields },
  { title: 'Où fais-tu tes courses ?', sub: 'On estime le prix des recettes selon ton pays et tes magasins.', C: LocationFields },
  { title: 'Ce que tu manges', sub: 'Régime, allergies et interdits : on ne te proposera rien d’incompatible.', C: DietFields },
  { title: 'Tes goûts', sub: 'Pour mettre en avant ce que tu aimes.', C: TasteFields },
  { title: 'Ta cuisine', sub: 'On adapte les recettes à ton équipement.', C: EquipmentFields },
  { title: 'Ton rythme & ton budget', sub: 'Dernière étape !', C: RhythmFields },
];

export function Onboarding() {
  const { actions } = useApp();
  const [step, setStep] = useState(-1);
  const [p, setP] = useState<Profile>(DEFAULT_PROFILE);
  const set = (patch: Partial<Profile>) => setP((cur) => ({ ...cur, ...patch }));

  if (step < 0) {
    return (
      <div className="welcome">
        <div className="welcome-art" aria-hidden>
          <span>🥕</span><span>🍝</span><span>🧀</span><span>🥑</span><span>🍋</span>
        </div>
        <h1>Cooking Hub</h1>
        <p className="lead">Des recettes qui collent à ton budget, ton frigo, ta cuisine et tes goûts — et la liste de courses qui va avec.</p>
        <ul className="welcome-list">
          <li>👆 Swipe des recettes faites pour toi</li>
          <li>🧊 Cuisine avec ce que tu as déjà</li>
          <li>💶 Compare le prix selon tes magasins</li>
          <li>🛒 Liste de courses utilisable hors-ligne</li>
        </ul>
        <button className="btn btn-primary btn-block" onClick={() => setStep(0)}>Créer mon profil (2 min)</button>
      </div>
    );
  }

  const { title, sub, C } = STEPS[step];
  const last = step === STEPS.length - 1;
  return (
    <div className="onboarding">
      <div className="ob-top">
        <button className="icon-btn" onClick={() => setStep(step - 1)} aria-label="Retour">←</button>
        <div className="ob-progress"><div style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} /></div>
        <span className="small muted">{step + 1}/{STEPS.length}</span>
      </div>
      <h1>{title}</h1>
      <p className="muted">{sub}</p>
      <div className="ob-body">
        <C p={p} set={set} />
      </div>
      <div className="ob-actions">
        {!last && step > 0 && <button className="btn btn-ghost" onClick={() => setStep(step + 1)}>Passer</button>}
        <button className="btn btn-primary grow" onClick={() => (last ? actions.completeOnboarding(p) : setStep(step + 1))}>
          {last ? 'C’est parti 🎉' : 'Continuer'}
        </button>
      </div>
    </div>
  );
}
