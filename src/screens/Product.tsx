import { useEffect, useMemo, useState } from 'react';
import { ExactPrices } from '../components/ExactPrices';
import { ProductForm } from '../components/NewProduct';
import { Chip, Empty, Section, Sheet } from '../components/ui';
import { useMyPhoto } from '../lib/photoStore';
import { lexVariants } from '../lib/canonical';
import { AISLE_LABELS, customIngredients, getIngredient } from '../data/ingredients';
import { CHAINS, getChain, getCountry } from '../data/reference';
import { productImage, type ProductImage } from '../lib/images';
import { entryForProduct, lexName, useLexiconReady } from '../lib/lexicon';
import { fetchCategoryProducts, medianNutrition, offProductUrl, type OffProduct } from '../lib/off';
import { chainProducts, fetchChainHistory, useChainPrices, weekStart } from '../lib/chainprices';
import { PriceHistoryChart, type HistorySeries } from '../components/PriceHistoryChart';
import { categoryFor, communityStats, loadCommunityPrices, useCommunityPrices } from '../lib/openprices';
import { fmtMoney } from '../lib/pricing';
import { dietNotes, highlights, priceUnitLabel, pricesEverywhere, pricesInMyStores, recipesUsing } from '../lib/products';
import { manualItem } from '../lib/shopping';
import { storeTitle } from '../lib/stores';
import { back, go } from '../router';
import { useApp } from '../state';

const OFF_COUNTRY_TAG: Record<string, string> = { FR: 'en:france', PT: 'en:portugal', ES: 'en:spain', BE: 'en:belgium', CH: 'en:switzerland', LU: 'en:luxembourg', CA: 'en:canada', DE: 'en:germany', IT: 'en:italy' };

