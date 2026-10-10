import { useCommunityPrices } from '../lib/openprices';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StoreMap, type MapPoint } from '../components/StoreMap';
import { Empty } from '../components/ui';
import { getChain } from '../data/reference';
import { findNearbyStores, fmtDistance, geocodePlace, getPosition, type NearbyStore } from '../lib/geo';
import { costOf, fmtMoney } from '../lib/pricing';
import { mapsLink, REFERENCE_BASKET, storeKey, storeTitle } from '../lib/stores';
import { uid } from '../lib/text';
import { go } from '../router';
import { useApp } from '../state';
import type { ChosenStore } from '../types';

type Tab = 'mine' | 'map' | 'compare';

/** Prix du panier type dans une enseigne (relevés de tickets prioritaires, sinon estimation). */
export function basketTotal(chainId: string, country: string): number {
  return REFERENCE_BASKET.reduce((s, b) => s + (costOf(b.id, b.grams, chainId, country) ?? 0), 0);
}

export function Stores() {
  useCommunityPrices(); // le panier type se met à jour quand les prix Open Prices arrivent
  const { state } = useApp();
  const [tab, setTab] = useState<Tab>(state.profile.stores.length ? 'mine' : 'map');
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
        <button className={tab === 'mine' ? 'is-active' : ''} onClick={() => setTab('mine')}>Mes magasins</button>
        <button className={tab === 'map' ? 'is-active' : ''} onClick={() => setTab('map')}>Carte</button>
        <button className={tab === 'compare' ? 'is-active' : ''} onClick={() => setTab('compare')}>Comparer</button>
      </div>
      {tab === 'mine' && <MyStores onMap={() => setTab('map')} />}
      {tab === 'map' && <MapTab />}
      {tab === 'compare' && <Compare />}
    </div>
  );
}

function MyStores({ onMap }: { onMap: () => void }) {
  const { state, observations } = useApp();
  const { stores, country } = state.profile;
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

function Compare() {
  const { state, observations } = useApp();
  const { stores, country } = state.profile;
  const rows = stores
    .map((s) => {
      const chain = getChain(s.chainId)!;
      const c = chain?.country ?? country;
      return { s, chain, total: basketTotal(s.chainId, c), country: c, observed: observations.filter((o) => o.storeKey === storeKey(s)).length };
    })
    .filter((r) => r.chain)
    .sort((a, b) => a.total - b.total);
  if (!rows.length) return <Empty emoji="⚖️" title="Rien à comparer">Ajoute au moins deux magasins.</Empty>;
  const best = rows[0].total;
  return (
    <>
      <p className="small muted">Panier type de {REFERENCE_BASKET.length} produits courants (œufs, lait, pâtes, poulet, légumes…). Les prix relevés sur tes tickets remplacent les estimations.</p>
      <div className="price-table">
        {rows.map((r, i) => (
          <button key={storeKey(r.s)} className={`price-row ${i === 0 ? 'best' : ''}`} onClick={() => go(`/store/${encodeURIComponent(storeKey(r.s))}`)}>
            <span className="store-dot" style={{ background: r.chain.color }} />
            <span className="grow">
              {storeTitle(r.s)}
              <span className="small muted block">{r.observed ? `${r.observed} prix relevés` : 'estimation'}</span>
            </span>
            <span className="small muted">{i === 0 ? 'le moins cher' : `+${Math.round(((r.total - best) / best) * 100)} %`}</span>
            <b>{fmtMoney(r.total, r.country)}</b>
          </button>
        ))}
      </div>
    </>
  );
}
