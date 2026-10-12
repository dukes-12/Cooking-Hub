import { useEffect, useState } from 'react';
import { chainsFor, getChain } from '../data/reference';
import { fetchBarcodePrices, type BarcodePrice } from '../lib/openprices';
import { fmtMoney } from '../lib/pricing';
import { storeKey, storeTitle } from '../lib/stores';
import { uid } from '../lib/text';
import { useApp } from '../state';
import type { Ingredient, SizeUnit } from '../types';
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
  const stores = state.profile.stores;
  const chains = chainsFor(state.profile.country);
  const [key, setKey] = useState(stores[0] ? storeKey(stores[0]) : '');
  const [price, setPrice] = useState('');
  const [size, setSize] = useState(ing.packQty ? String(ing.packQty) : ing.unit === 'pc' ? '1' : '');
  const [unit, setUnit] = useState<SizeUnit>(ing.unit === 'ml' ? 'ml' : ing.unit === 'pc' ? 'pc' : 'g');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const store = stores.find((s) => storeKey(s) === key);
  const chainId = store?.chainId ?? (key.startsWith('chain:') ? key.slice(6) : '');
  const value = Number(price.replace(',', '.'));

  const save = () => {
    if (!chainId || !(value > 0)) return;
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
