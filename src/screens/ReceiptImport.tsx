import { useEffect, useMemo, useState } from 'react';
import { NewProductForm } from '../components/NewProduct';
import { IngredientPicker, Sheet } from '../components/ui';
import { nameFromLabel } from '../lib/custom';
import { getIngredient } from '../data/ingredients';
import { chainsFor, getChain } from '../data/reference';
import { shrinkPhoto } from '../lib/importer';
import { fmtMoney } from '../lib/pricing';
import { draftFromApi, fridgeQuantity, linePricePerKg, readReceiptPhotos, type ReceiptDraft } from '../lib/receipts';
import { findStore, storeKey, storeTitle } from '../lib/stores';
import { uid } from '../lib/text';
import { back, go } from '../router';
import { useApp } from '../state';
import type { ChosenStore, ReceiptLine, SizeUnit } from '../types';

const UNITS: { id: SizeUnit; label: string }[] = [
  { id: 'none', label: '—' },
  { id: 'g', label: 'g' },
  { id: 'kg', label: 'kg' },
  { id: 'ml', label: 'ml' },
  { id: 'cl', label: 'cl' },
  { id: 'l', label: 'L' },
  { id: 'pc', label: 'pièces' },
];

const NEW_STORE = '__new__';

function emptyLine(): ReceiptLine {
  return { id: uid('ln-'), label: '', count: 1, size: null, sizeUnit: 'none', weightKg: null, totalPrice: 0, toFridge: true };
}

/** Ajout d'un ticket de caisse : photo lue par Claude (ou saisie à la main), puis vérification ligne par ligne. */
export function ReceiptImport({ storeKey: presetKey }: { storeKey?: string }) {
  const { state, actions } = useApp();
  const country = state.profile.country;
  const [photos, setPhotos] = useState<File[]>([]);
  const photoUrls = useMemo(() => photos.map((f) => URL.createObjectURL(f)), [photos]);
  useEffect(() => () => photoUrls.forEach((u) => URL.revokeObjectURL(u)), [photoUrls]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ReceiptDraft | null>(null);

  const start = (d: ReceiptDraft) => {
    // Ticket ajouté depuis la fiche d'un magasin : ce magasin est présélectionné si le ticket n'en indique pas d'autre.
    const preset = presetKey ? findStore(state.profile, presetKey) : undefined;
    if (preset && !d.receipt.storeKey) d = { receipt: { ...d.receipt, storeKey: presetKey!, chainId: preset.chainId } };
    setDraft(d);
  };

  const analyse = async () => {
    setError(null);
    setLoading(true);
    try {
      const images = await Promise.all(photos.map((f) => shrinkPhoto(f, 2000)));
      start(draftFromApi(await readReceiptPhotos(images), state.profile.stores, country, state.labelMemory));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const manual = () =>
    start({
      receipt: { id: uid('rc-'), storeKey: '', chainId: '', country, date: new Date().toISOString().slice(0, 10), total: null, lines: [emptyLine()], createdAt: Date.now() },
    });

  if (draft) {
    return (
      <ReceiptReview
        draft={draft}
        onChange={setDraft}
        onCancel={() => setDraft(null)}
        onConfirm={(d) => {
          const toFridge = d.receipt.lines
            .filter((l) => l.toFridge && l.productId)
            .map((l) => ({ ingredientId: l.productId!, qty: fridgeQuantity(l, getIngredient(l.productId!)!) }))
            .filter((x) => getIngredient(x.ingredientId));
          actions.addReceipt(d.receipt, d.newStore, toFridge);
          go(`/store/${encodeURIComponent(d.receipt.storeKey)}`);
        }}
      />
    );
  }

  return (
    <div className="screen">
      <header className="screen-head">
        <button className="icon-btn" onClick={() => back(presetKey ? `/store/${encodeURIComponent(presetKey)}` : '/stores')} aria-label="Retour">←</button>
        <h1 className="grow">Ajouter un ticket</h1>
      </header>
      <p className="muted small">
        Photographie ton ticket de caisse : on lit le magasin, la date et chaque article avec son prix. Tu vérifies tout avant de valider. Les prix
        s'ajoutent à la fiche du magasin et les articles peuvent aller directement au frigo.
      </p>
      <div className="card">
        {photos.length > 0 && (
          <div className="photo-grid">
            {photos.map((_, i) => (
              <div key={i} className="photo-thumb">
                <img src={photoUrls[i]} alt={`Photo ${i + 1}`} />
                <button className="icon-btn sm glass" onClick={() => setPhotos(photos.filter((_, j) => j !== i))} aria-label="Retirer">✕</button>
              </div>
            ))}
          </div>
        )}
        {photos.length < 4 && (
          <div className="row gap">
            <label className="btn btn-soft grow">
              📷 Appareil
              <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) setPhotos([...photos, f]); e.target.value = ''; }} />
            </label>
            <label className="btn btn-soft grow">
              🖼️ Galerie
              <input type="file" accept="image/*" multiple hidden onChange={(e) => { setPhotos([...photos, ...Array.from(e.target.files ?? [])].slice(0, 4)); e.target.value = ''; }} />
            </label>
          </div>
        )}
        <p className="small muted">Ticket long : prends-le en 2 à 4 photos, de haut en bas.</p>
        <button className="btn btn-primary btn-block" disabled={!photos.length || loading} onClick={analyse}>
          {loading ? 'Lecture du ticket… (~15 s)' : 'Lire le ticket'}
        </button>
        {error && <p className="small warn-text">{error}</p>}
      </div>
      <button className="btn btn-ghost btn-block" onClick={manual}>✍️ Saisir le ticket à la main</button>
    </div>
  );
}

