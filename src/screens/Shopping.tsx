import { useEffect, useMemo, useRef, useState } from 'react';
import { Empty, IngredientPicker } from '../components/ui';
import { getIngredient } from '../data/ingredients';
import { costOf, fmtMoney, quoteBasket } from '../lib/pricing';
import { groupByAisle, manualItem } from '../lib/shopping';
import { baseToGrams, fmtBase } from '../lib/units';
import { go } from '../router';
import { useApp } from '../state';
import type { ShoppingItem } from '../types';

function gramsOf(it: ShoppingItem): number | null {
  const ing = getIngredient(it.ingredientId);
  return ing && it.qty != null ? baseToGrams(ing, it.qty) : null;
}

export function useShoppingQuote() {
  const { state } = useApp();
  return useMemo(() => quoteBasket(state.shopping.map((i) => ({ ingredientId: i.ingredientId, grams: gramsOf(i) })), state.profile), [state.shopping, state.profile]);
}

export function Shopping() {
  const { state, actions } = useApp();
  const quote = useShoppingQuote();
  const groups = groupByAisle(state.shopping);
  const checked = state.shopping.filter((i) => i.checked).length;
  const country = state.profile.country;

  return (
    <div className="screen">
      <header className="screen-head">
        <div>
          <h1>Courses</h1>
          <p className="small muted">{state.shopping.length} article{state.shopping.length > 1 ? 's' : ''}{checked ? ` · ${checked} dans le panier` : ''}</p>
        </div>
        {state.shopping.length > 0 && <button className="btn btn-primary btn-sm" onClick={() => go('/shop-mode')}>🛒 Mode magasin</button>}
      </header>

      {state.menu.length > 0 && (
        <button className="btn btn-soft btn-block" onClick={actions.regenerateShopping}>
          ↻ Mettre à jour depuis le menu ({state.menu.length} recette{state.menu.length > 1 ? 's' : ''}) et le frigo
        </button>
      )}

      <IngredientPicker allowFree onPick={(ing, text) => actions.addShopping(manualItem(ing?.name ?? text, ing?.id))} placeholder="Ajouter un article…" />

      {quote.best && state.shopping.length > 0 && (
        <div className="card store-compare">
          <div className="row between">
            <div>
              <span className="small muted">Meilleure option</span>
              <div className="big">{quote.best.chain.name}</div>
            </div>
            <div className="right">
              <div className="big">{fmtMoney(quote.best.total, country)}</div>
              {quote.perChain.length > 1 && (
                <span className="small good-text">−{fmtMoney(quote.perChain[quote.perChain.length - 1].total - quote.best.total, country)} vs le plus cher</span>
              )}
            </div>
          </div>
          {quote.split && (
            <p className="small">
              💡 En partageant entre <b>{quote.split.chains[0].name}</b> et <b>{quote.split.chains[1].name}</b> : {fmtMoney(quote.split.total, country)} (−{fmtMoney(quote.split.saving, country)})
            </p>
          )}
          <details>
            <summary className="small">Comparer {quote.perChain.length} enseignes</summary>
            {quote.perChain.map((p) => (
              <div key={p.chain.id} className="price-row">
                <span className="store-dot" style={{ background: p.chain.color }} />
                <span className="grow">{p.chain.name}</span>
                <b>{fmtMoney(p.total, country)}</b>
              </div>
            ))}
            <p className="small muted">Prix estimés{quote.unknown ? ` · ${quote.unknown} article(s) libre(s) non chiffré(s)` : ''}.</p>
          </details>
        </div>
      )}

      {state.shopping.length === 0 ? (
        <Empty emoji="🛒" title="Liste vide">
          <p className="muted">Ajoute des recettes à ton menu puis génère la liste : on enlève automatiquement ce que tu as déjà.</p>
          <button className="btn btn-primary" onClick={() => go('/menu')}>Voir mon menu</button>
        </Empty>
      ) : (
        <>
          {groups.map((g) => (
            <section key={g.aisle} className="section">
              <h3 className="aisle-title">{g.emoji} {g.label}</h3>
              <div className="list">
                {g.items.map((it) => <ShoppingRow key={it.key} it={it} chainId={quote.best?.chain.id ?? null} />)}
              </div>
            </section>
          ))}
          {checked > 0 && (
            <div className="row gap">
              <button className="btn btn-soft grow" onClick={actions.storeChecked}>🧊 Ranger les {checked} articles cochés au frigo</button>
              <button className="btn btn-ghost" onClick={actions.clearChecked}>Effacer</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ShoppingRow({ it, chainId, big }: { it: ShoppingItem; chainId: string | null; big?: boolean }) {
  const { state, actions } = useApp();
  const price = costOf(it.ingredientId, gramsOf(it), chainId, state.profile.country);
  return (
    <div className={`shop-item ${it.checked ? 'checked' : ''} ${big ? 'big' : ''}`} onClick={() => actions.toggleShopping(it.key)} role="checkbox" aria-checked={it.checked} tabIndex={0} onKeyDown={(e) => e.key === ' ' && actions.toggleShopping(it.key)}>
      <span className="check">{it.checked ? '✓' : ''}</span>
      <span className="grow">
        <span className="shop-name">{it.name}</span>
        {!big && it.fromRecipes.length > 0 && <span className="small muted block">{it.fromRecipes.join(', ')}</span>}
      </span>
      <span className="shop-qty">{fmtBase(it.qty, it.unit)}</span>
      {!big && <span className="small muted price">{price != null ? fmtMoney(price, state.profile.country) : ''}</span>}
      {!big && (
        <button className="icon-btn sm" onClick={(e) => { e.stopPropagation(); actions.removeShopping(it.key); }} aria-label="Supprimer">✕</button>
      )}
    </div>
  );
}

/** Mode magasin : plein écran, gros boutons, écran maintenu allumé, fonctionne hors-ligne. */
export function ShopMode() {
  const { state, actions } = useApp();
  const quote = useShoppingQuote();
  const [hideDone, setHideDone] = useState(false);
  const wake = useRef<{ release: () => Promise<void> } | null>(null);
  const total = state.shopping.length;
  const done = state.shopping.filter((i) => i.checked).length;

  useEffect(() => {
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request('screen').then((w) => (wake.current = w)).catch(() => undefined);
    return () => void wake.current?.release().catch(() => undefined);
  }, []);

  const items = hideDone ? state.shopping.filter((i) => !i.checked) : state.shopping;
  const groups = groupByAisle(items);

  return (
    <div className="screen shop-mode">
      <header className="shop-head">
        <button className="icon-btn" onClick={() => go('/shopping')} aria-label="Quitter">←</button>
        <div className="grow">
          <b>{done}/{total} articles</b>
          <div className="meter"><div style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => setHideDone(!hideDone)}>{hideDone ? 'Tout voir' : 'Masquer cochés'}</button>
      </header>
      {quote.best && <p className="small muted center">Estimation chez {quote.best.chain.name} : {fmtMoney(quote.best.total, state.profile.country)}</p>}
      {groups.map((g) => (
        <section key={g.aisle}>
          <h3 className="aisle-title">{g.emoji} {g.label}</h3>
          {g.items.map((it) => <ShoppingRow key={it.key} it={it} chainId={null} big />)}
        </section>
      ))}
      {done === total && total > 0 && (
        <div className="card center">
          <h2>Courses terminées 🎉</h2>
          <button className="btn btn-primary btn-block" onClick={() => { actions.storeChecked(); go('/fridge'); }}>Tout ranger dans le frigo</button>
        </div>
      )}
    </div>
  );
}
