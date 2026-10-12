import { useEffect, useState } from 'react';
import { go } from '../router';
import { useApp } from '../state';
import { toast } from '../lib/toast';
import { getIngredient } from '../data/ingredients';
import { BarcodeSheet } from './BarcodeSheet';
import { Sheet } from './ui';

/** Bouton « + » présent sur tous les onglets : les ajouts les plus courants en un geste. */
export function QuickAdd() {
  const { state, actions } = useApp();
  const [open, setOpen] = useState(false);
  const [barcode, setBarcode] = useState(false);
  // Changement d'écran : la feuille se referme.
  useEffect(() => {
    const close = () => setOpen(false);
    window.addEventListener('hashchange', close);
    return () => window.removeEventListener('hashchange', close);
  }, []);
  const item = (emoji: string, label: string, hint: string, run: () => void) => (
    <button className="choice-card row gap" onClick={() => { setOpen(false); run(); }}>
      <span className="quick-emoji" aria-hidden>{emoji}</span>
      <span className="grow">
        <b>{label}</b>
        <span className="small muted block">{hint}</span>
      </span>
    </button>
  );
  return (
    <>
      <button className="fab" onClick={() => setOpen(true)} aria-label="Ajouter">＋</button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Ajouter">
        <div className="new-product">
          {item('▥', 'Scanner un produit', 'Code-barres : frigo, fiche, prix', () => setBarcode(true))}
          {item('🧊', 'Ajouter au frigo', 'Chercher un aliment', () => go('/fridge'))}
          {item('🧾', 'Scanner un ticket', 'Prix et articles d’un coup', () => go('/receipt'))}
          {item('⚡', 'Relevé de prix en rafale', 'En rayon : scan → prix → suivant', () => go('/scan'))}
          {item('📥', 'Importer une recette', 'Lien, photo d’un livre', () => go('/import'))}
        </div>
      </Sheet>
      <BarcodeSheet
        open={barcode}
        onClose={() => setBarcode(false)}
        onAdd={(id, q) => {
          const before = state.fridge;
          actions.addFridge(id, q);
          toast(`${getIngredient(id)?.name ?? 'Produit'} ajouté au frigo`, () => actions.restore({ fridge: before }));
        }}
        onOpenProduct={(id) => go(`/product/${encodeURIComponent(id)}`)}
      />
    </>
  );
}
