import { useEffect, useMemo, useState } from 'react';
import { Chip, Empty, Section } from '../components/ui';
import { AISLE_LABELS, getIngredient } from '../data/ingredients';
import { getCountry } from '../data/reference';
import { productImage, type ProductImage } from '../lib/images';
import { entryForProduct, lexName, useLexiconReady } from '../lib/lexicon';
import { fmtMoney } from '../lib/pricing';
import { dietNotes, highlights, priceUnitLabel, pricesEverywhere, pricesInMyStores, recipesUsing } from '../lib/products';
import { manualItem } from '../lib/shopping';
import { storeTitle } from '../lib/stores';
import { back, go } from '../router';
import { useApp } from '../state';

export function Product({ id }: { id: string }) {
  const { state, actions, recipes, observations } = useApp();
  useLexiconReady();
  const ing = getIngredient(id);
  const entry = entryForProduct(id);
  const [img, setImg] = useState<ProductImage | null>(null);
  const [sort, setSort] = useState<'country' | 'price'>('country');
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    productImage(entry?.w).then((i) => alive && setImg(i));
    return () => {
      alive = false;
    };
  }, [entry?.w]);

  const mine = useMemo(() => pricesInMyStores(id, state.profile, observations), [id, state.profile, observations]);
  // Ton pays en premier, puis les autres dans l'ordre habituel.
  const everywhere = useMemo(() => {
    const all = pricesEverywhere(id);
    return [...all.filter((g) => g.country.code === state.profile.country), ...all.filter((g) => g.country.code !== state.profile.country)];
  }, [id, observations, state.profile.country]); // eslint-disable-line react-hooks/exhaustive-deps
  const flat = useMemo(() => everywhere.flatMap((g) => g.prices).sort((a, b) => a.perKg! - b.perKg!), [everywhere]);
  const used = useMemo(() => recipesUsing(id, recipes), [id, recipes]);
  const history = observations.filter((o) => o.productId === id);

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
        {img ? <img src={img.url} alt={ing.name} referrerPolicy="no-referrer" /> : <span aria-hidden>{aisle.emoji}</span>}
        <button className="icon-btn glass hero-back" onClick={() => back()} aria-label="Retour">←</button>
      </div>
      {img && <a className="small muted credit" href={img.credit} target="_blank" rel="noreferrer">Photo : Wikimedia Commons</a>}

      <div>
        <p className="small muted">{aisle.emoji} {aisle.label}</p>
        <h1>{ing.name}</h1>
        {entry && <p className="small muted">🇵🇹 {lexName(entry, 'pt')} · 🇬🇧 {lexName(entry, 'en')}</p>}
      </div>

      <div className="card">
        <b>En bref</b>
        <ul className="brief">
          {best?.perKg != null && (
            <li>Le moins cher près de chez toi : <b>{fmtMoney(best.perKg, best.country)}{unit}</b> chez {best.store ? storeTitle(best.store) : best.chain.name}{best.source?.startsWith('observed') ? ' (prix relevé)' : ' (estimation)'}</li>
          )}
          {hl.map((h) => <li key={h}>{h}</li>)}
          {used.length > 0 && <li>Utilisé dans {used.length} recette{used.length > 1 ? 's' : ''} de l'app</li>}
          {ing.partial && <li className="muted">Pas encore de valeurs nutritionnelles ni de prix de référence pour ce produit : ajoute un ticket pour enregistrer son prix.</li>}
        </ul>
        {notes.length > 0 && <div className="chips">{notes.map((n) => <span key={n} className="badge badge-warn">{n}</span>)}</div>}
      </div>

      <div className="row gap">
        <button className="btn btn-soft grow" onClick={() => { actions.addShopping(manualItem(ing.name, ing.id)); say('Ajouté aux courses'); }}>🛒 Aux courses</button>
        <button className="btn btn-soft grow" onClick={() => { actions.addFridge(ing.id, ing.unit === 'pc' ? 1 : 250); say('Ajouté au frigo'); }}>🧊 Au frigo</button>
      </div>

      {!ing.partial && (
        <Section title="Pour 100 g">
          <div className="stats">
            <div><b>{ing.kcal}</b><span>kcal</span></div>
            <div><b>{ing.protein} g</b><span>protéines</span></div>
            <div><b>{ing.carbs} g</b><span>glucides</span></div>
            <div><b>{ing.fat} g</b><span>lipides</span></div>
          </div>
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
                    {p.source === 'observed-store' ? `relevé ici · ${p.count} fois, dernier le ${new Date(p.lastDate!).toLocaleDateString('fr-FR')}` : p.source === 'observed' ? `relevé chez ${p.chain.name}` : p.source === 'estimate' ? 'estimation' : 'pas de prix'}
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
                  <span className="grow">{p.chain.name}{p.source === 'observed' && <span className="badge badge-good">relevé</span>}</span>
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
        <p className="small muted">Prix dans la devise de chaque pays ; estimations sauf mention « relevé ».</p>
      </Section>

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

      {used.length > 0 && (
        <Section title="Recettes avec ce produit">
          <div className="chips">{used.slice(0, 10).map((r) => <Chip key={r.id} onClick={() => go(`/recipe/${r.id}`)}>{r.emoji} {r.title}</Chip>)}</div>
        </Section>
      )}
      {flash && <div className="toast">{flash}</div>}
    </div>
  );
}
