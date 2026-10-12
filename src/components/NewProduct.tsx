import { useEffect, useMemo, useState } from 'react';
import { AISLE_LABELS, getIngredient } from '../data/ingredients';
import { readBarcodeFromFile } from '../lib/barcode';
import { makeCustomProduct, type Nutrition } from '../lib/custom';
import { readPackLabel, type PackLabel } from '../lib/label';
import { fetchProductByCode, type OffProduct } from '../lib/off';
import { ingredientForCategories } from '../lib/openprices';
import { deletePhoto, savePhoto, useMyPhoto } from '../lib/photoStore';
import { useApp } from '../state';
import type { Aisle, BaseUnit, Ingredient, NutritionDetails } from '../types';
import { IngredientPicker } from './ui';

const UNITS: { id: BaseUnit; label: string }[] = [
  { id: 'g', label: 'au poids (g)' },
  { id: 'ml', label: 'au volume (ml)' },
  { id: 'pc', label: 'à la pièce' },
];

const NUTRIENTS: { key: keyof Nutrition; label: string }[] = [
  { key: 'kcal', label: 'Énergie (kcal)' },
  { key: 'fat', label: 'Lipides (g)' },
  { key: 'carbs', label: 'Glucides (g)' },
  { key: 'protein', label: 'Protéines (g)' },
];

const DETAILS: { key: keyof NutritionDetails; label: string }[] = [
  { key: 'satFat', label: 'dont saturés (g)' },
  { key: 'sugars', label: 'dont sucres (g)' },
  { key: 'fiber', label: 'Fibres (g)' },
  { key: 'salt', label: 'Sel (g)' },
];

/** Point de départ d'une fiche : libellé du ticket, produit générique reconnu, code-barres scanné… */
export interface ProductSeed {
  name?: string;
  label?: string;
  familyId?: string;
  barcode?: string;
  off?: OffProduct;
}

const str = (v: number | null | undefined) => (v == null ? '' : String(Math.round(v * 10) / 10));
const num = (v: string) => (v.trim() === '' || !Number.isFinite(Number(v.replace(',', '.'))) ? null : Number(v.replace(',', '.')));

/**
 * Fiche d'un produit personnel, à créer ou à modifier : nom, famille, code-barres, photo du paquet,
 * contenu et valeurs nutritionnelles (remplies depuis Open Food Facts ou lues sur la photo de l'étiquette).
 */
