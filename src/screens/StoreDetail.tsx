import { useMemo, useState } from 'react';
import { Empty, Section } from '../components/ui';
import { getIngredient } from '../data/ingredients';
import { getChain } from '../data/reference';
import { fmtMoney } from '../lib/pricing';
import { priceUnitLabel } from '../lib/products';
import { median } from '../lib/receipts';
import { findStore, mapsLink, REFERENCE_BASKET, storeTitle } from '../lib/stores';
import { back, go } from '../router';
import { useApp } from '../state';
import { basketTotal } from './Stores';

export function StoreDetail({ storeKey }: { storeKey: string }) {
  const { state, actions, observations } = useApp();
  const store = findStore(state.profile, storeKey);
  const [openTicket, setOpenTicket] = useState<string | null>(null);

  const prices = useMemo(() => {
    const mine = observations.filter((o) => o.storeKey === storeKey);
    const byProduct = new Map<string, typeof mine>();
    for (const o of mine) byProduct.set(o.productId, [...(byProduct.get(o.productId) ?? []), o]);
    return [...byProduct.entries()]
      .map(([id, list]) => {
        const perKg = median(list.filter((o) => o.pricePerKg != null).map((o) => o.pricePerKg!));
        const unit = median(list.map((o) => o.unitPrice));
        return { id, ing: getIngredient(id), perKg, unit, last: list[0].date, n: list.length };
      })
      .sort((a, b) => (a.ing?.name ?? '').localeCompare(b.ing?.name ?? '', 'fr'));
  }, [observations, storeKey]);

  if (!store) {
    return (
      <div className="screen">
        <Empty emoji="🏪" title="Magasin introuvable">
          <button className="btn btn-primary" onClick={() => go('/stores')}>Mes magasins</button>
        </Empty>
      </div>
    );
  }
  const chain = getChain(store.chainId);
  const country = chain?.country ?? state.profile.country;
  const tickets = state.receipts.filter((r) => r.storeKey === storeKey);
  const spent = tickets.reduce((s, r) => s + (r.total ?? r.lines.reduce((x, l) => x + l.totalPrice, 0)), 0);

  return (
    <div className="screen">
      <header className="screen-head">
        <button className="icon-btn" onClick={() => back('/stores')} aria-label="Retour">←</button>
        <div className="grow">
          <h1>{storeTitle(store)}</h1>
          <p className="small muted">{[chain?.name, store.address].filter(Boolean).join(' · ')}</p>
        </div>
        <span className="store-badge lg" style={{ background: chain?.color }}>{chain?.name.slice(0, 1)}</span>
      </header>

      <div className="row gap">
        <a className="btn btn-soft grow" href={mapsLink(store)} target="_blank" rel="noreferrer">🗺️ Itinéraire</a>
        <button className="btn btn-primary grow" onClick={() => go(`/receipt/${encodeURIComponent(storeKey)}`)}>🧾 Ajouter un ticket</button>
      </div>

      <div className="stats">
        <div><b>{tickets.length}</b><span>tickets</span></div>
        <div><b>{fmtMoney(spent, country)}</b><span>dépensés</span></div>
        <div><b>{prices.length}</b><span>prix relevés</span></div>
        <div><b>{fmtMoney(basketTotal(store.chainId, country), country)}</b><span>panier type</span></div>
      </div>

      <Section title="Prix relevés ici">
        {prices.length ? (
          <div className="price-table">
            {prices.map((p) => (
              <button key={p.id} className="price-row" onClick={() => go(`/product/${encodeURIComponent(p.id)}`)}>
                <span className="grow">
                  {p.ing?.name ?? p.id}
                  <span className="small muted block">{p.n} relevé{p.n > 1 ? 's' : ''} · dernier le {new Date(p.last).toLocaleDateString('fr-FR')}</span>
                </span>
                <b>{p.perKg != null && p.ing ? `${fmtMoney(p.perKg, country)}${priceUnitLabel(p.ing)}` : `${fmtMoney(p.unit, country)}/u.`}</b>
              </button>
            ))}
          </div>
        ) : (
          <p className="muted small">Aucun prix relevé pour l'instant : ajoute un ticket de caisse de ce magasin. En attendant, les prix affichés dans l'app sont des estimations pour l'enseigne {chain?.name}.</p>
        )}
      </Section>

      <Section title="Tickets">
        {tickets.length ? (
          <div className="list">
            {tickets.map((r) => (
              <div key={r.id} className="card ticket">
                <button className="row between ticket-head" onClick={() => setOpenTicket(openTicket === r.id ? null : r.id)}>
                  <span><b>{new Date(r.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long' })}</b><span className="small muted"> · {r.lines.length} articles</span></span>
                  <b>{fmtMoney(r.total ?? r.lines.reduce((s, l) => s + l.totalPrice, 0), country)}</b>
                </button>
                {openTicket === r.id && (
                  <>
                    {r.lines.map((l) => (
                      <div key={l.id} className="ticket-line small">
                        <span className="grow">{l.productId ? getIngredient(l.productId)?.name : <i className="muted">{l.label}</i>}</span>
                        <span>{fmtMoney(l.totalPrice, country)}</span>
                      </div>
                    ))}
                    <button className="link danger-text small" onClick={() => confirm('Supprimer ce ticket et ses prix ?') && actions.deleteReceipt(r.id)}>Supprimer ce ticket</button>
                  </>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="muted small">Aucun ticket.</p>
        )}
      </Section>

      <p className="small muted">Le panier type compte {REFERENCE_BASKET.length} produits courants ; il sert à comparer les magasins dans l'onglet Comparer.</p>
      <button className="btn btn-ghost btn-block danger-text" onClick={() => { if (confirm('Retirer ce magasin de ta liste ? Ses tickets sont conservés.')) { actions.removeStore(storeKey); go('/stores'); } }}>
        Retirer ce magasin
      </button>
    </div>
  );
}