export function Product({ id }: { id: string }) {
  const { state, actions, recipes, observations } = useApp();
  const lexReady = useLexiconReady();
  const ing = getIngredient(id);
  const entry = entryForProduct(id);
  const [img, setImg] = useState<ProductImage | null>(null);
  const [sort, setSort] = useState<'country' | 'price'>('country');
  const [flash, setFlash] = useState<string | null>(null);
  // Fiche à modifier (mon produit) ou à créer (produit exact rattaché à celui-ci).
  const [editor, setEditor] = useState<'edit' | 'exact' | null>(null);
  const myPhoto = useMyPhoto('products', ing?.custom ? id : undefined);
  const [offProducts, setOffProducts] = useState<OffProduct[]>([]);
  const [online, setOnline] = useState<Record<string, [string, number][]>>({});
  const cv = useCommunityPrices() + useChainPrices();
  // Produits relevés sur les sites des enseignes (produit personnel : ceux de sa famille).
  const siteProducts = useMemo(() => chainProducts(id, state.profile.country, getIngredient(id)?.family), [id, state.profile.country, cv]); // eslint-disable-line react-hooks/exhaustive-deps
  const country = state.profile.country;
  const cat = categoryFor(id);

  // Prix de la communauté (Open Prices) et produits du rayon (Open Food Facts), chargés en arrière-plan.
  useEffect(() => {
    loadCommunityPrices([id], country);
    let alive = true;
    if (cat) fetchCategoryProducts(cat, country).then((list) => alive && setOffProducts(list));
    // Historique des prix en ligne (produit personnel : celui de sa famille).
    fetchChainHistory(getIngredient(id)?.family ?? id, country).then((h) => alive && setOnline(h));
    return () => {
      alive = false;
    };
  }, [id, cat, country]);

  useEffect(() => {
    let alive = true;
    productImage(entry?.w).then((i) => alive && setImg(i));
    return () => {
      alive = false;
    };
  }, [entry?.w]);

  const mine = useMemo(() => pricesInMyStores(id, state.profile, observations), [id, state.profile, observations, cv]);
  // Ton pays en premier, puis les autres dans l'ordre habituel.
  const everywhere = useMemo(() => {
    const all = pricesEverywhere(id);
    return [...all.filter((g) => g.country.code === state.profile.country), ...all.filter((g) => g.country.code !== state.profile.country)];
  }, [id, observations, state.profile.country, cv]); // eslint-disable-line react-hooks/exhaustive-deps
  const flat = useMemo(() => everywhere.flatMap((g) => g.prices).sort((a, b) => a.perKg! - b.perKg!), [everywhere]);
  const used = useMemo(() => recipesUsing(id, recipes), [id, recipes]);
  const history = observations.filter((o) => o.productId === id);
  // Grande famille : tes produits rattachés à celui-ci (ex. sachets d'herbes de différentes marques).
  const variants = customIngredients().filter((c) => c.family === id);
  const community = useMemo(() => communityStats(id, country), [id, country, cv]); // eslint-disable-line react-hooks/exhaustive-deps
  const offNutrition = useMemo(() => medianNutrition(offProducts), [offProducts]);
  // Produits du rayon : ceux vendus dans mon pays d'abord.
  const countryTag = OFF_COUNTRY_TAG[country];
  const isLocal = (p: OffProduct) => !!countryTag && !!p.countries?.includes(countryTag);
  const shelf = useMemo(() => [...offProducts].sort((a, b) => Number(isLocal(b)) - Number(isLocal(a))), [offProducts, country]); // eslint-disable-line react-hooks/exhaustive-deps
  const localCount = shelf.filter(isLocal).length;
  const groupedNames = useMemo(() => (ing && !ing.custom && lexReady ? lexVariants(id, 24) : []), [id, ing, lexReady]);
  // Pas de photo Wikimedia : celle du produit le plus scanné du rayon (Open Food Facts).
  const offImage = offProducts.find((p) => p.image);

  // Évolution des prix : une ligne par enseigne (tes enseignes d'abord, 4 au plus, ordre fixe), tes achats en points.
  const historySeries = useMemo<HistorySeries[]>(() => {
    const mineChains = new Set(state.profile.stores.map((s) => s.chainId));
    const chains = CHAINS.filter((c) => online[c.id]?.length).sort((a, b) => Number(mineChains.has(b.id)) - Number(mineChains.has(a.id))).slice(0, 4);
    const out: HistorySeries[] = chains.map((c, i) => ({ key: c.id, label: c.name, slot: i + 1, kind: 'line', points: online[c.id].map(([w, v]) => ({ t: weekStart(w), v })) }));
    const bought = observations.filter((o) => o.productId === id && o.pricePerKg != null && o.country === country);
    if (bought.length) out.push({ key: 'mine', label: 'Mes achats', slot: 5, kind: 'dots', points: bought.map((o) => ({ t: new Date(o.date).getTime(), v: o.pricePerKg! })).sort((a, b) => a.t - b.t) });
    return out;
  }, [online, observations, id, country, state.profile.stores]);

  if (!ing) {
    return (
      <div className="screen">
        <Empty emoji="🤷" title="Produit introuvable">
          <button className="btn btn-primary" onClick={() => back()}>Retour</button>
        </Empty>
      </div>
    );
  }
  const unit = priceUnitLabel(ing);
  const aisle = AISLE_LABELS[ing.aisle];
  const best = mine.find((p) => p.perKg != null);
  const notes = dietNotes(ing);
  const hl = highlights(ing);
  const say = (m: string) => {
    setFlash(m);
    setTimeout(() => setFlash(null), 1500);
  };

  return (
    <div className="screen product">
      <div className="product-hero">
        {myPhoto ? <img src={myPhoto} alt={ing.name} /> : ing.image ? <img src={ing.image} alt={ing.name} className="contain" referrerPolicy="no-referrer" /> : img ? <img src={img.url} alt={ing.name} referrerPolicy="no-referrer" /> : offImage ? <img src={offImage.image!} alt={ing.name} className="contain" referrerPolicy="no-referrer" /> : <span aria-hidden>{aisle.emoji}</span>}
        <button className="icon-btn glass hero-back" onClick={() => back()} aria-label="Retour">←</button>
      </div>
      {myPhoto ? (
        <span className="small muted credit">Ma photo</span>
      ) : ing.image ? (
        <a className="small muted credit" href={ing.barcode ? offProductUrl(ing.barcode) : ing.image} target="_blank" rel="noreferrer">Photo : Open Food Facts (CC BY-SA)</a>
      ) : img ? (
        <a className="small muted credit" href={img.credit} target="_blank" rel="noreferrer">Photo : Wikimedia Commons</a>
      ) : offImage ? (
        <a className="small muted credit" href={offProductUrl(offImage.code)} target="_blank" rel="noreferrer">Photo : Open Food Facts (CC BY-SA) · {offImage.name}</a>
      ) : null}

      <div>
        <p className="small muted">{aisle.emoji} {aisle.label}</p>
        <h1>{ing.name}</h1>
        {ing.custom && (
          <p className="small">
            <span className="badge badge-good">Mon produit</span>{' '}
            {ing.family && <button className="link" onClick={() => go(`/product/${encodeURIComponent(ing.family!)}`)}>Famille : {getIngredient(ing.family)?.name}</button>}
            {ing.barcode && <span className="muted"> · ▥ {ing.barcode}</span>}
            {ing.packQty ? <span className="muted"> · paquet de {ing.packQty} {ing.unit === 'pc' ? 'pièces' : ing.unit}</span> : null}
          </p>
        )}
        <div className="row gap-sm wrap">
        <button className={`btn btn-sm ${(state.favoriteProducts ?? []).includes(ing.id) ? 'btn-primary' : 'btn-soft'}`} onClick={() => { actions.toggleFavoriteProduct(ing.id); say((state.favoriteProducts ?? []).includes(ing.id) ? 'Retiré des favoris' : 'Ajouté aux favoris ★'); }}>
          {(state.favoriteProducts ?? []).includes(ing.id) ? '★ Favori' : '☆ Favori'}
        </button>
        <button className="btn btn-soft btn-sm" onClick={() => setEditor(ing.custom ? 'edit' : 'exact')}>
          {ing.custom ? '✎ Modifier la fiche (photo, code-barres, nutrition)' : '📸 Ajouter mon produit exact (photo, code-barres, nutrition)'}
        </button>
        </div>
        {entry && <p className="small muted">🇵🇹 {lexName(entry, 'pt')} · 🇬🇧 {lexName(entry, 'en')}</p>}
      </div>

      <div className="card">
        <b>En bref</b>
        <ul className="brief">
          {best?.perKg != null && (
            <li>Le moins cher près de chez toi : <b>{fmtMoney(best.perKg, best.country)}{unit}</b> chez {best.store ? storeTitle(best.store) : best.chain.name}{best.source?.startsWith('observed') ? ' (prix relevé)' : best.source === 'online' ? ' (prix en ligne)' : best.source === 'community' ? ' (Open Prices)' : ' (estimation)'}</li>
          )}
          {hl.map((h) => <li key={h}>{h}</li>)}
          {used.length > 0 && <li>Utilisé dans {used.length} recette{used.length > 1 ? 's' : ''} de l'app</li>}
          {community?.perKg != null && <li>Prix médian relevé par la communauté en {getCountry(country).name} : <b>{fmtMoney(community.perKg, country)}{unit}</b> ({community.count} relevé{community.count > 1 ? 's' : ''})</li>}
          {ing.partial && !community?.perKg && <li className="muted">Pas encore de prix de référence pour ce produit : ajoute un ticket pour enregistrer son prix.</li>}
        </ul>
        {notes.length > 0 && <div className="chips">{notes.map((n) => <span key={n} className="badge badge-warn">{n}</span>)}</div>}
      </div>

      <div className="row gap">
        <button className="btn btn-soft grow" onClick={() => { actions.addShopping(manualItem(ing.name, ing.id)); say('Ajouté aux courses'); }}>🛒 Aux courses</button>
        <button className="btn btn-soft grow" onClick={() => { actions.addFridge(ing.id, ing.packQty ?? (ing.unit === 'pc' ? 1 : 250)); say('Ajouté au frigo'); }}>🧊 Au frigo</button>
      </div>

      {!ing.partial ? (
        <Section title={`Pour 100 ${ing.unit === 'ml' ? 'ml' : 'g'}`}>
          <div className="stats">
            <div><b>{ing.kcal}</b><span>kcal</span></div>
            <div><b>{ing.protein} g</b><span>protéines</span></div>
            <div><b>{ing.carbs} g</b><span>glucides</span></div>
            <div><b>{ing.fat} g</b><span>lipides</span></div>
          </div>
          {ing.details && (
            <table className="nutri-table">
              <tbody>
                {ing.details.satFat != null && <tr><td>dont acides gras saturés</td><td>{ing.details.satFat} g</td></tr>}
                {ing.details.sugars != null && <tr><td>dont sucres</td><td>{ing.details.sugars} g</td></tr>}
                {ing.details.fiber != null && <tr><td>Fibres</td><td>{ing.details.fiber} g</td></tr>}
                {ing.details.salt != null && <tr><td>Sel</td><td>{ing.details.salt} g</td></tr>}
              </tbody>
            </table>
          )}
          {(ing.nutriscore || ing.nova) && (
            <p className="row gap small">
              {ing.nutriscore && <span className="row gap-sm">Nutri-Score <span className={`nutriscore ns-${ing.nutriscore}`}>{ing.nutriscore.toUpperCase()}</span></span>}
              {ing.nova && <span className="badge">NOVA {ing.nova}{ing.nova === 4 ? ' · ultra-transformé' : ing.nova === 1 ? ' · brut' : ''}</span>}
            </p>
          )}
        </Section>
      ) : offNutrition ? (
        <Section title="Pour 100 g (moyenne)">
          <div className="stats">
            <div><b>{offNutrition.kcal}</b><span>kcal</span></div>
            <div><b>{offNutrition.protein} g</b><span>protéines</span></div>
            <div><b>{offNutrition.carbs} g</b><span>glucides</span></div>
            <div><b>{offNutrition.fat} g</b><span>lipides</span></div>
          </div>
          <p className="small muted">Valeurs médianes de {offNutrition.n} produits de ce rayon sur Open Food Facts.</p>
        </Section>
      ) : null}

      <ExactPrices ing={ing} onSaved={say} />

      {siteProducts.length > 0 && (
        <Section title="Sur les sites des enseignes">
          {siteProducts.map(({ chainId, price }) => {
            const chain = getChain(chainId);
            return (
              <div key={chainId} className="site-products">
                <div className="row between">
                  <b className="row gap-sm"><span className="store-dot" style={{ background: chain?.color }} />{chain?.name ?? chainId}</b>
                  <span className="small muted">médiane {fmtMoney(price.perKg, country)}{unit}{price.stale ? ' · semaine passée' : ''}</span>
                </div>
                <div className="price-table">
                  {price.items!.map((it) => (
                    <a key={it.url} className="price-row" href={it.url} target="_blank" rel="noreferrer">
                      <span className="grow">{it.name}<span className="small muted block">{new URL(it.url).hostname.replace(/^www\./, '')} ↗</span></span>
                      <b className="nowrap">{fmtMoney(it.perKg, country)}{unit}</b>
                    </a>
                  ))}
                </div>
              </div>
            );
          })}
          <p className="small muted">Produits relevés chaque semaine sur les sites des enseignes (prix au kilo ou au litre). Touche un produit pour ouvrir sa page.</p>
        </Section>
      )}

      <Section title="Dans mes magasins">
        {mine.length ? (
          <div className="price-table">
            {mine.map((p, i) => (
              <div key={i} className={`price-row ${i === 0 && p.perKg != null ? 'best' : ''}`}>
                <span className="store-dot" style={{ background: p.chain.color }} />
                <span className="grow">
                  {p.store ? storeTitle(p.store) : p.chain.name}
                  <span className="small muted block">
                    {p.source === 'observed-store' ? `relevé ici · ${p.count} fois, dernier le ${new Date(p.lastDate!).toLocaleDateString('fr-FR')}` : p.source === 'observed' ? `relevé chez ${p.chain.name}` : p.source === 'online' ? 'prix en ligne de l’enseigne (relevé hebdo)' : p.source === 'community' ? 'Open Prices (communauté)' : p.source === 'estimate' ? 'estimation' : 'pas de prix'}
                  </span>
                </span>
                <b>{p.perKg != null ? `${fmtMoney(p.perKg, p.country)}${unit}` : '—'}</b>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted small">Ajoute tes magasins dans l'onglet Magasins.</p>
        )}
      </Section>

      <Section
        title="Ailleurs"
        action={
          <div className="chips">
            <Chip active={sort === 'country'} onClick={() => setSort('country')}>Par pays</Chip>
            <Chip active={sort === 'price'} onClick={() => setSort('price')}>Par prix</Chip>
          </div>
        }
      >
        {flat.length === 0 ? (
          <p className="muted small">Pas de prix connu pour ce produit.</p>
        ) : sort === 'country' ? (
          everywhere.map((g) => (
            <div key={g.country.code} className="price-table">
              <p className="small"><b>{g.country.flag} {g.country.name}</b></p>
              {g.prices.map((p) => (
                <div key={p.chain.id} className="price-row">
                  <span className="store-dot" style={{ background: p.chain.color }} />
                  <span className="grow">{p.chain.name}{p.source === 'observed' && <span className="badge badge-good">relevé</span>}{p.source === 'online' && <span className="badge badge-good">en ligne</span>}{p.source === 'community' && <span className="badge badge-good">Open Prices</span>}</span>
                  <b>{fmtMoney(p.perKg, p.country)}{unit}</b>
                </div>
              ))}
            </div>
          ))
        ) : (
          <div className="price-table">
            {flat.map((p) => (
              <div key={p.chain.id} className="price-row">
                <span className="store-dot" style={{ background: p.chain.color }} />
                <span className="grow">{p.chain.name} <span className="small muted">{getCountry(p.country).flag}</span></span>
                <b>{fmtMoney(p.perKg, p.country)}{unit}</b>
              </div>
            ))}
          </div>
        )}
        <p className="small muted">Prix dans la devise de chaque pays ; estimations sauf mention « relevé » (tes tickets), « en ligne » (site de l’enseigne, relevé chaque semaine) ou « Open Prices » (communauté).</p>
      </Section>

      {historySeries.some((s) => s.points.length) && (
        <Section title="Évolution des prix">
          <PriceHistoryChart series={historySeries} unit={unit} format={(v) => fmtMoney(v, country)} />
          <p className="small muted">Prix en ligne des enseignes relevé chaque semaine{historySeries.some((s) => s.key === 'mine') ? ', et prix payés sur tes tickets' : ''} ({unit.replace('/', 'par ')}).</p>
        </Section>
      )}

      <Section title="Prix de la communauté">
        {community ? (
          <>
            <div className="price-table">
              {community.byChain.map((c) => {
                const chain = getChain(c.chainId)!;
                return (
                  <div key={c.chainId} className="price-row">
                    <span className="store-dot" style={{ background: chain.color }} />
                    <span className="grow">{chain.name}<span className="small muted block">{c.count} relevé{c.count > 1 ? 's' : ''}</span></span>
                    <b>{fmtMoney(c.perKg, country)}{unit}</b>
                  </div>
                );
              })}
              <div className="price-row">
                <span className="grow">Médiane {getCountry(country).flag} {getCountry(country).name}<span className="small muted block">{community.count} relevé{community.count > 1 ? 's' : ''} sur 12 mois{community.lastDate ? `, dernier le ${new Date(community.lastDate).toLocaleDateString('fr-FR')}` : ''}</span></span>
                <b>{community.perKg != null ? `${fmtMoney(community.perKg, country)}${unit}` : community.unit != null ? `${fmtMoney(community.unit, country)}/u.` : '—'}</b>
              </div>
            </div>
          </>
        ) : (
          <p className="muted small">{cat ? 'Aucun prix relevé récemment dans ton pays pour ce produit.' : 'Ce produit n’est pas encore rattaché à une catégorie Open Food Facts.'}</p>
        )}
        <p className="small muted">
          Données <a className="link" href="https://prices.openfoodfacts.org" target="_blank" rel="noreferrer">Open Prices</a> (Open Food Facts, licence ODbL) : prix relevés en magasin par des bénévoles. Tes tickets restent prioritaires.
        </p>
      </Section>

      {groupedNames.length > 0 && (
        <Section title="Regroupés sous ce produit">
          <div className="chips">{groupedNames.map((n) => <span key={n} className="badge">{n}</span>)}</div>
          <p className="small muted">Ces variantes comptent comme « {ing.name} » : au frigo, dans les recettes et sur la liste de courses.</p>
        </Section>
      )}

      {offProducts.length > 0 && (
        <Section title={`Produits de ce type${localCount ? ` · ${getCountry(country).name} d’abord` : ''}`}>
          <div className="off-list">
            {shelf.slice(0, 8).map((p) => (
              <a key={p.code} className="off-item" href={offProductUrl(p.code)} target="_blank" rel="noreferrer">
                {p.image ? <img src={p.image} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="off-noimg">{aisle.emoji}</span>}
                <span className="grow">
                  <b>{p.name}</b>
                  <span className="small muted block">{[p.brands.split(',')[0], p.quantity].filter(Boolean).join(' · ')}{isLocal(p) ? ' · vendu dans ton pays' : ''}</span>
                </span>
                {p.nutriscore && <span className={`nutriscore ns-${p.nutriscore}`}>{p.nutriscore.toUpperCase()}</span>}
              </a>
            ))}
          </div>
          <p className="small muted">Produits les plus scannés sur Open Food Facts (licence ODbL, photos CC BY-SA).</p>
        </Section>
      )}

      {history.length > 0 && (
        <Section title="Historique de mes achats">
          <div className="price-table">
            {history.slice(0, 12).map((o, i) => (
              <div key={i} className="price-row">
                <span className="grow">
                  {new Date(o.date).toLocaleDateString('fr-FR')}
                  <span className="small muted block">{o.label}</span>
                </span>
                <b>{o.pricePerKg != null ? `${fmtMoney(o.pricePerKg, o.country)}${unit}` : `${fmtMoney(o.unitPrice, o.country)}/u.`}</b>
              </div>
            ))}
          </div>
        </Section>
      )}

      {variants.length > 0 && (
        <Section title="Mes produits de cette famille">
          <div className="price-table">
            {variants.map((v) => {
              const obs = observations.filter((o) => o.productId === v.id);
              return (
                <button key={v.id} className="price-row" onClick={() => go(`/product/${encodeURIComponent(v.id)}`)}>
                  <span className="grow">{v.name}<span className="small muted block">{obs.length ? `${obs.length} achat${obs.length > 1 ? 's' : ''}` : 'pas encore acheté'}</span></span>
                  <b>{obs[0] ? (obs[0].pricePerKg != null ? `${fmtMoney(obs[0].pricePerKg, obs[0].country)}${unit}` : `${fmtMoney(obs[0].unitPrice, obs[0].country)}/u.`) : '›'}</b>
                </button>
              );
            })}
          </div>
        </Section>
      )}

      {ing.custom && (
        <button className="btn btn-ghost danger-text" onClick={() => { if (confirm(`Supprimer « ${ing.name} » de tes produits ? Il sera retiré du frigo ; les tickets gardent leurs lignes.`)) { actions.deleteCustomProduct(ing.id); back('/stores'); } }}>
          Supprimer ce produit
        </button>
      )}

      {used.length > 0 && (
        <Section title="Recettes avec ce produit">
          <div className="chips">{used.slice(0, 10).map((r) => <Chip key={r.id} onClick={() => go(`/recipe/${r.id}`)}>{r.emoji} {r.title}</Chip>)}</div>
        </Section>
      )}
      <Sheet open={editor != null} onClose={() => setEditor(null)} title={editor === 'edit' ? 'Modifier la fiche' : 'Mon produit exact'}>
        {editor && (
          <ProductForm
            editing={editor === 'edit' ? ing : undefined}
            seed={editor === 'exact' ? { familyId: ing.id } : undefined}
            onCancel={() => setEditor(null)}
            onDone={(saved) => {
              setEditor(null);
              if (saved.id !== id) go(`/product/${encodeURIComponent(saved.id)}`);
              else say('Fiche enregistrée');
            }}
          />
        )}
      </Sheet>
      {flash && <div className="toast">{flash}</div>}
    </div>
  );
}
