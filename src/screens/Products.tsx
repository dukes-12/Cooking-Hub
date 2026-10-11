import { useEffect, useMemo, useState } from 'react';
import { Chip, Empty } from '../components/ui';
import { AISLE_LABELS, customIngredients, INGREDIENTS } from '../data/ingredients';
import { useChainPrices } from '../lib/chainprices';
import { ingredientFromEntry, searchLexicon, useLexiconReady } from '../lib/lexicon';
import { loadCommunityPrices, useCommunityPrices } from '../lib/openprices';
import { useMyPhoto } from '../lib/photoStore';
import { fmtMoney } from '../lib/pricing';
import { priceUnitLabel, pricesEverywhere, pricesInMyStores, type StorePrice } from '../lib/products';
import { storeTitle } from '../lib/stores';
import { normalize } from '../lib/text';
import { go } from '../router';
import { useApp } from '../state';
import type { Aisle, Ingredient } from '../types';

const SOURCE_LABEL: Record<NonNullable<StorePrice['source']>, string> = {
  'observed-store': 'ticket',
  observed: 'ticket',
  online: 'en ligne',
  community: 'Open Prices',
  estimate: 'estimation',
};

/** Catalogue des produits : meilleur prix dans tes magasins, d'où vient ce prix, et accès à chaque fiche. */
export function Products() {
  const { state, observations } = useApp();
  const lexReady = useLexiconReady();
  const v = useCommunityPrices() + useChainPrices();
  const [q, setQ] = useState('');
  const [aisle, setAisle] = useState<Aisle | 'all'>('all');
  const [sort, setSort] = useState<'name' | 'price' | 'bought'>('name');

  // Prix de la communauté pour les produits du catalogue (chargés en arrière-plan, gardés 3 jours).
  useEffect(() => {
    loadCommunityPrices(INGREDIENTS.map((i) => i.id), state.profile.country);
  }, [state.profile.country]);

  const bought = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of observations) m.set(o.productId, (m.get(o.productId) ?? 0) + 1);
    return m;
  }, [observations]);

  const rows = useMemo(() => {
    const n = normalize(q);
    let list: Ingredient[] = [...customIngredients(), ...INGREDIENTS];
    if (n) {
      list = list.filter((i) => [i.name, ...i.aliases].some((x) => normalize(x).includes(n)));
      // Recherche aussi dans le dictionnaire multilingue (artichaut, alcachofra…).
      const seen = new Set(list.map((i) => i.id));
      if (lexReady) for (const e of searchLexicon(q, 12)) {
        const ing = ingredientFromEntry(e);
        if (!seen.has(ing.id)) list.push(ing), seen.add(ing.id);
      }
    }
    if (aisle !== 'all') list = list.filter((i) => i.aisle === aisle);
    const out = list.map((ing) => {
      // Sans magasin enregistré : le moins cher des enseignes du pays.
      const prices: StorePrice[] = state.profile.stores.length ? pricesInMyStores(ing.id, state.profile, observations) : (pricesEverywhere(ing.id).find((g) => g.country.code === state.profile.country)?.prices ?? []);
      return { ing, best: prices.find((p) => p.perKg != null) ?? null, count: bought.get(ing.id) ?? 0 };
    });
    return out.sort((a, b) =>
      sort === 'price' ? (a.best?.perKg ?? Infinity) - (b.best?.perKg ?? Infinity) : sort === 'bought' ? b.count - a.count || a.ing.name.localeCompare(b.ing.name, 'fr') : a.ing.name.localeCompare(b.ing.name, 'fr'),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, aisle, sort, state.profile, observations, bought, lexReady, v]);

  const aisles = (Object.keys(AISLE_LABELS) as Aisle[]).filter((a) => INGREDIENTS.some((i) => i.aisle === a)).sort((a, b) => AISLE_LABELS[a].order - AISLE_LABELS[b].order);

  return (
    <>
      <div className="search-bar">
        <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher un produit (FR, PT, EN)…" />
      </div>
      <div className="chips scroll-x">
        <Chip active={aisle === 'all'} onClick={() => setAisle('all')}>Tout</Chip>
        {aisles.map((a) => (
          <Chip key={a} active={aisle === a} onClick={() => setAisle(a)}>{AISLE_LABELS[a].emoji} {AISLE_LABELS[a].label}</Chip>
        ))}
      </div>
      <div className="row between small">
        <span className="muted">{rows.length} produit{rows.length > 1 ? 's' : ''} · {state.profile.stores.length ? 'meilleur prix dans tes magasins' : 'meilleur prix des enseignes du pays'}</span>
        <select className="input sort-select" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Trier">
          <option value="name">A → Z</option>
          <option value="price">Prix au kilo</option>
          <option value="bought">Les plus achetés</option>
        </select>
      </div>
      {rows.length === 0 ? (
        <Empty emoji="🔎" title="Aucun produit">Essaie un autre mot, en français, portugais ou anglais.</Empty>
      ) : (
        <div className="price-table product-list">
          {rows.slice(0, 200).map(({ ing, best, count }) => (
            <button key={ing.id} className="price-row" onClick={() => go(`/product/${encodeURIComponent(ing.id)}`)}>
              <ProductThumb ing={ing} />
              <span className="grow">
                {ing.name}
                {ing.custom && <span className="badge badge-good">à moi</span>}
                <span className="small muted block">
                  {best ? `${best.store ? storeTitle(best.store) : best.chain.name} · ${best.source ? SOURCE_LABEL[best.source] : ''}` : 'pas de prix'}
                  {count ? ` · acheté ${count} fois` : ''}
                </span>
              </span>
              <b className="nowrap">{best?.perKg != null ? `${fmtMoney(best.perKg, best.country)}${priceUnitLabel(ing)}` : '—'}</b>
            </button>
          ))}
        </div>
      )}
      {rows.length > 200 && <p className="small muted center">Affine la recherche pour voir les autres produits.</p>}
    </>
  );
}

/** Vignette d'un produit : ma photo ou celle du paquet pour mes produits, sinon l'émoji du rayon. */
function ProductThumb({ ing }: { ing: Ingredient }) {
  const mine = useMyPhoto('products', ing.custom ? ing.id : undefined);
  const src = mine ?? ing.image;
  return <span className="product-emoji" aria-hidden>{src ? <img src={src} alt="" referrerPolicy="no-referrer" /> : AISLE_LABELS[ing.aisle].emoji}</span>;
}
