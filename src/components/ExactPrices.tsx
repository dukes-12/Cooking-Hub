import { useEffect, useState } from 'react';
import { chainsFor, getChain } from '../data/reference';
import { fetchBarcodePrices, type BarcodePrice } from '../lib/openprices';
import { fmtMoney } from '../lib/pricing';
import { storeKey, storeTitle } from '../lib/stores';
import { findNearbyStores, fmtDistance, getPosition, type NearbyStore } from '../lib/geo';
import { uid } from '../lib/text';
import { useApp } from '../state';
import type { ChosenStore, Ingredient, SizeUnit } from '../types';
import { Section, Sheet } from './ui';

/**
 * Prix d'un produit exact : relevés de la communauté pour son code-barres (Open Prices), par enseigne,
 * et saisie d'un prix vu en rayon (enregistré comme un petit ticket : il compte dans les comparatifs).
 */
export function ExactPrices({ ing, onSaved }: { ing: Ingredient; onSaved: (msg: string) => void }) {
  const { state } = useApp();
  const country = state.profile.country;
  const [community, setCommunity] = useState<BarcodePrice[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    setCommunity(null);
    if (ing.barcode) fetchBarcodePrices(ing.barcode, country).then((p) => alive && setCommunity(p)).catch(() => alive && setCommunity([]));
    return () => {
      alive = false;
    };
  }, [ing.barcode, country]);

  return (
    <Section title={ing.barcode ? 'Prix de ce produit exact' : 'Prix vu en magasin'}>
      {ing.barcode && (
        community == null ? (
          <p className="small muted">Recherche des prix relevés pour ce code-barres…</p>
        ) : community.length ? (
          <div className="price-table">
            {community.map((p) => (
              <div key={p.brand} className="price-row">
                <span className="store-dot" style={{ background: p.chainId ? getChain(p.chainId)?.color : 'var(--muted)' }} />
                <span className="grow">
                  {p.brand}
                  <span className="small muted block">Open Prices · {new Date(p.date).toLocaleDateString('fr-FR')}{p.count > 1 ? ` · ${p.count} relevés` : ''}</span>
                </span>
                <b>{fmtMoney(p.price, country)}{p.perKg ? '/kg' : ''}</b>
              </div>
            ))}
          </div>
        ) : (
          <p className="small muted">Personne n'a encore relevé le prix de ce code-barres dans Open Prices.</p>
        )
      )}
      <button className="btn btn-soft btn-block" onClick={() => setOpen(true)}>＋ Noter un prix vu en magasin</button>
      <p className="small muted">Les prix de tes tickets et ceux que tu notes s'affichent dans « Dans mes magasins », enseigne par enseigne.</p>
      <Sheet open={open} onClose={() => setOpen(false)} title="Prix vu en magasin">
        {open && <PriceForm ing={ing} onDone={(msg) => { setOpen(false); if (msg) onSaved(msg); }} />}
      </Sheet>
    </Section>
  );
}

/** Clé d'un prix relevé sans magasin précis : seulement l'enseigne. */
export const chainOnlyKey = (chainId: string) => `chain:${chainId}`;

/**
 * Relevé d'un prix en rayon : dans un de mes magasins, ou seulement pour une enseigne.
 * Enregistré comme un petit ticket : il compte dans les prix de l'appli et le comparatif.
 * beforeSave : donne le produit à enregistrer (ex. fiche créée à la volée depuis Open Food Facts).
 */
