import { useEffect, useRef, useState } from 'react';
import { getIngredient } from '../data/ingredients';
import { customByBarcode, makeCustomProduct } from '../lib/custom';
import { go } from '../router';
import { useApp } from '../state';
import { PriceForm } from './ExactPrices';
import { useMyPhoto } from '../lib/photoStore';
import { fetchProductByCode, offProductUrl, type OffProduct } from '../lib/off';
import { ingredientForCategories } from '../lib/openprices';
import { gramsToBase } from '../lib/units';
import type { Ingredient } from '../types';
import { ProductForm, type ProductSeed } from './NewProduct';
import { IngredientPicker, Sheet } from './ui';

import { getBarcodeDetector, readBarcodeFromFile } from '../lib/barcode';

// Caméra disponible (HTTPS) : le scan marche partout, avec le lecteur intégré du navigateur ou le décodeur ZXing.
const canScan = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

/** Quantité à ranger au frigo pour un produit emballé (poids ou volume du paquet, sinon 1 unité). */
export function packQuantity(p: OffProduct, ing: Ingredient): number {
  if (ing.unit === 'pc') return 1;
  const unit = p.qtyUnit?.toLowerCase();
  if (p.qty && (unit === 'g' || unit === 'ml')) return Math.round(ing.unit === 'ml' && unit === 'g' ? p.qty : unit === 'ml' && ing.unit === 'g' ? p.qty * (ing.density ?? 1) : p.qty);
  return Math.round(gramsToBase(ing, 250));
}

/** Quantité d'un paquet de mon produit (contenu noté sur sa fiche, sinon 250 g ou 1 pièce). */
const myPackQuantity = (ing: Ingredient) => ing.packQty ?? (ing.unit === 'pc' ? 1 : Math.round(gramsToBase(ing, 250)));

/** Fiche de mon produit tirée d'Open Food Facts (nom, marque, paquet, nutrition), rattachée à l'aliment reconnu. */
export function offDraft(p: OffProduct, familyId?: string): Ingredient {
  const u = p.qtyUnit?.toLowerCase();
  const unit = u === 'ml' || u === 'l' || u === 'cl' ? 'ml' : 'g';
  const name = [p.name || 'Produit', p.brands.split(',')[0]].filter(Boolean).join(' ');
  const nutrition = p.kcal != null ? { kcal: p.kcal, protein: p.protein ?? 0, carbs: p.carbs ?? 0, fat: p.fat ?? 0 } : undefined;
  const details = Object.fromEntries((['satFat', 'sugars', 'fiber', 'salt'] as const).filter((k) => p[k] != null).map((k) => [k, p[k] as number]));
  const draft = makeCustomProduct({ name, aisle: 'epicerie', unit, familyId, barcode: p.code, image: p.image ?? undefined, packQty: p.qty && (u === 'g' || u === 'ml') ? p.qty : undefined, nutrition, details, nutriscore: p.nutriscore ?? undefined, nova: p.nova ?? undefined });
  return { ...draft, id: `mine:off-${p.code}` };
}

