import { useEffect, useState } from 'react';
import { getChain } from '../data/reference';
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

function PriceForm({ ing, onDone }: { ing: Ingredient; onDone: (msg?: string) => void }) {
  const { state, actions } = useApp();
  const stores = state.profile.stores;
  const [key, setKey] = useState(stores[0] ? storeKey(stores[0]) : '');
  const [price, setPrice] = useState('');
  const [size, setSize] = useState(ing.packQty ? String(ing.packQty) : ing.unit === 'pc' ? '1' : '');
  const [unit, setUnit] = useState<SizeUnit>(ing.unit === 'ml' ? 'ml' : ing.unit === 'pc' ? 'pc' : 'g');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const store = stores.find((s) => storeKey(s) === key);
  const value = Number(price.replace(',', '.'));

  if (!stores.length) return <p className="small">Ajoute d'abord tes magasins dans l'onglet Magasins.</p>;

  const save = () => {
    if (!store || !(value > 0)) return;
    const qty = Number(size.replace(',', '.'));
    actions.addReceipt(
      {
        id: uid('rc-'),
        storeKey: key,
        chainId: store.chainId,
        country: getChain(store.chainId)?.country ?? state.profile.country,
        date,
        total: value,
        createdAt: Date.now(),
        lines: [{ id: uid('l-'), label: ing.name, productId: ing.id, count: 1, size: qty > 0 ? qty : null, sizeUnit: qty > 0 ? unit : 'none', weightKg: null, totalPrice: value, toFridge: false }],
      },
      undefined,
      [],
    );
    onDone(`Prix enregistré chez ${storeTitle(store)}`);
  };

  return (
    <div className="new-product">
      <label className="field">
        <span>Magasin</span>
        <select className="input" value={key} onChange={(e) => setKey(e.target.value)}>
          {stores.map((s) => <option key={storeKey(s)} value={storeKey(s)}>{storeTitle(s)}</option>)}
        </select>
      </label>
      <div className="row gap">
        <label className="field grow">
          <span>Prix ({state.profile.country === 'PT' || state.profile.country === 'FR' ? '€' : 'prix'})</span>
          <input className="input" type="number" inputMode="decimal" step="0.01" min={0} value={price} placeholder="ex. 1,89" onChange={(e) => setPrice(e.target.value)} autoFocus />
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
        <button className="btn btn-ghost grow" onClick={() => onDone()}>Annuler</button>
        <button className="btn btn-primary grow" disabled={!store || !(value > 0)} onClick={save}>Enregistrer le prix</button>
      </div>
    </div>
  );
}
