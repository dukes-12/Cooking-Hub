import { useEffect, useMemo, useRef, useState } from 'react';

export interface HistorySeries {
  key: string;
  label: string;
  /** Emplacement de la palette catégorielle (1 à 5), dans un ordre fixe. */
  slot: number;
  /** Ligne (relevé hebdomadaire) ou points (achats ponctuels). */
  kind: 'line' | 'dots';
  points: { t: number; v: number }[];
}

const H = 190;
const PAD = { top: 10, right: 12, bottom: 24, left: 44 };
const DAY = 86400000;

function niceTicks(min: number, max: number, count = 4): number[] {
  const span = max - min || Math.abs(max) || 1;
  const raw = span / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => span / s <= count) ?? raw;
  const out: number[] = [];
  for (let v = Math.floor(min / step) * step; v <= max + step * 0.001; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}

const fmtDate = (t: number, withYear = false) => new Date(t).toLocaleDateString('fr-FR', withYear ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' });

/** Évolution d'un prix dans le temps : une ligne par enseigne, des points pour tes achats. */
export function PriceHistoryChart({ series, format, unit }: { series: HistorySeries[]; format: (v: number) => string; unit: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(340);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    if (!box.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);

  const all = series.flatMap((s) => s.points);
  const geo = useMemo(() => {
    if (!all.length) return null;
    let t0 = Math.min(...all.map((p) => p.t));
    let t1 = Math.max(...all.map((p) => p.t));
    if (t1 - t0 < 14 * DAY) (t0 -= 7 * DAY), (t1 += 7 * DAY);
    const vs = all.map((p) => p.v);
    const ticks = niceTicks(Math.min(...vs) * 0.95, Math.max(...vs) * 1.05);
    const v0 = ticks[0];
    const v1 = ticks.at(-1)!;
    const x = (t: number) => PAD.left + ((t - t0) / (t1 - t0)) * (width - PAD.left - PAD.right);
    const y = (v: number) => PAD.top + (1 - (v - v0) / (v1 - v0 || 1)) * (H - PAD.top - PAD.bottom);
    // Graduations de dates : 3 ou 4 repères répartis.
    const n = width < 320 ? 3 : 4;
    const xticks = Array.from({ length: n }, (_, i) => t0 + ((t1 - t0) * i) / (n - 1));
    return { t0, t1, x, y, ticks, xticks };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, width]);

  if (!geo) return null;
  const times = [...new Set(all.map((p) => p.t))].sort((a, b) => a - b);
  const hoverT = hover != null ? times.reduce((best, t) => (Math.abs(geo.x(t) - hover) < Math.abs(geo.x(best) - hover) ? t : best), times[0]) : null;
  const atHover = hoverT != null ? series.map((s) => ({ s, p: s.points.find((p) => p.t === hoverT) })).filter((r) => r.p) : [];
  const tipLeft = hoverT != null ? Math.min(Math.max(geo.x(hoverT) - 80, 0), width - 170) : 0;

  return (
    <div className="viz" ref={box}>
      {series.length > 1 && (
        <div className="viz-legend">
          {series.map((s) => (
            <span key={s.key}>
              <i className={`viz-swatch ${s.kind}`} style={{ background: `var(--series-${s.slot})` }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
      <svg
        width={width}
        height={H}
        role="img"
        aria-label={`Évolution du prix ${unit}`}
        onPointerMove={(e) => setHover(e.clientX - e.currentTarget.getBoundingClientRect().left)}
        onPointerLeave={() => setHover(null)}
      >
        {geo.ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={width - PAD.right} y1={geo.y(v)} y2={geo.y(v)} className="viz-grid" />
            <text x={PAD.left - 6} y={geo.y(v) + 4} className="viz-axis" textAnchor="end">{format(v)}</text>
          </g>
        ))}
        {geo.xticks.map((t, i) => (
          <text key={t} x={geo.x(t)} y={H - 6} className="viz-axis" textAnchor={i === 0 ? 'start' : i === geo.xticks.length - 1 ? 'end' : 'middle'}>{fmtDate(t)}</text>
        ))}
        {series.map((s) =>
          s.kind === 'line' && s.points.length > 1 ? (
            <polyline key={s.key} fill="none" stroke={`var(--series-${s.slot})`} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" points={s.points.map((p) => `${geo.x(p.t)},${geo.y(p.v)}`).join(' ')} />
          ) : null,
        )}
        {series.map((s) =>
          s.points.map((p) =>
            s.kind === 'dots' || s.points.length === 1 ? (
              <circle key={`${s.key}-${p.t}`} cx={geo.x(p.t)} cy={geo.y(p.v)} r={4.5} fill={`var(--series-${s.slot})`} className="viz-dot" />
            ) : null,
          ),
        )}
        {hoverT != null && (
          <g>
            <line x1={geo.x(hoverT)} x2={geo.x(hoverT)} y1={PAD.top} y2={H - PAD.bottom} className="viz-crosshair" />
            {atHover.map(({ s, p }) => (
              <circle key={s.key} cx={geo.x(hoverT)} cy={geo.y(p!.v)} r={4.5} fill={`var(--series-${s.slot})`} className="viz-dot" />
            ))}
          </g>
        )}
      </svg>
      {hoverT != null && atHover.length > 0 && (
        <div className="viz-tip" style={{ left: tipLeft }}>
          <b>{fmtDate(hoverT, true)}</b>
          {atHover.map(({ s, p }) => (
            <span key={s.key}>
              <i className={`viz-swatch ${s.kind}`} style={{ background: `var(--series-${s.slot})` }} /> {s.label} : <b>{format(p!.v)}</b>
            </span>
          ))}
        </div>
      )}
      <details className="viz-table">
        <summary>Voir les valeurs</summary>
        <table>
          <thead>
            <tr><th>Date</th>{series.map((s) => <th key={s.key}>{s.label}</th>)}</tr>
          </thead>
          <tbody>
            {times.slice().reverse().map((t) => (
              <tr key={t}>
                <td>{fmtDate(t, true)}</td>
                {series.map((s) => {
                  const p = s.points.find((x) => x.t === t);
                  return <td key={s.key}>{p ? format(p.v) : ''}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
