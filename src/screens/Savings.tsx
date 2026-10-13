import { useEffect, useMemo } from 'react';
import { Empty, Section } from '../components/ui';
import { getIngredient } from '../data/ingredients';
import { useChainPrices } from '../lib/chainprices';
import { loadCommunityPrices, useCommunityPrices } from '../lib/openprices';
import { fmtMoney } from '../lib/pricing';
import { monthlySavings, receiptSavings, savingsByChain } from '../lib/savings';
import { back, go } from '../router';
import { useApp } from '../state';

const monthLabel = (m: string) => new Date(`${m}-01T12:00:00`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

/** Mes économies : prix payés comparés aux prix habituels (communauté et sites des enseignes) + anti-gaspi. */
export function Savings() {
  const { state } = useApp();
  const country = state.profile.country;
  const v = useCommunityPrices() + useChainPrices();
  useEffect(() => {
    const ids = [...new Set(state.receipts.flatMap((r) => r.lines.map((l) => l.productId)).filter((x): x is string => !!x))];
    loadCommunityPrices(ids, country);
  }, [state.receipts, country]);

  const months = useMemo(() => monthlySavings(state.receipts, state.savedFood), [state.receipts, state.savedFood, v]); // eslint-disable-line react-hooks/exhaustive-deps
  const lines = useMemo(() => receiptSavings(state.receipts), [state.receipts, v]); // eslint-disable-line react-hooks/exhaustive-deps
  const chains = useMemo(() => savingsByChain(state.receipts), [state.receipts, v]); // eslint-disable-line react-hooks/exhaustive-deps
  const thisMonth = new Date().toISOString().slice(0, 7);
  const cur = months.find((m) => m.month === thisMonth);
  const total = months.reduce((s, m) => s + m.saving + m.wasteSaved, 0);
  const best = [...lines].sort((a, b) => b.saving - a.saving).filter((l) => l.saving > 0.05).slice(0, 5);
  const worst = [...lines].sort((a, b) => a.saving - b.saving).filter((l) => l.saving < -0.05).slice(0, 3);
  const money = (x: number) => fmtMoney(x, country);

  return (
    <div className="screen">
      <header className="screen-head">
        <button className="icon-btn" onClick={() => back('/prices')} aria-label="Retour">←</button>
        <div className="grow">
          <h1>Mes économies</h1>
          <p className="small muted">Tes achats comparés aux prix habituels relevés par la communauté</p>
        </div>
      </header>

      {!state.receipts.length && !state.savedFood?.length ? (
        <Empty emoji="💰" title="Pas encore d’économies à afficher">
          <p className="muted">Scanne tes tickets : on compare chaque article au prix habituel dans ton pays. Cuisine ce qui va périmer : on compte ce que tu as sauvé.</p>
          <button className="btn btn-primary" onClick={() => go('/receipt')}>🧾 Scanner un ticket</button>
        </Empty>
      ) : (
        <>
          <div className="card savings-hero">
            <span className="small muted">Ce mois-ci</span>
            <div className="savings-big">{money((cur?.saving ?? 0) + (cur?.wasteSaved ?? 0))}</div>
            <div className="savings-split">
              <div><b>{money(cur?.saving ?? 0)}</b><span className="small muted">en achetant moins cher que le prix habituel</span></div>
              <div><b>{money(cur?.wasteSaved ?? 0)}</b><span className="small muted">{cur?.wasteCount ?? 0} produit{(cur?.wasteCount ?? 0) > 1 ? 's' : ''} sauvé{(cur?.wasteCount ?? 0) > 1 ? 's' : ''} de la poubelle</span></div>
            </div>
            <span className="small muted">Depuis le début : <b>{money(total)}</b></span>
          </div>

          {months.length > 0 && (
            <Section title="Mois par mois">
              <div className="price-table">
                {months.map((m) => (
                  <div key={m.month} className="price-row">
                    <span className="grow">
                      {monthLabel(m.month)}
                      <span className="small muted block">{m.lines ? `${m.lines} article${m.lines > 1 ? 's' : ''} comparé${m.lines > 1 ? 's' : ''} · payé ${money(m.paid)} au lieu de ${money(m.reference)}` : 'aucun article comparé'}{m.wasteCount ? ` · ${m.wasteCount} sauvé${m.wasteCount > 1 ? 's' : ''}` : ''}</span>
                    </span>
                    <b className={m.saving + m.wasteSaved >= 0 ? 'good-text' : 'danger-text'}>{m.saving + m.wasteSaved >= 0 ? '+' : ''}{money(m.saving + m.wasteSaved)}</b>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {chains.length > 1 && (
            <Section title="Selon le magasin">
              <div className="price-table">
                {chains.map((c) => (
                  <div key={c.chainId} className="price-row">
                    <span className="grow">{c.name}<span className="small muted block">{c.lines} article{c.lines > 1 ? 's' : ''} comparé{c.lines > 1 ? 's' : ''}</span></span>
                    <b className={c.saving >= 0 ? 'good-text' : 'danger-text'}>{c.saving >= 0 ? '+' : ''}{money(c.saving)}</b>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {best.length > 0 && (
            <Section title="Tes meilleures affaires">
              <div className="price-table">
                {best.map((l, i) => (
                  <div key={i} className="price-row">
                    <span className="grow">{l.name}<span className="small muted block">payé {money(l.paid)} · habituellement {money(l.reference)}</span></span>
                    <b className="good-text">−{money(l.saving)}</b>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {worst.length > 0 && (
            <Section title="À acheter ailleurs la prochaine fois">
              <div className="price-table">
                {worst.map((l, i) => (
                  <div key={i} className="price-row">
                    <span className="grow">{l.name}<span className="small muted block">payé {money(l.paid)} · habituellement {money(l.reference)}</span></span>
                    <b className="danger-text">+{money(-l.saving)}</b>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {(state.savedFood?.length ?? 0) > 0 && (
            <Section title="Sauvés de la poubelle">
              <div className="chips">
                {[...state.savedFood!].reverse().slice(0, 20).map((f, i) => <span key={i} className="badge badge-good">{getIngredient(f.ingredientId)?.name ?? f.ingredientId} · {money(f.value)}</span>)}
              </div>
            </Section>
          )}

          <p className="small muted">
            Prix habituel = médiane des prix relevés dans ton pays par la communauté (Open Prices) et sur les sites des enseignes, pour la même quantité. Les articles sans prix de référence ne sont pas comptés. Sauvé de la poubelle = produit qui périmait dans 3 jours ou moins, utilisé dans une recette cuisinée.
          </p>
        </>
      )}
    </div>
  );
}