export function PriceForm({ ing, onDone, beforeSave, cancelLabel = 'Annuler' }: { ing: Ingredient; onDone: (msg?: string) => void; beforeSave?: () => Ingredient; cancelLabel?: string }) {
  const { state, actions } = useApp();
  const chains = chainsFor(state.profile.country);
  // Magasin trouvé autour de moi : ajouté à mes magasins à l'enregistrement du prix.
  const [picked, setPicked] = useState<ChosenStore | null>(null);
  const stores = picked && !state.profile.stores.some((s) => storeKey(s) === storeKey(picked)) ? [picked, ...state.profile.stores] : state.profile.stores;
  const [key, setKey] = useState(state.profile.stores[0] ? storeKey(state.profile.stores[0]) : '');
  const [nearby, setNearby] = useState<NearbyStore[] | null>(null);
  const [finding, setFinding] = useState(false);
  const [findError, setFindError] = useState<string | null>(null);
  const findAround = async () => {
    setFinding(true);
    setFindError(null);
    try {
      setNearby((await findNearbyStores(await getPosition(), state.profile.country)).slice(0, 8));
    } catch (e) {
      setFindError((e as Error).message);
    } finally {
      setFinding(false);
    }
  };
  const pickNearby = (n: NearbyStore) => {
    // Déjà dans mes magasins (même enseigne, à quelques dizaines de mètres) : on le reprend.
    const saved = state.profile.stores.find((x) => x.chainId === n.chain.id && x.lat != null && x.lon != null && Math.abs(x.lat - n.lat) < 0.0015 && Math.abs(x.lon - n.lon) < 0.0015);
    const store: ChosenStore = saved ?? { id: uid('st-'), chainId: n.chain.id, label: n.name, address: n.address, lat: n.lat, lon: n.lon, distanceM: Math.round(n.distanceM), source: 'google' };
    if (!saved) setPicked(store);
    setKey(storeKey(store));
    setNearby(null);
  };
  const [price, setPrice] = useState('');
  const [size, setSize] = useState(ing.packQty ? String(ing.packQty) : ing.unit === 'pc' ? '1' : '');
  const [unit, setUnit] = useState<SizeUnit>(ing.unit === 'ml' ? 'ml' : ing.unit === 'pc' ? 'pc' : 'g');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const store = stores.find((s) => storeKey(s) === key);
  const chainId = store?.chainId ?? (key.startsWith('chain:') ? key.slice(6) : '');
  const value = Number(price.replace(',', '.'));

  const save = () => {
    if (!chainId || !(value > 0)) return;
    if (picked && storeKey(picked) === key && !state.profile.stores.some((x) => storeKey(x) === key)) actions.addStore(picked);
    const product = beforeSave?.() ?? ing;
    const qty = Number(size.replace(',', '.'));
    actions.addReceipt(
      {
        id: uid('rc-'),
        storeKey: key,
        chainId,
        country: getChain(chainId)?.country ?? state.profile.country,
        date,
        total: value,
        createdAt: Date.now(),
        lines: [{ id: uid('l-'), label: product.name, productId: product.id, count: 1, size: qty > 0 ? qty : null, sizeUnit: qty > 0 ? unit : 'none', weightKg: null, totalPrice: value, toFridge: false }],
      },
      undefined,
      [],
    );
    onDone(`Prix enregistré chez ${store ? storeTitle(store) : getChain(chainId)?.name}`);
  };

  return (
    <div className="new-product">
      <label className="field">
        <span>Où ?</span>
        <select className="input" value={key} onChange={(e) => setKey(e.target.value)}>
          {!key && <option value="">Choisir…</option>}
          {stores.length > 0 && (
            <optgroup label="Mes magasins">
              {stores.map((s) => <option key={storeKey(s)} value={storeKey(s)}>{storeTitle(s)}</option>)}
            </optgroup>
          )}
          <optgroup label="Enseigne seulement (sans magasin précis)">
            {chains.map((c) => <option key={c.id} value={chainOnlyKey(c.id)}>{c.name}</option>)}
          </optgroup>
        </select>
      </label>
      {nearby ? (
        <div className="nearby-list">
          {nearby.length === 0 && <p className="small muted">Aucun supermarché trouvé à proximité.</p>}
          {nearby.map((n) => (
            <button key={`${n.chain.id}-${n.lat}-${n.lon}`} className="price-row" onClick={() => pickNearby(n)}>
              <span className="store-dot" style={{ background: n.chain.color }} />
              <span className="grow">{n.name}<span className="small muted block">{n.address}</span></span>
              <span className="small muted nowrap">{fmtDistance(n.distanceM)}</span>
            </button>
          ))}
          <span className="small muted">Résultats Google</span>
        </div>
      ) : (
        <button className="btn btn-soft btn-sm" disabled={finding} onClick={findAround}>{finding ? 'Recherche…' : '📍 Magasins autour de moi'}</button>
      )}
      {findError && <p className="small warn-text">{findError}</p>}
      {chainId && <p className="small muted">{store ? `Le prix compte pour ${storeTitle(store)} et pour toute l'enseigne ${getChain(chainId)?.name}.` : `Le prix compte pour toute l'enseigne ${getChain(chainId)?.name}.`}</p>}
      <div className="row gap">
        <label className="field grow">
          <span>Prix</span>
          <input className="input" type="number" inputMode="decimal" step="0.01" min={0} value={price} placeholder="ex. 1,89" onChange={(e) => setPrice(e.target.value)} />
        </label>
        <label className="field grow">
          <span>Pour</span>
          <span className="row">
            <input className="input" type="number" inputMode="decimal" min={0} value={size} placeholder="—" onChange={(e) => setSize(e.target.value)} />
            <select className="input" value={unit} onChange={(e) => setUnit(e.target.value as SizeUnit)}>
              <option value="g">g</option>
              <option value="kg">kg</option>
              <option value="ml">ml</option>
              <option value="l">L</option>
              <option value="pc">pièce(s)</option>
            </select>
          </span>
        </label>
      </div>
      <label className="field">
        <span>Date</span>
        <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <div className="row gap">
        <button className="btn btn-ghost grow" onClick={() => onDone()}>{cancelLabel}</button>
        <button className="btn btn-primary grow" disabled={!chainId || !(value > 0)} onClick={save}>Enregistrer le prix</button>
      </div>
    </div>
  );
}
