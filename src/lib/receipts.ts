import { getIngredient } from '../data/ingredients';
import { getChain } from '../data/reference';
import type { ChosenStore, Ingredient, Receipt, ReceiptLine, SizeUnit } from '../types';
import { matchChain } from './geo';
import { labelKey, matchCustom } from './custom';
import { matchIngredient } from './importer';
import { storeKey } from './stores';
import { normalize, uid } from './text';
import { baseToGrams, gramsToBase } from './units';

// ---------- Quantités et prix au kilo d'une ligne de ticket ----------

const TO_GRAMS: Partial<Record<SizeUnit, number>> = { kg: 1000, g: 1, l: 1000, cl: 10, ml: 1 };

/** Taille du paquet lue dans le libellé ("LEITE MG 1L", "YAOURT 4X125G") quand le ticket ne la donne pas. */
export function sizeFromLabel(label: string): { size: number; sizeUnit: SizeUnit } | null {
  const t = label.toLowerCase().replace(',', '.');
  const multi = t.match(/(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*(kg|gr?|l|cl|ml)\b/);
  if (multi) return { size: Number(multi[1]) * Number(multi[2]), sizeUnit: unitOf(multi[3]) };
  const one = t.match(/(\d+(?:\.\d+)?)\s*(kg|gr?|l|cl|ml)\b/);
  if (one) return { size: Number(one[1]), sizeUnit: unitOf(one[2]) };
  return null;
}

function unitOf(u: string): SizeUnit {
  return u.startsWith('g') ? 'g' : (u as SizeUnit);
}

/** Quantité achetée : en grammes quand on la connaît, sinon en nombre d'unités. */
export function lineQuantity(line: ReceiptLine, ing?: Ingredient): { grams: number | null; pieces: number | null } {
  if (line.weightKg) return { grams: line.weightKg * 1000, pieces: null };
  const factor = TO_GRAMS[line.sizeUnit];
  if (line.size && factor) {
    const density = line.sizeUnit === 'l' || line.sizeUnit === 'cl' || line.sizeUnit === 'ml' ? (ing?.density ?? 1) : 1;
    return { grams: line.count * line.size * factor * density, pieces: null };
  }
  const pieces = line.sizeUnit === 'pc' && line.size ? line.count * line.size : line.count;
  return { grams: ing?.pieceG ? pieces * ing.pieceG : null, pieces };
}

/** Prix au kilo (ou au litre) payé, si on peut le calculer. */
export function linePricePerKg(line: ReceiptLine, ing?: Ingredient): number | null {
  const { grams } = lineQuantity(line, ing);
  return grams && grams > 0 && line.totalPrice > 0 ? line.totalPrice / (grams / 1000) : null;
}

/** Quantité à ranger au frigo, dans l'unité naturelle du produit. */
export function fridgeQuantity(line: ReceiptLine, ing: Ingredient): number {
  const { grams, pieces } = lineQuantity(line, ing);
  if (ing.unit === 'pc') return pieces ?? (grams ? Math.max(1, Math.round(gramsToBase(ing, grams))) : line.count);
  if (grams) return Math.round(gramsToBase(ing, grams));
  // Taille inconnue : une unité "standard" par article.
  return Math.round(line.count * (ing.unit === 'ml' ? 1000 : gramsToBase(ing, baseToGrams(ing, 500))));
}

// ---------- Observations de prix (tirées des tickets validés) ----------

export interface PriceObservation {
  productId: string;
  storeKey: string;
  chainId: string;
  country: string;
  date: string;
  pricePerKg: number | null;
  /** Prix payé pour une unité (quand le poids est inconnu). */
  unitPrice: number;
  label: string;
  receiptId: string;
}

export function observationsFromReceipts(receipts: Receipt[]): PriceObservation[] {
  const out: PriceObservation[] = [];
  for (const r of receipts) {
    for (const l of r.lines) {
      if (!l.productId || !(l.totalPrice > 0)) continue;
      const ing = getIngredient(l.productId);
      const { pieces } = lineQuantity(l, ing);
      out.push({
        productId: l.productId,
        storeKey: r.storeKey,
        chainId: r.chainId,
        country: r.country,
        date: r.date,
        pricePerKg: linePricePerKg(l, ing),
        unitPrice: l.totalPrice / Math.max(1, pieces ?? l.count),
        label: l.label,
        receiptId: r.id,
      });
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// ---------- Brouillon de ticket à partir de la lecture par photo ----------

export interface ApiReceipt {
  storeName: string;
  storeAddress: string;
  date: string;
  total: number | null;
  lines: { label: string; count: number; size: number | null; sizeUnit: SizeUnit; weightKg: number | null; unitPrice: number | null; totalPrice: number }[];
}

export interface ReceiptDraft {
  receipt: Receipt;
  /** Magasin à créer si le ticket vient d'un magasin pas encore enregistré. */
  newStore?: ChosenStore;
}

/** Rapproche le magasin du ticket de nos magasins, sinon prépare un nouveau magasin. */
export function matchReceiptStore(storeName: string, address: string, stores: ChosenStore[], country: string): { store?: ChosenStore; newStore?: ChosenStore } {
  const chain = matchChain(storeName, country);
  const n = normalize(`${storeName} ${address}`);
  const sameChain = stores.filter((s) => chain && s.chainId === chain.id);
  // Un magasin précis dont le nom ou l'adresse apparaît sur le ticket, sinon le seul magasin de l'enseigne.
  const precise = sameChain.find((s) => s.label && normalize(s.label).split(' ').filter((w) => w.length > 3).some((w) => n.includes(w) && !normalize(chain!.name).includes(w)));
  if (precise) return { store: precise };
  if (sameChain.length === 1) return { store: sameChain[0] };
  if (!chain) return {};
  return {
    newStore: { id: uid('st-'), chainId: chain.id, label: storeName.trim() || chain.name, address: address || undefined, source: 'receipt' },
  };
}

/** Produit d'un libellé de ticket : d'abord ce que tu as appris à l'appli, puis tes produits, puis le dictionnaire. */
export function productForLabel(label: string, memory: Record<string, string> = {}): string | undefined {
  const remembered = memory[labelKey(label)];
  if (remembered && getIngredient(remembered)) return remembered;
  return matchCustom(label) ?? matchIngredient(label);
}

export function draftFromApi(api: ApiReceipt, stores: ChosenStore[], country: string, memory: Record<string, string> = {}): ReceiptDraft {
  const { store, newStore } = matchReceiptStore(api.storeName, api.storeAddress, stores, country);
  const target = store ?? newStore;
  const lines: ReceiptLine[] = api.lines.map((l) => {
    const fromLabel = !l.size && !l.weightKg ? sizeFromLabel(l.label) : null;
    const productId = productForLabel(l.label, memory);
    return {
      id: uid('ln-'),
      label: l.label,
      productId,
      count: l.count > 0 ? l.count : 1,
      size: fromLabel?.size ?? l.size,
      sizeUnit: fromLabel?.sizeUnit ?? l.sizeUnit,
      weightKg: l.weightKg,
      totalPrice: Math.round(l.totalPrice * 100) / 100,
      toFridge: !!productId,
    };
  });
  const chainId = target?.chainId ?? '';
  return {
    newStore,
    receipt: {
      id: uid('rc-'),
      storeKey: target ? storeKey(target) : '',
      chainId,
      country: getChain(chainId)?.country ?? country,
      date: /^\d{4}-\d{2}-\d{2}$/.test(api.date) ? api.date : new Date().toISOString().slice(0, 10),
      total: api.total,
      lines,
      createdAt: Date.now(),
    },
  };
}

/** Envoie les photos du ticket au serveur (lecture par Claude). */
export async function readReceiptPhotos(images: { mediaType: string; data: string }[]): Promise<ApiReceipt> {
  const res = await fetch('/api/receipt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ images }),
  });
  const data = await res.json().catch(() => ({ error: 'Réponse invalide du serveur.' }));
  if (!res.ok || data.error) throw new Error(data.error ?? `Erreur ${res.status}`);
  return data.receipt as ApiReceipt;
}
