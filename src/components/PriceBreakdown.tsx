import { useState } from 'react';
import type { Adapted } from '../lib/adapt';
import { costOf, fmtMoney, pricePerKg, priceSource } from '../lib/pricing';
import { Chip } from './ui';

const SOURCE: Record<string, string> = {
  observed: 'tes tickets',
  online: 'site de l’enseigne',
  community: 'Open Prices',
  estimate: 'estimation',
};

const fmtWeight = (g: number, ml: boolean) => (g >= 1000 ? `${(g / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ${ml ? 'L' : 'kg'}` : `${Math.round(g * 10) / 10} ${ml ? 'ml' : 'g'}`);

/**
 * Détail du prix de la recette, ingrédient par ingrédient : quantité utilisée × prix au kilo (et d'où vient ce prix)
 * = coût, dans l'enseigne choisie (la moins chère par défaut).
 */
export function PriceBreakdown({ a, country }: { a: Adapted; country: string }) {
  const [chainId, setChainId] = useState(a.quote.best?.chain.id ?? '');
  const chains = a.quote.perChain;
  const lines = a.lines.filter((l) => !l.removed);
  let total = 0;
  const rows = lines.map((l) => {
    const id = l.ingredient?.id;
    const ppk = id ? pricePerKg(id, chainId, country) : null;
    const cost = id ? costOf(id, l.grams, chainId, country) : null;
    if (cost != null) total += cost;
    return { l, ppk, cost, source: id ? priceSource(id, chainId, country) : null };
  });

  return (
    <div className="price-breakdown">
      {chains.length > 1 && (
        <div className="chips scroll-x">
          {chains.map((p) => <Chip key={p.chain.id} active={p.chain.id === chainId} onClick={() => setChainId(p.chain.id)}>{p.chain.name}</Chip>)}
        </div>
      )}
      <div className="table-scroll">
        <table className="breakdown-table">
          <thead>
            <tr><th>Ingrédient</th><th>Quantité</th><th>Prix au kilo</th><th>Coût</th></tr>
          </thead>
          <tbody>
            {rows.map(({ l, ppk, cost, source }) => {
              const ml = l.ingredient?.unit === 'ml';
              return (
                <tr key={l.index}>
                  <td>
                    {l.ingredient?.name ?? l.original.name}
                    {(l.fridge === 'full' || l.fridge === 'staple') && <span className="small muted block">{l.fridge === 'full' ? 'déjà au frigo' : 'placard'}</span>}
                  </td>
                  <td>{l.grams != null ? fmtWeight(l.grams, ml) : '—'}{l.ingredient?.pieceG && l.original.unit === 'pc' && l.qty != null ? <span className="small muted block">{l.qty} × {l.ingredient.pieceG} g</span> : null}</td>
                  <td>{ppk != null ? <>{fmtMoney(ppk, country)}/{ml ? 'L' : 'kg'}<span className="small muted block">{source ? SOURCE[source] : ''}</span></> : <span className="muted">pas de prix</span>}</td>
                  <td><b>{cost != null ? fmtMoney(cost, country) : '—'}</b></td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr><td colSpan={3}>Total ({a.servings} pers.)</td><td><b>{fmtMoney(total, country)}</b></td></tr>
            <tr><td colSpan={3} className="muted">Par personne</td><td>{fmtMoney(total / a.servings, country)}</td></tr>
          </tfoot>
        </table>
      </div>
      <p className="small muted">Coût = quantité × prix au kilo (ou au litre). Le prix vient, dans l'ordre : de tes tickets et relevés dans cette enseigne, du site de l'enseigne (relevé chaque semaine), d'Open Prices, sinon d'une estimation (prix moyen du pays ajusté pour l'enseigne). Les pièces sont converties en grammes (poids moyen d'une pièce).</p>
    </div>
  );
}