export function ProductForm({ seed, editing, onDone, onCancel }: { seed?: ProductSeed; editing?: Ingredient; onDone: (ing: Ingredient) => void; onCancel: () => void }) {
  const { actions } = useApp();
  const seedFamily = seed?.familyId ? getIngredient(seed.familyId) : undefined;
  const [name, setName] = useState(editing?.name ?? seed?.name ?? '');
  const [familyId, setFamilyId] = useState<string | undefined>(editing ? editing.family : seedFamily?.custom ? seedFamily.family : seedFamily?.id);
  const [aisle, setAisle] = useState<Aisle>(editing?.aisle ?? 'epicerie');
  const [unit, setUnit] = useState<BaseUnit>(editing?.unit ?? 'g');
  const [barcode, setBarcode] = useState(editing?.barcode ?? seed?.barcode ?? '');
  const [image, setImage] = useState(editing?.image ?? '');
  const [packQty, setPackQty] = useState(str(editing?.packQty));
  const [nut, setNut] = useState<Record<keyof Nutrition, string>>(() => {
    const has = editing && !editing.partial && (!editing.family || editing.kcal !== getIngredient(editing.family)?.kcal);
    return { kcal: has ? str(editing.kcal) : '', protein: has ? str(editing.protein) : '', carbs: has ? str(editing.carbs) : '', fat: has ? str(editing.fat) : '' };
  });
  const [det, setDet] = useState<Record<keyof NutritionDetails, string>>({ satFat: str(editing?.details?.satFat), sugars: str(editing?.details?.sugars), fiber: str(editing?.details?.fiber), salt: str(editing?.details?.salt) });
  const [scores, setScores] = useState<{ nutriscore?: Ingredient['nutriscore']; nova?: number }>({ nutriscore: editing?.nutriscore, nova: editing?.nova });
  const [photo, setPhoto] = useState<File | null>(null);
  const [dropPhoto, setDropPhoto] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const myPhoto = useMyPhoto('products', editing?.id);
  const preview = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);
  const family = familyId ? getIngredient(familyId) : undefined;
  const shown = preview ?? (dropPhoto ? null : myPhoto) ?? (image || null);

  const fillNutrition = (v: Partial<Record<keyof Nutrition | keyof NutritionDetails, number | null>>) => {
    if (v.kcal == null) return false;
    setNut({ kcal: str(v.kcal), protein: str(v.protein ?? 0), carbs: str(v.carbs ?? 0), fat: str(v.fat ?? 0) });
    setDet({ satFat: str(v.satFat), sugars: str(v.sugars), fiber: str(v.fiber), salt: str(v.salt) });
    return true;
  };
  const fillPack = (qty: number | null, u: string | null) => {
    const q = u?.toLowerCase();
    if (!qty || (q !== 'g' && q !== 'ml' && q !== 'pc')) return;
    setPackQty(str(qty));
    if (!family) setUnit(q as BaseUnit);
  };

  const applyOff = (p: OffProduct) => {
    setName((n) => n.trim() || p.name);
    setBarcode(p.code);
    if (p.image) setImage(p.image);
    if (!familyId) setFamilyId(ingredientForCategories(p.categories));
    fillPack(p.qty, p.qtyUnit);
    setScores({ nutriscore: p.nutriscore ?? undefined, nova: p.nova ?? undefined });
    return fillNutrition(p);
  };
  useEffect(() => {
    if (seed?.off) applyOff(seed.off);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyLabel = (l: PackLabel) => {
    if (l.name) setName((n) => n.trim() || [l.name, l.brand].filter(Boolean).join(' '));
    if (l.barcode && !barcode) setBarcode(l.barcode.replace(/\D/g, ''));
    fillPack(l.quantity, l.quantityUnit);
    return fillNutrition(l);
  };

  const run = async (what: string, fn: () => Promise<void>) => {
    setBusy(what);
    setError(null);
    setNote(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const fromOff = () =>
    run('off', async () => {
      const p = await fetchProductByCode(barcode.replace(/\D/g, ''));
      const withNut = applyOff(p);
      setNote(`Trouvé sur Open Food Facts : ${p.name || 'produit sans nom'}${withNut ? '' : ' (sans valeurs nutritionnelles : prends l’étiquette en photo)'}.`);
    });

  const scanCode = (f: File) =>
    run('code', async () => {
      const c = await readBarcodeFromFile(f);
      if (!c) throw new Error('Aucun code-barres lu : rapproche-toi, ou tape les chiffres.');
      setBarcode(c);
    });

  const readLabel = (files: File[]) =>
    run('label', async () => {
      const l = await readPackLabel(photo ? [photo, ...files] : files);
      setNote(applyLabel(l) ? 'Valeurs nutritionnelles lues sur l’étiquette : vérifie-les.' : 'Pas de tableau nutritionnel lisible : réessaie plus près, bien à plat.');
    });

  const save = () =>
    run('save', async () => {
      const kcal = num(nut.kcal);
      const nutrition: Nutrition | undefined = kcal != null ? { kcal, protein: num(nut.protein) ?? 0, carbs: num(nut.carbs) ?? 0, fat: num(nut.fat) ?? 0 } : undefined;
      const details: NutritionDetails = {};
      for (const d of DETAILS) {
        const v = num(det[d.key]);
        if (v != null) details[d.key] = v;
      }
      let ing = makeCustomProduct({ name, aisle, unit, familyId, label: seed?.label, barcode: barcode.replace(/\D/g, '') || undefined, image: image || undefined, packQty: num(packQty) ?? undefined, nutrition, details, ...scores });
      if (editing) ing = { ...ing, id: editing.id, aliases: [...new Set([...editing.aliases, ...ing.aliases])] };
      actions.addCustomProduct(ing);
      if (photo) await savePhoto('products', ing.id, photo);
      else if (dropPhoto && editing) await deletePhoto('products', ing.id);
      onDone(ing);
    });

  const unitLabel = (family?.unit ?? unit) === 'pc' ? 'pièces' : (family?.unit ?? unit);

  return (
    <div className="new-product">
      <div className="photo-pick">
        {shown ? <img src={shown} alt="" referrerPolicy="no-referrer" /> : <span aria-hidden>📦</span>}
        <div className="grow">
          <label className="btn btn-soft btn-sm">
            📷 {shown ? 'Changer la photo' : 'Photo du produit'}
            <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { setPhoto(f); setDropPhoto(false); } }} />
          </label>
          {(photo || (myPhoto && !dropPhoto)) && <button className="link small" onClick={() => { setPhoto(null); setDropPhoto(true); }}>Retirer ma photo</button>}
          {!photo && !myPhoto && image && <span className="small muted block">Photo Open Food Facts</span>}
        </div>
      </div>

      <label className="field">
        <span>Nom du produit</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="ex. Mélange oignon et ail" />
      </label>

      <div className="field">
        <span>Code-barres <span className="muted small">(facultatif)</span></span>
        <div className="row gap">
          <input className="input grow" inputMode="numeric" value={barcode} placeholder="Chiffres sous le code-barres" onChange={(e) => setBarcode(e.target.value)} />
          <label className="btn btn-soft btn-sm" aria-label="Lire le code-barres sur une photo">
            {busy === 'code' ? '…' : '▥'}
            <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) scanCode(f); }} />
          </label>
        </div>
        {barcode.replace(/\D/g, '').length >= 8 && (
          <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={fromOff}>{busy === 'off' ? 'Recherche…' : '🔎 Remplir depuis Open Food Facts'}</button>
        )}
      </div>

      <div className="field">
        <span>Grande famille <span className="muted small">(facultatif)</span></span>
        {family ? (
          <div className="row between chosen-family">
            <span>↳ <b>{family.name}</b></span>
            <button className="icon-btn sm" onClick={() => setFamilyId(undefined)} aria-label="Retirer la famille">✕</button>
          </div>
        ) : (
          <IngredientPicker placeholder="ex. Herbes de Provence, Oignon…" onPick={(i) => i && setFamilyId(i.custom ? i.family : i.id)} />
        )}
        <span className="small muted">
          {family ? 'Le produit reprend le rayon, les allergènes et le prix de référence de sa famille, et ses prix s’affichent avec elle.' : 'Rattache-le à un produit proche pour profiter de ses prix ; sinon il garde seulement ses propres prix relevés.'}
        </span>
      </div>
      {!family && (
        <div className="row gap">
          <label className="field grow">
            <span>Rayon</span>
            <select className="input" value={aisle} onChange={(e) => setAisle(e.target.value as Aisle)}>
              {(Object.keys(AISLE_LABELS) as Aisle[]).map((a) => <option key={a} value={a}>{AISLE_LABELS[a].emoji} {AISLE_LABELS[a].label}</option>)}
            </select>
          </label>
          <label className="field grow">
            <span>Vendu</span>
            <select className="input" value={unit} onChange={(e) => setUnit(e.target.value as BaseUnit)}>
              {UNITS.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
            </select>
          </label>
        </div>
      )}
      <label className="field">
        <span>Contenu du paquet ({unitLabel}) <span className="muted small">(facultatif)</span></span>
        <input className="input" type="number" inputMode="decimal" min={0} value={packQty} placeholder="ex. 500" onChange={(e) => setPackQty(e.target.value)} />
      </label>

      <div className="field">
        <span>Valeurs nutritionnelles pour 100 {(family?.unit ?? unit) === 'ml' ? 'ml' : 'g'}</span>
        <div className="nutri-grid">
          {NUTRIENTS.map((n) => (
            <label key={n.key}>
              <span className="small muted">{n.label}</span>
              <input className="input" type="number" inputMode="decimal" min={0} step="0.1" value={nut[n.key]} placeholder={family && !family.partial ? str(family[n.key]) : '—'} onChange={(e) => setNut({ ...nut, [n.key]: e.target.value })} />
            </label>
          ))}
          {DETAILS.map((d) => (
            <label key={d.key}>
              <span className="small muted">{d.label}</span>
              <input className="input" type="number" inputMode="decimal" min={0} step="0.1" value={det[d.key]} placeholder="—" onChange={(e) => setDet({ ...det, [d.key]: e.target.value })} />
            </label>
          ))}
        </div>
        <label className="btn btn-soft btn-sm">
          {busy === 'label' ? 'Lecture de l’étiquette… (~10 s)' : '📋 Photo du tableau nutritionnel'}
          <input type="file" accept="image/*" capture="environment" multiple hidden disabled={!!busy} onChange={(e) => { const fs = [...(e.target.files ?? [])]; e.target.value = ''; if (fs.length) readLabel(fs.slice(0, 3)); }} />
        </label>
        <span className="small muted">{family ? `Vide : on garde les valeurs moyennes de « ${family.name} ».` : 'Vide : le produit reste sans valeurs nutritionnelles.'}</span>
      </div>

      {note && <p className="small">{note}</p>}
      {error && <p className="small warn-text">{error}</p>}
      <div className="row gap">
        <button className="btn btn-ghost grow" onClick={onCancel}>Annuler</button>
        <button className="btn btn-primary grow" disabled={!name.trim() || !!busy} onClick={save}>{busy === 'save' ? '…' : editing ? 'Enregistrer' : 'Créer le produit'}</button>
      </div>
    </div>
  );
}

/** Création rapide depuis un libellé de ticket ou une recherche (même fiche complète). */
export function NewProductForm({ initialName, label, onCreate, onCancel }: { initialName: string; label?: string; onCreate: (ing: Ingredient) => void; onCancel: () => void }) {
  return <ProductForm seed={{ name: initialName, label }} onDone={onCreate} onCancel={onCancel} />;
}
