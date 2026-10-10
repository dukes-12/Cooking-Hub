import { useEffect, useRef, useState } from 'react';
import { getIngredient } from '../data/ingredients';
import { fetchProductByCode, offProductUrl, type OffProduct } from '../lib/off';
import { ingredientForCategories } from '../lib/openprices';
import { gramsToBase } from '../lib/units';
import type { Ingredient } from '../types';
import { IngredientPicker, Sheet } from './ui';

/* eslint-disable @typescript-eslint/no-explicit-any */
const canScan = typeof window !== 'undefined' && 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia;

/** Quantité à ranger au frigo pour un produit emballé (poids ou volume du paquet, sinon 1 unité). */
export function packQuantity(p: OffProduct, ing: Ingredient): number {
  if (ing.unit === 'pc') return 1;
  const unit = p.qtyUnit?.toLowerCase();
  if (p.qty && (unit === 'g' || unit === 'ml')) return Math.round(ing.unit === 'ml' && unit === 'g' ? p.qty : unit === 'ml' && ing.unit === 'g' ? p.qty * (ing.density ?? 1) : p.qty);
  return Math.round(gramsToBase(ing, 250));
}

/** Recherche d'un produit emballé par son code-barres (Open Food Facts) : scan caméra si le navigateur le permet, sinon saisie. */
export function BarcodeSheet({ open, onClose, onAdd, onOpenProduct }: { open: boolean; onClose: () => void; onAdd: (ingredientId: string, qty: number) => void; onOpenProduct: (ingredientId: string) => void }) {
  const [code, setCode] = useState('');
  const [product, setProduct] = useState<OffProduct | null>(null);
  const [ingId, setIngId] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const video = useRef<HTMLVideoElement>(null);

  const reset = () => {
    setProduct(null);
    setIngId(undefined);
    setError(null);
    setCode('');
  };

  const lookup = async (c: string) => {
    const clean = c.replace(/\D/g, '');
    if (clean.length < 6) return setError('Code-barres trop court.');
    setLoading(true);
    setError(null);
    try {
      const p = await fetchProductByCode(clean);
      setProduct(p);
      setIngId(ingredientForCategories(p.categories));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // Scan caméra (Chrome sur Android) : on lit une image toutes les 300 ms jusqu'à trouver un code.
  useEffect(() => {
    if (!scanning || !open) return;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    let stopped = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (stopped || !video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        const detector = new (window as any).BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
        timer = setInterval(async () => {
          if (!video.current) return;
          const found = await detector.detect(video.current).catch(() => []);
          if (found[0]?.rawValue) {
            setScanning(false);
            setCode(found[0].rawValue);
            lookup(found[0].rawValue);
          }
        }, 300);
      } catch {
        setScanning(false);
        setError('Caméra indisponible : saisis le code à la main.');
      }
    })();
    return () => {
      stopped = true;
      clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning, open]);

  const ing = ingId ? getIngredient(ingId) : undefined;
  const close = () => {
    setScanning(false);
    reset();
    onClose();
  };

  return (
    <Sheet open={open} onClose={close} title="Produit par code-barres">
      {!product ? (
        <>
          {scanning && <video ref={video} className="scan-video" playsInline muted />}
          {canScan && !scanning && <button className="btn btn-primary btn-block" onClick={() => setScanning(true)}>📷 Scanner le code-barres</button>}
          <div className="search-bar">
            <input className="input" inputMode="numeric" value={code} placeholder="Code sous le code-barres (ex. 5601312…)" onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && lookup(code)} />
            <button className="btn btn-soft" disabled={loading || !code.trim()} onClick={() => lookup(code)}>{loading ? '…' : 'Chercher'}</button>
          </div>
          {!canScan && <p className="small muted">Ton navigateur ne sait pas lire les codes-barres avec la caméra (c'est le cas de Safari sur iPhone) : tape les chiffres écrits sous le code.</p>}
          {error && <p className="small warn-text">{error}</p>}
        </>
      ) : (
        <>
          <div className="off-item">
            {product.image ? <img src={product.image} alt="" referrerPolicy="no-referrer" /> : <span className="off-noimg">📦</span>}
            <span className="grow">
              <b>{product.name || 'Produit sans nom'}</b>
              <span className="small muted block">{[product.brands.split(',')[0], product.quantity].filter(Boolean).join(' · ')}</span>
            </span>
            {product.nutriscore && <span className={`nutriscore ns-${product.nutriscore}`}>{product.nutriscore.toUpperCase()}</span>}
          </div>
          <p className="small">{ing ? <>Rangé comme : <b>{ing.name}</b></> : <span className="warn-text">Choisis à quel aliment de l'appli il correspond :</span>}</p>
          <IngredientPicker placeholder={ing ? 'Changer d’aliment…' : 'Quel aliment est-ce ?'} onPick={(i) => i && setIngId(i.id)} />
          <div className="row gap">
            <button className="btn btn-primary grow" disabled={!ing} onClick={() => { onAdd(ing!.id, packQuantity(product, ing!)); close(); }}>🧊 Ajouter au frigo</button>
            <button className="btn btn-soft grow" disabled={!ing} onClick={() => { onOpenProduct(ing!.id); close(); }}>Fiche produit</button>
          </div>
          <div className="row between small">
            <button className="link" onClick={reset}>Autre code</button>
            <a className="link" href={offProductUrl(product.code)} target="_blank" rel="noreferrer">Voir sur Open Food Facts</a>
          </div>
          <p className="small muted">Données Open Food Facts (licence ODbL, photo CC BY-SA).</p>
        </>
      )}
    </Sheet>
  );
}