/** Recherche d'un produit emballé par son code-barres (Open Food Facts) : scan caméra si le navigateur le permet, sinon saisie. */
export function BarcodeSheet({ open, onClose, onAdd, onOpenProduct }: { open: boolean; onClose: () => void; onAdd: (ingredientId: string, qty: number) => void; onOpenProduct: (ingredientId: string) => void }) {
  const [code, setCode] = useState('');
  const [product, setProduct] = useState<OffProduct | null>(null);
  const [ingId, setIngId] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  // Mon produit portant ce code, code inconnu d'Open Food Facts, fiche en cours de création.
  const [mine, setMine] = useState<Ingredient | null>(null);
  const [unknown, setUnknown] = useState<string | null>(null);
  const [form, setForm] = useState<ProductSeed | null>(null);
  // Relevé du prix en rayon, juste après le scan.
  const [pricing, setPricing] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const { actions } = useApp();
  const minePhoto = useMyPhoto('products', mine?.id);
  const video = useRef<HTMLVideoElement>(null);

  const reset = () => {
    setProduct(null);
    setIngId(undefined);
    setError(null);
    setCode('');
    setMine(null);
    setUnknown(null);
    setForm(null);
    setPricing(false);
    setSaved(null);
  };

  const lookup = async (c: string) => {
    const clean = c.replace(/\D/g, '');
    if (clean.length < 6) return setError('Code-barres trop court.');
    setError(null);
    setUnknown(null);
    // Déjà dans mes produits : on ouvre ma fiche.
    const own = customByBarcode(clean);
    if (own) return setMine(own);
    setLoading(true);
    try {
      const p = await fetchProductByCode(clean);
      setProduct(p);
      setIngId(ingredientForCategories(p.categories));
    } catch (e) {
      setError((e as Error).message);
      setUnknown(clean);
    } finally {
      setLoading(false);
    }
  };

  // Scan caméra : on lit une image toutes les 300 ms jusqu'à trouver un code.
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
        const detector = await getBarcodeDetector();
        let busy = false;
        timer = setInterval(async () => {
          if (!video.current || busy || video.current.readyState < 2) return;
          busy = true;
          const found = await detector.detect(video.current).catch(() => []);
          busy = false;
          if (found[0]?.rawValue && !stopped) {
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
    <Sheet open={open} onClose={close} title={form ? 'Ma fiche produit' : 'Produit par code-barres'}>
      {form ? (
        <ProductForm
          seed={form}
          onCancel={() => setForm(null)}
          onDone={(ing) => {
            setForm(null);
            setProduct(null);
            setMine(ing);
          }}
        />
      ) : mine ? (
        <div className="barcode-start">
          <div className="off-item">
            {minePhoto || mine.image ? <img src={minePhoto ?? mine.image} alt="" referrerPolicy="no-referrer" /> : <span className="off-noimg">📦</span>}
            <span className="grow">
              <b>{mine.name}</b> <span className="badge badge-good">à moi</span>
              <span className="small muted block">{mine.partial ? 'sans valeurs nutritionnelles' : `${mine.kcal} kcal · ${mine.protein} g prot. pour 100 ${mine.unit === 'ml' ? 'ml' : 'g'}`}</span>
            </span>
          </div>
          {saved && <p className="small good-text">✓ {saved}</p>}
          {pricing ? (
            <PriceForm ing={mine} cancelLabel="Plus tard" onDone={(msg) => { setPricing(false); if (msg) setSaved(msg); }} />
          ) : (
            <>
              <button className="btn btn-primary btn-block" onClick={() => setPricing(true)}>💶 Relever le prix en rayon</button>
              <div className="row gap">
                <button className="btn btn-soft grow" onClick={() => { onAdd(mine.id, myPackQuantity(mine)); close(); }}>🧊 Ajouter au frigo</button>
                <button className="btn btn-soft grow" onClick={() => { onOpenProduct(mine.id); close(); }}>Fiche produit</button>
              </div>
              <button className="link small" onClick={reset}>Autre code</button>
            </>
          )}
        </div>
      ) : !product ? (
        <div className="barcode-start">
          {scanning && <video ref={video} className="scan-video" playsInline muted />}
          {canScan && !scanning && <button className="btn btn-primary btn-block" onClick={() => setScanning(true)}>📷 Scanner le code-barres</button>}
          {scanning && <button className="btn btn-ghost btn-block" onClick={() => setScanning(false)}>Arrêter la caméra</button>}
          {!scanning && <button className="btn btn-soft btn-block" onClick={() => { close(); go('/scan'); }}>⚡ Scan en rafale (relever plusieurs prix)</button>}
          <label className="btn btn-soft btn-block">
            🖼️ Photo du code-barres
            <input
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                setError(null);
                setLoading(true);
                try {
                  const code = await readBarcodeFromFile(f);
                  if (code) {
                    setCode(code);
                    await lookup(code);
                  } else setError('Aucun code-barres lu sur la photo : rapproche-toi, ou tape les chiffres.');
                } catch {
                  setError('Lecture impossible : tape les chiffres sous le code-barres.');
                } finally {
                  setLoading(false);
                }
              }}
            />
          </label>
          <div className="search-bar">
            <input className="input" inputMode="numeric" value={code} placeholder="Code sous le code-barres (ex. 5601312…)" onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && lookup(code)} />
            <button className="btn btn-soft" disabled={loading || !code.trim()} onClick={() => lookup(code)}>{loading ? '…' : 'Chercher'}</button>
          </div>
          {!canScan && <p className="small muted">Caméra indisponible ici (il faut l'adresse https de l'appli) : prends une photo ou tape les chiffres écrits sous le code.</p>}
          {error && <p className="small warn-text">{error}</p>}
          {unknown && (
            <button className="btn btn-soft btn-block" onClick={() => setForm({ barcode: unknown })}>✚ Créer ma fiche pour ce code (photo, valeurs nutritionnelles)</button>
          )}
        </div>
      ) : (
        <div className="barcode-start">
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
          {pricing ? (
            <PriceForm
              ing={offDraft(product, ingId)}
              cancelLabel="Plus tard"
              beforeSave={() => {
                // Le prix est rattaché au produit exact : sa fiche est créée depuis Open Food Facts.
                const ing = offDraft(product, ingId);
                actions.addCustomProduct(ing);
                setMine(ing);
                setProduct(null);
                return ing;
              }}
              onDone={(msg) => { setPricing(false); if (msg) setSaved(msg); }}
            />
          ) : (
            <button className="btn btn-primary btn-block" onClick={() => setPricing(true)}>💶 Relever le prix en rayon</button>
          )}
          <button className="btn btn-ghost btn-block" onClick={() => setForm({ barcode: product.code, off: product, familyId: ingId })}>✚ Créer ma fiche de ce produit (ma photo, ses valeurs nutritionnelles)</button>
          <div className="row between small">
            <button className="link" onClick={reset}>Autre code</button>
            <a className="link" href={offProductUrl(product.code)} target="_blank" rel="noreferrer">Voir sur Open Food Facts</a>
          </div>
          <p className="small muted">Données Open Food Facts (licence ODbL, photo CC BY-SA).</p>
        </div>
      )}
    </Sheet>
  );
}
