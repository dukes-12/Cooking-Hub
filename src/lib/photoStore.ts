import { useEffect, useState, useSyncExternalStore } from 'react';

/** Photos prises dans l'appli (recettes, produits), réduites et gardées sur l'appareil dans IndexedDB. */
export type PhotoKind = 'recipes' | 'products';

const DB = 'cooking-hub-photos';
let version = 0;
const listeners = new Set<() => void>();
const urls = new Map<string, string | null>();

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 2);
    req.onupgradeneeded = () => {
      for (const s of ['recipes', 'products']) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(store: PhotoKind, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const req = fn(d.transaction(store, mode).objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function changed(key: string) {
  const old = urls.get(key);
  if (old) URL.revokeObjectURL(old);
  urls.delete(key);
  version++;
  listeners.forEach((l) => l());
}

/** Réduit la photo (1200 px, JPEG). */
export async function shrinkToBlob(file: Blob, maxEdge = 1200): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Photo illisible'))), 'image/jpeg', 0.85));
}

export async function savePhoto(store: PhotoKind, id: string, file: Blob): Promise<void> {
  const blob = await shrinkToBlob(file);
  await tx(store, 'readwrite', (s) => s.put(blob, id));
  changed(`${store}/${id}`);
}

export async function deletePhoto(store: PhotoKind, id: string): Promise<void> {
  await tx(store, 'readwrite', (s) => s.delete(id));
  changed(`${store}/${id}`);
}

export async function photoUrl(store: PhotoKind, id: string): Promise<string | null> {
  const key = `${store}/${id}`;
  if (urls.has(key)) return urls.get(key)!;
  try {
    const blob = await tx<Blob | undefined>(store, 'readonly', (s) => s.get(id));
    const url = blob ? URL.createObjectURL(blob) : null;
    urls.set(key, url);
    return url;
  } catch {
    return null; // IndexedDB indisponible (navigation privée…)
  }
}

/** Re-rendu quand une photo est ajoutée ou retirée. */
export function usePhotoVersion(): number {
  return useSyncExternalStore(
    (cb) => (listeners.add(cb), () => listeners.delete(cb)),
    () => version,
  );
}

/** Ma photo d'un produit ou d'une recette (ou null). */
export function useMyPhoto(store: PhotoKind, id: string | undefined): string | null {
  const v = usePhotoVersion();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!id) return setUrl(null);
    photoUrl(store, id).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [store, id, v]);
  return url;
}
