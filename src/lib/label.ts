import { shrinkPhoto } from './importer';

/** Ce que l'on lit sur l'emballage d'un produit (valeurs pour 100 g ou 100 ml). */
export interface PackLabel {
  name: string | null;
  brand: string | null;
  quantity: number | null;
  quantityUnit: 'g' | 'ml' | 'pc' | 'none';
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  barcode: string | null;
}

/** Lit le nom, le contenu et le tableau nutritionnel sur 1 à 4 photos de l'emballage. */
export async function readPackLabel(files: Blob[]): Promise<PackLabel> {
  const images = await Promise.all(files.slice(0, 4).map((f) => shrinkPhoto(f as File)));
  const res = await fetch('/api/label', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ images }) });
  const data = await res.json().catch(() => ({ error: 'Réponse invalide du serveur.' }));
  if (!res.ok || data.error) throw new Error(data.error ?? `Erreur ${res.status}`);
  return data.label as PackLabel;
}
