import { useState } from 'react';
import { getIngredient } from '../data/ingredients';
import { ALLERGENS, chainsFor, COUNTRIES, DIETS, EQUIPMENT, getCountry, SPEEDS } from '../data/reference';
import { findNearbyStores, fmtDistance, getPosition, type NearbyStore } from '../lib/geo';
import type { Allergen, ChosenStore, Diet, Equipment, Profile, Speed } from '../types';
import { Chip, ChipGroup, IngredientPicker, Stepper } from './ui';

type Props = { p: Profile; set: (patch: Partial<Profile>) => void };

export function HouseholdFields({ p, set }: Props) {
  return (
    <>
      <label className="field">
        <span>Ton prénom</span>
        <input className="input" value={p.name} placeholder="ex. Alex" onChange={(e) => set({ name: e.target.value })} />
      </label>
      <div className="field">
        <span>Combien de personnes à table en général ?</span>
        <Stepper value={p.household} onChange={(household) => set({ household })} min={1} max={12} label={p.household > 1 ? 'personnes' : 'personne'} />
      </div>
    </>
  );
}

export function LocationFields({ p, set }: Props) {
  const [loading, setLoading] = useState(false);
  const [nearby, setNearby] = useState<NearbyStore[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const chains = chainsFor(p.country);
  const chosen = new Set(p.stores.map((s) => s.chainId));

  const toggle = (store: ChosenStore) => {
    set({ stores: chosen.has(store.chainId) ? p.stores.filter((s) => s.chainId !== store.chainId) : [...p.stores, store] });
  };

  const locate = async () => {
    setLoading(true);
    setError(null);
    try {
      const pos = await getPosition();
      set({ location: pos });
      const stores = await findNearbyStores(pos, p.country);
      // Une ligne par enseigne : le magasin le plus proche.
      const seen = new Set<string>();
      setNearby(stores.filter((s) => (seen.has(s.chain.id) ? false : (seen.add(s.chain.id), true))));
    } catch (e) {
      setError((e as Error).message + ' Choisis tes enseignes dans la liste ci-dessous.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="field">
        <span>Pays</span>
        <div className="chips">
          {COUNTRIES.map((c) => (
            <Chip key={c.code} active={p.country === c.code} onClick={() => set({ country: c.code, stores: p.country === c.code ? p.stores : [] })}>
              {c.flag} {c.name}
            </Chip>
          ))}
        </div>
      </div>
      <label className="field">
        <span>Ville (optionnel)</span>
        <input className="input" value={p.city ?? ''} placeholder="ex. Lyon" onChange={(e) => set({ city: e.target.value })} />
      </label>

      <div className="field">
        <span>Tes magasins</span>
        <button type="button" className="btn btn-soft" onClick={locate} disabled={loading}>
          {loading ? 'Recherche autour de toi…' : '📍 Trouver les magasins près de moi'}
        </button>
        {error && <p className="small warn-text">{error}</p>}
        {nearby && nearby.length === 0 && <p className="small muted">Aucune enseigne connue trouvée à moins de 4 km.</p>}
        {nearby && nearby.length > 0 && (
          <div className="store-list">
            {nearby.map((s) => (
              <label key={s.chain.id} className="store-item">
                <input
                  type="checkbox"
                  checked={chosen.has(s.chain.id)}
                  onChange={() => toggle({ chainId: s.chain.id, label: s.name + (s.address ? ` – ${s.address}` : ''), distanceM: Math.round(s.distanceM) })}
                />
                <span className="store-dot" style={{ background: s.chain.color }} />
                <span className="grow">
                  <b>{s.chain.name}</b>
                  <span className="small muted"> {s.address ?? s.name}</span>
                </span>
                <span className="small muted">{fmtDistance(s.distanceM)}</span>
              </label>
            ))}
          </div>
        )}
        <p className="small muted">Ou sélectionne les enseignes où tu fais tes courses :</p>
        <div className="chips">
          {chains.map((c) => (
            <Chip key={c.id} active={chosen.has(c.id)} onClick={() => toggle({ chainId: c.id, label: c.name })}>
              {c.name}
            </Chip>
          ))}
        </div>
      </div>
    </>
  );
}

export function DietFields({ p, set }: Props) {
  return (
    <>
      <div className="field">
        <span>Régime alimentaire</span>
        <ChipGroup<Diet>
          options={Object.entries(DIETS).map(([id, d]) => ({ id: id as Diet, label: `${d.emoji} ${d.label}` }))}
          value={p.diets}
          onChange={(diets) => set({ diets })}
        />
      </div>
      <div className="field">
        <span>Allergies</span>
        <ChipGroup<Allergen>
          tone="danger"
          options={Object.entries(ALLERGENS).map(([id, a]) => ({ id: id as Allergen, label: a.label }))}
          value={p.allergens}
          onChange={(allergens) => set({ allergens })}
        />
      </div>
      <div className="field">
        <span>Interdits alimentaires (ingrédients précis)</span>
        <IngredientList ids={p.forbidden} tone="danger" onChange={(forbidden) => set({ forbidden })} />
      </div>
    </>
  );
}

export function TasteFields({ p, set }: Props) {
  return (
    <>
      <div className="field">
        <span>💚 Tes aliments préférés</span>
        <IngredientList ids={p.liked} tone="good" onChange={(liked) => set({ liked, disliked: p.disliked.filter((d) => !liked.includes(d)) })} suggestions={['poulet', 'pates', 'saumon', 'champignon', 'avocat', 'chocolat', 'emmental', 'pois-chiches', 'riz', 'oeuf']} />
      </div>
      <div className="field">
        <span>🙅 Ce que tu n’aimes pas</span>
        <IngredientList ids={p.disliked} tone="danger" onChange={(disliked) => set({ disliked, liked: p.liked.filter((l) => !disliked.includes(l)) })} suggestions={['champignon', 'poivron', 'aubergine', 'coriandre', 'oignon', 'chevre', 'brocoli', 'courgette']} />
        <p className="small muted">Les recettes qui en contiennent seront moins proposées, ou l’ingrédient sera remplacé quand c’est possible.</p>
      </div>
    </>
  );
}

function IngredientList({ ids, onChange, tone, suggestions = [] }: { ids: string[]; onChange: (ids: string[]) => void; tone: 'good' | 'danger'; suggestions?: string[] }) {
  const sugg = suggestions.filter((s) => getIngredient(s) && !ids.includes(s));
  return (
    <>
      <div className="chips">
        {ids.map((id) => (
          <Chip key={id} active tone={tone} onClick={() => onChange(ids.filter((x) => x !== id))}>
            {getIngredient(id)?.name ?? id} ✕
          </Chip>
        ))}
        {sugg.map((id) => (
          <Chip key={id} onClick={() => onChange([...ids, id])}>
            + {getIngredient(id)!.name}
          </Chip>
        ))}
      </div>
      <IngredientPicker exclude={ids} onPick={(ing) => ing && onChange([...ids, ing.id])} />
    </>
  );
}

export function EquipmentFields({ p, set }: Props) {
  return (
    <div className="field">
      <span>Ton équipement de cuisine</span>
      <div className="equip-grid">
        {(Object.keys(EQUIPMENT) as Equipment[]).map((e) => {
          const on = p.equipment.includes(e);
          return (
            <button key={e} type="button" className={`equip ${on ? 'is-active' : ''}`} aria-pressed={on} onClick={() => set({ equipment: on ? p.equipment.filter((x) => x !== e) : [...p.equipment, e] })}>
              <span className="equip-emoji">{EQUIPMENT[e].emoji}</span>
              <span>{EQUIPMENT[e].label}</span>
            </button>
          );
        })}
      </div>
      <p className="small muted">Si une recette demande un appareil que tu n’as pas, on te propose une adaptation (ex. four → air fryer ou poêle).</p>
    </div>
  );
}

export function RhythmFields({ p, set }: Props) {
  const currency = getCountry(p.country).currency;
  return (
    <>
      <div className="field">
        <span>Ton rythme en cuisine</span>
        <div className="radio-cards">
          {(Object.keys(SPEEDS) as Speed[]).map((s) => (
            <button key={s} type="button" className={`radio-card ${p.speed === s ? 'is-active' : ''}`} onClick={() => set({ speed: s })}>
              <b>{SPEEDS[s].label}</b>
              <span className="small muted">{SPEEDS[s].desc}</span>
            </button>
          ))}
        </div>
      </div>
      <label className="field">
        <span>
          Budget max par portion : <b>{p.budgetPerServing.toFixed(2).replace('.', ',')} {currency}</b>
        </span>
        <input type="range" min={1} max={12} step={0.5} value={p.budgetPerServing} onChange={(e) => set({ budgetPerServing: Number(e.target.value) })} />
      </label>
      <label className="field">
        <span>
          Objectif calorique par repas : <b>{p.kcalTarget ? `${p.kcalTarget} kcal` : 'pas d’objectif'}</b>
        </span>
        <input type="range" min={0} max={1200} step={50} value={p.kcalTarget ?? 0} onChange={(e) => set({ kcalTarget: Number(e.target.value) || undefined })} />
      </label>
      <label className="toggle-row">
        <input type="checkbox" checked={p.pantryBasics} onChange={(e) => set({ pantryBasics: e.target.checked })} />
        <span>
          J’ai toujours les basiques du placard
          <span className="small muted block">sel, poivre, huile, farine, sucre, épices courantes</span>
        </span>
      </label>
    </>
  );
}
