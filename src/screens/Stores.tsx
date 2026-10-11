import { useChainPrices } from '../lib/chainprices';
import { useCommunityPrices } from '../lib/openprices';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StoreMap, type MapPoint } from '../components/StoreMap';
import { Chip, Empty } from '../components/ui';
import { getIngredient } from '../data/ingredients';
import { basketFromReceipts, compareBasket, compareProducts, referenceBasket, type PriceOrigin } from '../lib/compare';
import { getChain } from '../data/reference';
import { findNearbyStores, fmtDistance, geocodePlace, getPosition, type NearbyStore } from '../lib/geo';
import { costOf, fmtMoney } from '../lib/pricing';
import { mapsLink, REFERENCE_BASKET, storeKey, storeTitle } from '../lib/stores';
import { uid } from '../lib/text';
import { go } from '../router';
import { useApp } from '../state';
import { Products } from './Products';
import { TicketStoreSelect } from './StoreDetail';
import type { ChosenStore } from '../types';

export type Tab = 'mine' | 'map' | 'compare' | 'products';

/** Prix du panier type dans une enseigne (relevés de tickets prioritaires, sinon estimation). */
export function basketTotal(chainId: string, country: string): number {
  return REFERENCE_BASKET.reduce((s, b) => s + (costOf(b.id, b.grams, chainId, country) ?? 0), 0);
}

export function Stores({ initialTab }: { initialTab?: Tab } = {}) {
  useChainPrices();
  useCommunityPrices(); // le panier type se met à jour quand les prix Open Prices arrivent
  const { state } = useApp();
  const [tab, setTab] = useState<Tab>(initialTab ?? (state.profile.stores.length ? 'mine' : 'map'));
  return (
    <div className="screen">
      <header className="screen-head">
        <div>
          <h1>Magasins</h1>
          <p className="small muted">{state.profile.stores.length} magasin{state.profile.stores.length > 1 ? 's' : ''} · {state.receipts.length} ticket{state.receipts.length > 1 ? 's' : ''}</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => go('/receipt')}>🧾 Ajouter un ticket</button>
      </header>
      <div className="segmented">
        <button className={tab === 'mine' ? 'is-active' : ''} onClick={() => setTab('mine')}>Magasins</button>
        <button className={tab === 'map' ? 'is-active' : ''} onClick={() => setTab('map')}>Carte</button>
        <button className={tab === 'compare' ? 'is-active' : ''} onClick={() => setTab('compare')}>Comparer</button>
        <button className={tab === 'products' ? 'is-active' : ''} onClick={() => setTab('products')}>Produits</button>
      </div>
      {tab === 'mine' && <MyStores onMap={() => setTab('map')} />}
      {tab === 'map' && <MapTab />}
      {tab === 'compare' && <Compare />}
      {tab === 'products' && <Products />}
    </div>
  );
}

function MyStores({ onMap }: { onMap: () => void }) {
  const { state, observations, actions } = useApp();
  const { stores, country } = state.profile;
  // Tickets dont le magasin a été supprimé (ou jamais choisi) : à rattacher pour garder leurs prix.
  const orphans = state.receipts.filter((r) => !stores.some((s) => storeKey(s) === r.storeKey));
  const orphanBlock = orphans.length > 0 && (
    <div className="card orphan-tickets">
      <b>🧾 {orphans.length} ticket{orphans.length > 1 ? 's' : ''} sans magasin</b>
      <p className="small muted">Rattache-{orphans.length > 1 ? 'les' : 'le'} à un magasin pour que {orphans.length > 1 ? 'leurs' : 'ses'} prix comptent dans le comparatif.</p>
      {orphans.map((r) => (
        <div key={r.id} className="orphan-row">
          <span className="small">{new Date(r.date).toLocaleDateString('fr-FR')} · {r.lines.length} articles · {fmtMoney(r.total ?? r.lines.reduce((x, l) => x + l.totalPrice, 0), r.country)}</span>
          <TicketStoreSelect value={r.storeKey} onChange={(k) => actions.moveReceipt(r.id, k)} />
        </div>
      ))}
    </div>
  );
  if (!stores.length) {
    return (
      <Empty emoji="🏪" title="Aucun magasin enregistré">
        <p className="muted">Ajoute les magasins où tu fais tes courses depuis la carte, ou en scannant un ticket de caisse.</p>
        <button className="btn btn-primary" onClick={onMap}>Ouvrir la carte</button>
      </Empty>
    );
  }
  return (
    <div className="list">
      {orphanBlock}
      {stores.map((s) => {
        const key = storeKey(s);
        const chain = getChain(s.chainId);
        const tickets = state.receipts.filter((r) => r.storeKey === key);
        const relevés = new Set(observations.filter((o) => o.storeKey === key).map((o) => o.productId)).size;
        return (
          <button key={key} className="store-card" onClick={() => go(`/store/${encodeURIComponent(key)}`)}>
            <span className="store-badge" style={{ background: chain?.color }}>{chain?.name.slice(0, 1)}</span>
            <span className="grow">
              <b>{storeTitle(s)}</b>
              <span className="small muted block">{s.address ?? chain?.name}{s.distanceM ? ` · ${fmtDistance(s.distanceM)}` : ''}</span>
              <span className="small block">
                Panier type ≈ <b>{fmtMoney(basketTotal(s.chainId, chain?.country ?? country), chain?.country ?? country)}</b>
                {relevés ? ` · ${relevés} prix relevé${relevés > 1 ? 's' : ''}` : ''}
                {tickets.length ? ` · ${tickets.length} ticket${tickets.length > 1 ? 's' : ''}` : ''}
              </span>
            </span>
            <span className="muted">›</span>
          </button>
        );
      })}
    </div>
  );
}