function ReceiptReview({ draft, onChange, onCancel, onConfirm }: { draft: ReceiptDraft; onChange: (d: ReceiptDraft) => void; onCancel: () => void; onConfirm: (d: ReceiptDraft) => void }) {
  const { state, actions } = useApp();
  const { receipt, newStore } = draft;
  const [picking, setPicking] = useState<string | null>(null);
  const [newProduct, setNewProduct] = useState<string | null>(null);
  const [newChain, setNewChain] = useState(newStore?.chainId ?? '');
  const [newName, setNewName] = useState(newStore?.label ?? '');

  const stores: ChosenStore[] = [...state.profile.stores, ...(newStore ? [newStore] : [])];
  const creating = !receipt.storeKey || receipt.storeKey === NEW_STORE;
  const country = getChain(receipt.chainId)?.country ?? state.profile.country;
  const money = (v: number | null) => fmtMoney(v, country);

  const setReceipt = (patch: Partial<typeof receipt>) => onChange({ ...draft, receipt: { ...receipt, ...patch } });
  const setLine = (id: string, patch: Partial<ReceiptLine>) => setReceipt({ lines: receipt.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)) });

  const chooseStore = (key: string) => {
    if (key === NEW_STORE) return setReceipt({ storeKey: NEW_STORE, chainId: newChain });
    const s = stores.find((x) => storeKey(x) === key);
    setReceipt({ storeKey: key, chainId: s?.chainId ?? '', country: getChain(s?.chainId ?? '')?.country ?? state.profile.country });
  };

  const sum = Math.round(receipt.lines.reduce((s, l) => s + (l.totalPrice || 0), 0) * 100) / 100;
  const gap = receipt.total != null ? Math.round((receipt.total - sum) * 100) / 100 : 0;
  const lines = receipt.lines.filter((l) => l.label.trim() || l.totalPrice > 0);
  const unmatched = lines.filter((l) => !l.productId).length;
  const toFridge = lines.filter((l) => l.toFridge && l.productId).length;
  const canSave = (creating ? !!newChain : !!receipt.storeKey) && lines.length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(receipt.date);

  const confirm = () => {
    let store = newStore;
    let key = receipt.storeKey;
    if (creating) {
      store = { id: uid('st-'), chainId: newChain, label: newName.trim() || getChain(newChain)?.name || '', source: 'receipt' };
      key = storeKey(store);
    } else if (newStore && key !== storeKey(newStore)) {
      store = undefined; // le magasin proposé n'a pas été retenu
    }
    const chainId = creating ? newChain : receipt.chainId;
    onConfirm({ newStore: store, receipt: { ...receipt, storeKey: key, chainId, country: getChain(chainId)?.country ?? state.profile.country, lines, createdAt: Date.now() } });
  };

  const pickingLine = receipt.lines.find((l) => l.id === picking);

  return (
    <div className="screen">
      <header className="screen-head">
        <button className="icon-btn" onClick={onCancel} aria-label="Retour">←</button>
        <h1 className="grow">Vérifier le ticket</h1>
      </header>
      <p className="small muted">Corrige ce que la lecture a mal compris, puis valide. Touche le nom d'un produit pour l'associer à un autre article de l'appli.</p>

      <div className="card">
        <label className="field">
          <span>Magasin</span>
          <select className="input" value={creating ? NEW_STORE : receipt.storeKey} onChange={(e) => chooseStore(e.target.value)}>
            {stores.map((s) => (
              <option key={storeKey(s)} value={storeKey(s)}>
                {storeTitle(s)}{s === newStore ? ' (nouveau)' : ''}{s.address ? ` – ${s.address}` : ''}
              </option>
            ))}
            <option value={NEW_STORE}>＋ Autre magasin…</option>
          </select>
        </label>
        {creating && (
          <div className="row gap">
            <label className="field grow">
              <span>Enseigne</span>
              <select className="input" value={newChain} onChange={(e) => { setNewChain(e.target.value); setReceipt({ chainId: e.target.value }); }}>
                <option value="">Choisir…</option>
                {chainsFor(state.profile.country).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="field grow">
              <span>Nom du magasin</span>
              <input className="input" value={newName} placeholder="ex. Continente Lumiar" onChange={(e) => setNewName(e.target.value)} />
            </label>
          </div>
        )}
        <div className="row gap">
          <label className="field grow">
            <span>Date d'achat</span>
            <input className="input" type="date" value={receipt.date} onChange={(e) => setReceipt({ date: e.target.value })} />
          </label>
          <label className="field grow">
            <span>Total du ticket</span>
            <input className="input" type="number" inputMode="decimal" step="0.01" value={receipt.total ?? ''} onChange={(e) => setReceipt({ total: e.target.value === '' ? null : Number(e.target.value) })} />
          </label>
        </div>
      </div>

      <div className="ticket">
        {receipt.lines.map((l) => {
          const ing = l.productId ? getIngredient(l.productId) : undefined;
          const perKg = linePricePerKg(l, ing);
          return (
            <div key={l.id} className={`ticket-line ${ing ? '' : 'is-unmatched'}`}>
              <div className="row gap">
                <input className="input grow" value={l.label} placeholder="Libellé du ticket" onChange={(e) => setLine(l.id, { label: e.target.value })} aria-label="Libellé" />
                <button className="icon-btn sm" onClick={() => setReceipt({ lines: receipt.lines.filter((x) => x.id !== l.id) })} aria-label="Supprimer la ligne">✕</button>
              </div>
              <button className="ticket-product" onClick={() => setPicking(l.id)}>
                {ing ? <>→ <b>{ing.name}</b>{ing.custom && <span className="badge badge-good">à moi</span>}</> : <span className="warn-text">⚠️ Associer ou créer un produit</span>}
                <span className="small muted"> ✎</span>
              </button>
              <div className="ticket-fields">
                <label>
                  <span className="small muted">Qté</span>
                  <input className="input" type="number" min={1} value={l.count} onChange={(e) => setLine(l.id, { count: Math.max(1, Number(e.target.value) || 1) })} />
                </label>
                <label>
                  <span className="small muted">Format</span>
                  <span className="row">
                    <input className="input" type="number" inputMode="decimal" min={0} value={l.size ?? ''} placeholder="—" onChange={(e) => setLine(l.id, { size: e.target.value === '' ? null : Number(e.target.value) })} />
                    <select className="input" value={l.sizeUnit} onChange={(e) => setLine(l.id, { sizeUnit: e.target.value as SizeUnit })}>
                      {UNITS.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
                    </select>
                  </span>
                </label>
                <label>
                  <span className="small muted">Poids (kg)</span>
                  <input className="input" type="number" inputMode="decimal" step="0.001" min={0} value={l.weightKg ?? ''} placeholder="—" onChange={(e) => setLine(l.id, { weightKg: e.target.value === '' ? null : Number(e.target.value) })} />
                </label>
                <label>
                  <span className="small muted">Prix</span>
                  <input className="input" type="number" inputMode="decimal" step="0.01" min={0} value={l.totalPrice || ''} onChange={(e) => setLine(l.id, { totalPrice: Number(e.target.value) || 0 })} />
                </label>
              </div>
              <div className="row between small">
                <span className="muted">{perKg ? `${money(perKg)} /${ing?.unit === 'ml' ? 'L' : 'kg'}` : ''}</span>
                <label className="row gap-sm">
                  <input type="checkbox" checked={l.toFridge && !!ing} disabled={!ing} onChange={(e) => setLine(l.id, { toFridge: e.target.checked })} />
                  🧊 Au frigo
                </label>
              </div>
            </div>
          );
        })}
        <button className="btn btn-ghost btn-block" onClick={() => setReceipt({ lines: [...receipt.lines, emptyLine()] })}>＋ Ajouter une ligne</button>
      </div>

      <div className="card">
        <div className="row between"><span>Somme des lignes</span><b>{money(sum)}</b></div>
        {receipt.total != null && Math.abs(gap) >= 0.01 && (
          <p className="small warn-text">
            Écart de {money(Math.abs(gap))} avec le total imprimé ({money(receipt.total)}) : une ligne manque ou un prix est mal lu (les remises comptent comme des lignes négatives).
          </p>
        )}
        {unmatched > 0 && <p className="small muted">{unmatched} article{unmatched > 1 ? 's' : ''} non associé{unmatched > 1 ? 's' : ''} : gardé{unmatched > 1 ? 's' : ''} dans le ticket, sans prix enregistré. Touche « Associer ou créer » pour l'ajouter à tes produits.</p>}
        <button className="btn btn-primary btn-block" disabled={!canSave} onClick={confirm}>
          ✓ Valider le ticket{toFridge ? ` · ${toFridge} article${toFridge > 1 ? 's' : ''} au frigo` : ''}
        </button>
      </div>

      <Sheet open={!!pickingLine} onClose={() => { setPicking(null); setNewProduct(null); }} title={newProduct != null ? 'Nouveau produit' : pickingLine ? `« ${pickingLine.label || 'Article'} »` : ''}>
        {newProduct != null && pickingLine ? (
          <NewProductForm
            key={pickingLine.id}
            initialName={newProduct}
            label={pickingLine.label}
            onCancel={() => setNewProduct(null)}
            onCreate={(ing) => {
              actions.addCustomProduct(ing);
              setLine(pickingLine.id, { productId: ing.id, toFridge: true });
              setNewProduct(null);
              setPicking(null);
            }}
          />
        ) : (
          <>
            <IngredientPicker
              placeholder="Quel produit est-ce ?"
              onCreate={(text) => setNewProduct(text)}
              onPick={(ing) => {
                if (ing && pickingLine) setLine(pickingLine.id, { productId: ing.id, toFridge: true });
                setPicking(null);
              }}
            />
            {pickingLine && (
              <button className="btn btn-soft btn-block" onClick={() => setNewProduct(nameFromLabel(pickingLine.label))}>
                ＋ Nouveau produit « {nameFromLabel(pickingLine.label) || 'Article'} »
              </button>
            )}
            <p className="small muted">Nouveau dans l'appli ? Crée-le : il gardera ses prix et sera reconnu automatiquement sur tes prochains tickets.</p>
            {pickingLine?.productId && (
              <button className="btn btn-ghost btn-block" onClick={() => { setLine(pickingLine.id, { productId: undefined, toFridge: false }); setPicking(null); }}>
                Ce n'est pas un aliment (ne pas associer)
              </button>
            )}
          </>
        )}
      </Sheet>
    </div>
  );
}
