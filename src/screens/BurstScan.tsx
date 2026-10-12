import { useEffect, useRef, useState } from 'react';
import { offDraft } from '../components/BarcodeSheet';
import { resolvePlace, StorePicker } from '../components/ExactPrices';
import { getChain } from '../data/reference';
import { getBarcodeDetector, readBarcodeFromFile } from '../lib/barcode';
import { customByBarcode, makeCustomProduct } from '../lib/custom';
import { fetchProductByCode } from '../lib/off';
import { ingredientForCategories } from '../lib/openprices';
import { fmtMoney } from '../lib/pricing';
import { storeKey, storeTitle } from '../lib/stores';
import { uid } from '../lib/text';
import { back } from '../router';
import { useApp } from '../state';
import type { Ingredient, SizeUnit } from '../types';

interface Found {
  code: string;
  ing: Ingredient;
  /** Fiche à créer à l'enregistrement (produit d'Open Food Facts ou inconnu). */
  isNew: boolean;
}

const canScan = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

/**
 * Relevé de prix en rafale : on choisit le magasin une fois, puis scan → prix → scan suivant.
 * Tous les prix de la séance vont sur un même ticket de relevé ; les produits inconnus deviennent mes produits.
 */
export function BurstScan() {
  const { state, actions } = useApp();
  const [key, setKey] = useState(state.profile.stores[0] ? storeKey(state.profile.stores[0]) : '');
  const { store, chainId } = resolvePlace(state.profile.stores, key);
  const [found, setFound] = useState<Found | null>(null);
  const [unknownCode, setUnknownCode] = useState<string | null>(null);
  const [unknownName, setUnknownName] = useState('');
  const [price, setPrice] = useState('');
  const [size, setSize] = useState('');
  const [unit, setUnit] = useState<SizeUnit>('g');
  const [manual, setManual] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Relance la caméra après une lecture inutilisable.
  const [attempt, setAttempt] = useState(0);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ name: string; price: number }[]>([]);
  const video = useRef<HTMLVideoElement>(null);
  const priceInput = useRef<HTMLInputElement>(null);
  const scanning = !!chainId && !found && !unknownCode && canScan;

  const show = (f: Found) => {
    setFound(f);
    setPrice('');
    setSize(f.ing.packQty ? String(f.ing.packQty) : f.ing.unit === 'pc' ? '1' : '');
    setUnit(f.ing.unit === 'ml' ? 'ml' : f.ing.unit === 'pc' ? 'pc' : 'g');
    setTimeout(() => priceInput.current?.focus(), 50);
  };

  const lookup = async (raw: string) => {
    const code = raw.replace(/\D/g, '');
    if (code.length < 6) {
      setAttempt((a) => a + 1);
      return setError('Code-barres trop court.');
    }
    setError(null);
    const mine = customByBarcode(code);
    if (mine) return show({ code, ing: mine, isNew: false });
    setBusy(true);
    try {
      const p = await fetchProductByCode(code);
      show({ code, ing: offDraft(p, ingredientForCategories(p.categories)), isNew: true });
    } catch {
      // Inconnu d'Open Food Facts : on demande juste son nom.
      setUnknownCode(code);
      setUnknownName('');
    } finally {
      setBusy(false);
    }
  };

  // Caméra allumée tant qu'on attend un code.
  useEffect(() => {
    if (!scanning) return;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    let stopped = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (stopped || !video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        const detector = await getBarcodeDetector();
        let reading = false;
        timer = setInterval(async () => {
          if (!video.current || reading || stopped || video.current.readyState < 2) return;
          reading = true;
          const codes = await detector.detect(video.current).catch(() => []);
          reading = false;
          if (codes[0]?.rawValue && !stopped) {
            stopped = true;
            navigator.vibrate?.(80);
            lookup(codes[0].rawValue);
          }
        }, 300);
      } catch {
        setError('Caméra indisponible : tape les chiffres du code-barres.');
      }
    })();
    return () => {
      stopped = true;
      clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning, attempt]);

  const value = Number(price.replace(',', '.'));
  const save = () => {
    if (!found || !chainId || !(value > 0)) return;
    if (found.isNew) actions.addCustomProduct(found.ing);
    const qty = Number(size.replace(',', '.'));
    const line = { id: uid('l-'), label: found.ing.name, productId: found.ing.id, count: 1, size: qty > 0 ? qty : null, sizeUnit: qty > 0 ? unit : ('none' as const), weightKg: null, totalPrice: value, toFridge: false };
    if (receiptId && state.receipts.some((r) => r.id === receiptId && r.storeKey === key)) {
      actions.appendReceiptLine(receiptId, line);
    } else {
      const id = uid('rc-');
      actions.addReceipt({ id, storeKey: key, chainId, country: getChain(chainId)?.country ?? state.profile.country, date: new Date().toISOString().slice(0, 10), total: value, createdAt: Date.now(), lines: [line] }, undefined, []);
      setReceiptId(id);
    }
    setSaved([{ name: found.ing.name, price: value }, ...saved]);
    setFound(null);
  };

  const country = state.profile.country;

  return (
    <div className="cook-mode">
      <header className="cook-head">
        <button className="icon-btn" onClick={() => back('/fridge')} aria-label="Fermer">✕</button>
        <div className="grow">
          <b>Relevé de prix en rafale</b>
          <span className="small muted block">{chainId ? `${store ? storeTitle(store) : getChain(chainId)?.name} · ${saved.length} prix relevé${saved.length > 1 ? 's' : ''}` : 'Choisis d’abord le magasin'}</span>
        </div>
      </header>

      <StorePicker value={key} onChange={(k) => { setKey(k); setReceiptId(null); }} />

      {chainId && (
        found ? (
          <div className="card burst-card">
            <div className="off-item">
              {found.ing.image ? <img src={found.ing.image} alt="" referrerPolicy="no-referrer" /> : <span className="off-noimg">📦</span>}
              <span className="grow">
                <b>{found.ing.name}</b>
                <span className="small muted block">{found.isNew ? 'nouveau · fiche créée à l’enregistrement' : 'dans mes produits'} · {found.code}</span>
              </span>
            </div>
            <div className="row gap">
              <label className="field grow">
                <span>Prix</span>
                <input ref={priceInput} className="input" type="number" inputMode="decimal" step="0.01" min={0} value={price} placeholder="ex. 1,89" onChange={(e) => setPrice(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
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
                    <option value="pc">pc</option>
                  </select>
                </span>
              </label>
            </div>
            <div className="row gap">
              <button className="btn btn-ghost" onClick={() => setFound(null)}>Passer</button>
              <button className="btn btn-primary grow" disabled={!(value > 0)} onClick={save}>✓ Enregistrer · suivant</button>
            </div>
          </div>
        ) : unknownCode ? (
          <div className="card burst-card">
            <b>Produit inconnu ({unknownCode})</b>
            <label className="field">
              <span>Nom du produit</span>
              <input className="input" value={unknownName} placeholder="ex. Bolachas Maria Triunfo" onChange={(e) => setUnknownName(e.target.value)} autoFocus />
            </label>
            <p className="small muted">Tu pourras compléter sa fiche (photo, valeurs nutritionnelles) plus tard depuis la page du produit.</p>
            <div className="row gap">
              <button className="btn btn-ghost" onClick={() => setUnknownCode(null)}>Passer</button>
              <button
                className="btn btn-primary grow"
                disabled={!unknownName.trim()}
                onClick={() => {
                  const ing = makeCustomProduct({ name: unknownName, aisle: 'epicerie', unit: 'g', barcode: unknownCode });
                  setUnknownCode(null);
                  show({ code: unknownCode, ing, isNew: true });
                }}
              >
                Continuer → prix
              </button>
            </div>
          </div>
        ) : (
          <div className="burst-scan">
            {canScan && <video ref={video} className="scan-video" playsInline muted />}
            {busy && <p className="small muted center">Recherche du produit…</p>}
            <div className="search-bar">
              <input className="input" inputMode="numeric" value={manual} placeholder="Ou tape les chiffres du code-barres" onChange={(e) => setManual(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { lookup(manual); setManual(''); } }} />
              <button className="btn btn-soft" disabled={!manual.trim() || busy} onClick={() => { lookup(manual); setManual(''); }}>OK</button>
            </div>
            {!canScan && (
              <label className="btn btn-soft btn-block">
                🖼️ Photo du code-barres
                <input type="file" accept="image/*" capture="environment" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { const c = await readBarcodeFromFile(f).catch(() => null); if (c) lookup(c); else setError('Aucun code-barres lu sur la photo.'); } }} />
              </label>
            )}
          </div>
        )
      )}
      {error && <p className="small warn-text">{error}</p>}

      {saved.length > 0 && (
        <div className="price-table">
          {saved.map((s, i) => (
            <div key={i} className="price-row">
              <span className="grow">{s.name}</span>
              <b>{fmtMoney(s.price, country)}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