function MapTab() {
  const { state, actions } = useApp();
  const { profile } = state;
  // Sans position connue, la carte s'ouvre sur le premier magasin enregistré qui a des coordonnées.
  const firstSaved = profile.stores.find((s) => s.lat != null && s.lon != null);
  const [center, setCenter] = useState(profile.location ?? (firstSaved ? { lat: firstSaved.lat!, lon: firstSaved.lon! } : null));
  const [nearby, setNearby] = useState<NearbyStore[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [city, setCity] = useState(profile.city ?? '');
  const [selected, setSelected] = useState<string | null>(null);

  const search = async (where: () => Promise<{ lat: number; lon: number }>) => {
    setLoading(true);
    setError(null);
    try {
      const pos = await where();
      setCenter({ lat: pos.lat, lon: pos.lon });
      actions.updateProfile({ location: { lat: pos.lat, lon: pos.lon } });
      setSelected(null);
      setNearby(await findNearbyStores(pos, profile.country));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // À l'ouverture de la carte, on cherche tout de suite les magasins autour de la dernière position connue.
  useEffect(() => {
    if (center && !nearby.length) search(async () => center);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isSaved = (n: NearbyStore) =>
    profile.stores.some((s) => s.chainId === n.chain.id && s.lat != null && s.lon != null && Math.abs(s.lat - n.lat) < 0.0015 && Math.abs(s.lon - n.lon) < 0.0015);

  const add = (n: NearbyStore): ChosenStore => {
    const store: ChosenStore = {
      id: uid('st-'), chainId: n.chain.id, label: n.name, address: n.address, lat: n.lat, lon: n.lon, distanceM: Math.round(n.distanceM), source: n.source,
    };
    actions.addStore(store);
    return store;
  };
  const unsaved = useMemo(() => nearby.filter((n) => !isSaved(n)), [nearby, profile.stores]); // eslint-disable-line react-hooks/exhaustive-deps

  const points: MapPoint[] = useMemo(
    () => [
      ...profile.stores.filter((s) => s.lat != null && s.lon != null).map((s) => ({ key: storeKey(s), lat: s.lat!, lon: s.lon!, label: storeTitle(s), color: getChain(s.chainId)?.color ?? '#666', saved: true })),
      ...unsaved.map((n, i) => ({ key: `near:${i}`, lat: n.lat, lon: n.lon, label: `${n.name} · ${fmtDistance(n.distanceM)}`, color: n.chain.color, saved: false })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profile.stores, unsaved],
  );
  const onSelect = useCallback((key: string) => setSelected(key), []);
  const savedSel = selected && !selected.startsWith('near:') ? profile.stores.find((x) => storeKey(x) === selected) : undefined;
  const nearSel = selected?.startsWith('near:') ? unsaved[Number(selected.slice(5))] : undefined;
  const noCoords = profile.stores.filter((x) => x.lat == null).length;

  return (
    <>
      <div className="row gap">
        <button className="btn btn-soft grow" disabled={loading} onClick={() => search(getPosition)}>📍 Autour de moi</button>
      </div>
      <div className="search-bar">
        <input className="input" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ville ou code postal" onKeyDown={(e) => e.key === 'Enter' && city.trim() && search(() => geocodePlace(city.trim(), profile.country))} />
        <button className="btn btn-soft" disabled={!city.trim() || loading} onClick={() => search(() => geocodePlace(city.trim(), profile.country))}>Chercher</button>
      </div>
      {loading && <p className="small muted">Recherche des magasins…</p>}
      {error && <p className="small warn-text">{error}</p>}
      {center ? <StoreMap center={center} points={points} selected={selected} onSelect={onSelect} /> : <p className="muted small">Localise-toi ou cherche une ville pour afficher la carte.</p>}
      {(savedSel || nearSel) && (
        <div className="card map-sheet">
          {savedSel ? (
            <>
              <div className="row between">
                <span><b>{storeTitle(savedSel)}</b><span className="small muted block">{savedSel.address ?? getChain(savedSel.chainId)?.name} · dans mes magasins</span></span>
                <button className="icon-btn sm" onClick={() => setSelected(null)} aria-label="Fermer">✕</button>
              </div>
              <div className="row gap">
                <button className="btn btn-primary grow" onClick={() => go(`/receipt/${encodeURIComponent(selected!)}`)}>🧾 Ajouter un ticket</button>
                <button className="btn btn-soft grow" onClick={() => go(`/store/${encodeURIComponent(selected!)}`)}>Voir les prix</button>
              </div>
              <a className="small link" href={mapsLink(savedSel)} target="_blank" rel="noreferrer">🗺️ Itinéraire dans Google Maps</a>
            </>
          ) : (
            <>
              <div className="row between">
                <span><b>{nearSel!.name}</b><span className="small muted block">{nearSel!.address ?? nearSel!.chain.name} · {fmtDistance(nearSel!.distanceM)}</span></span>
                <button className="icon-btn sm" onClick={() => setSelected(null)} aria-label="Fermer">✕</button>
              </div>
              <div className="row gap">
                <button className="btn btn-primary grow" onClick={() => go(`/receipt/${encodeURIComponent(storeKey(add(nearSel!)))}`)}>🧾 Ajouter un ticket</button>
                <button className="btn btn-soft grow" onClick={() => { add(nearSel!); setSelected(null); }}>＋ Mes magasins</button>
              </div>
              <a className="small link" href={mapsLink({ chainId: nearSel!.chain.id, label: nearSel!.name, address: nearSel!.address, lat: nearSel!.lat, lon: nearSel!.lon })} target="_blank" rel="noreferrer">🗺️ Itinéraire dans Google Maps</a>
            </>
          )}
        </div>
      )}
      {noCoords > 0 && <p className="small muted">{noCoords} de tes magasins n'ont pas d'adresse précise et n'apparaissent donc pas sur la carte : touche un magasin de la carte puis « ＋ Mes magasins » pour ajouter le bon.</p>}
      {unsaved.length === 0 && nearby.length > 0 && <p className="small muted">Tous les magasins trouvés sont déjà dans tes magasins.</p>}
      {nearby.length > 0 && (
        <>
          <p className="small muted">
            {nearby.length} magasins trouvés · Google Maps
          </p>
          <div className="list">
            {nearby.map((n, i) => {
              const saved = isSaved(n);
              return (
                <div key={i} className="store-item">
                  <span className="store-dot" style={{ background: n.chain.color }} />
                  <span className="grow">
                    <b>{n.name}</b>
                    <span className="small muted block">{n.address ?? n.chain.name} · {fmtDistance(n.distanceM)}</span>
                  </span>
                  {saved ? <span className="badge badge-good">Ajouté</span> : <button className="btn btn-soft btn-sm" onClick={() => add(n)}>＋ Ajouter</button>}
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

const ORIGIN_LABEL: Record<PriceOrigin, string> = { store: 'ticket', chain: 'ticket enseigne', online: 'prix en ligne', community: 'Open Prices', estimate: 'estimation' };

function Compare() {
  const { state, observations } = useApp();
  const { stores } = state.profile;
  const mineBasket = useMemo(() => basketFromReceipts(state.receipts), [state.receipts]);
  const [mode, setMode] = useState<'mine' | 'ref' | 'products'>(mineBasket.length ? 'mine' : 'ref');
  const basket = mode === 'mine' ? mineBasket : referenceBasket();
  const result = useMemo(() => compareBasket(stores, basket, observations), [stores, basket, observations]); // eslint-disable-line react-hooks/exhaustive-deps
  const products = useMemo(() => compareProducts(stores, observations), [stores, observations]);

  if (stores.length < 2) return <Empty emoji="⚖️" title="Rien à comparer">Ajoute au moins deux magasins (onglet Carte), puis des tickets.</Empty>;
  const best = result.totals[0]?.total ?? 0;
  const money = (v: number, s: ChosenStore) => fmtMoney(v, getChain(s.chainId)?.country ?? state.profile.country);

  return (
    <>
      <div className="chips">
        <Chip active={mode === 'mine'} onClick={() => setMode('mine')}>🧾 Mon panier</Chip>
        <Chip active={mode === 'ref'} onClick={() => setMode('ref')}>🧺 Panier type</Chip>
        <Chip active={mode === 'products'} onClick={() => setMode('products')}>🔎 Produit par produit</Chip>
      </div>

      {mode !== 'products' ? (
        mode === 'mine' && !mineBasket.length ? (
          <Empty emoji="🧾" title="Pas encore de ticket">Ajoute tes tickets de caisse : ton panier (ce que tu achètes vraiment) sera comparé entre tes magasins.</Empty>
        ) : (
          <>
            <p className="small muted">
              {mode === 'mine'
                ? `Les ${result.items} produits que tu achètes, aux quantités habituelles de tes tickets.`
                : `Panier type de ${REFERENCE_BASKET.length} produits courants.`}{' '}
              Prix de chaque magasin : tes tickets d'abord, puis le prix en ligne de l'enseigne (relevé chaque semaine), Open Prices, sinon estimation.
              {result.skipped > 0 && ` ${result.skipped} produit${result.skipped > 1 ? 's' : ''} sans prix dans tous les magasins ${result.skipped > 1 ? 'sont' : 'est'} laissé${result.skipped > 1 ? 's' : ''} de côté.`}
            </p>
            <div className="price-table">
              {result.totals.map((r, i) => (
                <button key={storeKey(r.store)} className={`price-row ${i === 0 ? 'best' : ''}`} onClick={() => go(`/store/${encodeURIComponent(storeKey(r.store))}`)}>
                  <span className="store-dot" style={{ background: getChain(r.store.chainId)?.color }} />
                  <span className="grow">
                    {storeTitle(r.store)}
                    <span className="small muted block">{r.fromTickets ? `${r.fromTickets}/${r.priced} prix de tes tickets ici` : 'aucun ticket ici : prix estimés'}</span>
                  </span>
                  <span className="small muted">{i === 0 ? 'le moins cher' : `+${money(r.total - best, r.store)}`}</span>
                  <b>{money(r.total, r.store)}</b>
                </button>
              ))}
            </div>
          </>
        )
      ) : products.length === 0 ? (
        <Empty emoji="🔎" title="Pas encore de comparaison">Dès qu'un produit apparaît sur un ticket, il est comparé avec tes autres magasins.</Empty>
      ) : (
        <>
          <p className="small muted">Produits de tes tickets, du plus grand écart de prix au plus petit. « ticket » = prix payé dans ce magasin.</p>
          <div className="list">
            {products.map((p) => {
              const ing = getIngredient(p.productId);
              const unit = ing?.unit === 'ml' ? '/L' : '/kg';
              return (
                <div key={p.productId} className="card compare-card">
                  <button className="row between link-plain" onClick={() => go(`/product/${encodeURIComponent(p.productId)}`)}>
                    <b>{ing?.name ?? p.productId}</b>
                    <span className="small muted">écart {Math.round(p.spread)} %</span>
                  </button>
                  {p.quotes.map((q, i) => (
                    <div key={storeKey(q.store)} className={`compare-line ${i === 0 ? 'best' : ''}`}>
                      <span className="store-dot" style={{ background: getChain(q.store.chainId)?.color }} />
                      <span className="grow">{storeTitle(q.store)} <span className={`badge ${q.quote.origin === 'store' ? 'badge-good' : ''}`}>{ORIGIN_LABEL[q.quote.origin]}</span></span>
                      <b>{money(q.quote.perKg, q.store)}{unit}</b>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
