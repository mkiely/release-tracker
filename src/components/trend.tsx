import { statusVars } from './statusVars';
import styles from './trend.module.css';

/**
 * Trend of a series across the release; the highlighted index is dotted.
 * Defaults to the compact inline size; pass `width`/`height` for a larger
 * variant (e.g. the stream row's dedicated trend row). Stroke + dot scale with
 * height so the bigger form stays proportionate.
 */
export function Sparkline({
  series,
  activeIndex,
  width = 56,
  height = 16,
}: {
  series: number[];
  activeIndex: number;
  width?: number;
  height?: number;
}) {
  const w = width;
  const h = height;
  const scale = h / 16;
  const stroke = 1.25 * scale;
  const dotR = 2.25 * scale;
  const pad = dotR + 1;
  const n = series.length;
  // Inline style overrides the fixed dimensions baked into the .spark class.
  const dims = { width: w, height: h, flex: `0 0 ${w}px` } as const;
  if (n === 0) return <span className={styles.spark} style={dims} aria-hidden="true" />;
  const max = Math.max(1, ...series);
  const x = (i: number) => (n <= 1 ? w / 2 : pad + (i * (w - 2 * pad)) / (n - 1));
  const y = (v: number) => h - pad - (v / max) * (h - 2 * pad);
  const pts = series.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg className={styles.spark} style={dims} width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <polyline points={pts} fill="none" stroke="var(--rt-line-strong)" strokeWidth={stroke} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(activeIndex)} cy={y(series[activeIndex] ?? 0)} r={dotR} fill="var(--rt-st-ac-dot)" />
    </svg>
  );
}

/**
 * Large capacity-burndown for the health detail modal. Faint bars show planned
 * points per sprint across the whole release (the work distribution); the bold line
 * burns the remaining work down by the stream's effective per-sprint capacity over
 * the remaining sprints. Where it reaches zero is the projected finish; if it ends
 * above zero, that gap is the shortfall. No charting kit — same SVG idiom as Sparkline.
 *
 * The x-axis is sprint *assignment*, not completion history (none exists) — an
 * approximation the caller should label.
 */
export function StreamBurnChart({
  series,
  firstRemainingIndex,
  activeIndex,
  remainingPts,
  effectiveCap,
  tone,
}: {
  series: number[];
  firstRemainingIndex: number;
  activeIndex: number;
  remainingPts: number;
  effectiveCap: number;
  tone: 'ok' | 'risk';
}) {
  const W = 560;
  const H = 200;
  const padL = 34;
  const padR = 12;
  const padT = 14;
  const padB = 26;
  const n = Math.max(1, series.length);
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const bw = plotW / n;
  const yMax = Math.max(1, ...series, remainingPts, effectiveCap);
  const yOf = (v: number) => padT + plotH - (Math.max(0, v) / yMax) * plotH;
  const xOf = (i: number) => padL + i * bw; // left edge of sprint band i

  const lineColor = tone === 'risk' ? statusVars('Blocked').dot : statusVars('Complete').dot;

  // Burndown of remaining work over the remaining sprints.
  const remCount = Math.max(0, n - firstRemainingIndex);
  const perStep = remCount > 0 ? effectiveCap / remCount : 0;
  const burn: { x: number; y: number; v: number }[] = [];
  for (let k = 0; k <= remCount; k++) {
    const v = remainingPts - perStep * k;
    burn.push({ x: xOf(firstRemainingIndex + k), y: yOf(v), v });
  }
  const endVal = burn.length ? burn[burn.length - 1].v : remainingPts;
  const finishX = (() => {
    // x where the burndown crosses zero, if it does within the window.
    if (perStep <= 0) return null;
    const k = remainingPts / perStep;
    return k <= remCount ? xOf(firstRemainingIndex + k) : null;
  })();

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Remaining work vs capacity by sprint" style={{ display: 'block' }}>
      {/* baseline + gridline at remainingPts */}
      <line x1={padL} y1={yOf(0)} x2={W - padR} y2={yOf(0)} stroke="var(--rt-line-strong)" strokeWidth={1} />
      <line x1={padL} y1={yOf(remainingPts)} x2={W - padR} y2={yOf(remainingPts)} stroke="var(--rt-line)" strokeWidth={1} strokeDasharray="3 3" />
      <text x={padL - 6} y={yOf(remainingPts) + 3} textAnchor="end" fontSize={9} fill="var(--rt-t3)">{remainingPts}</text>
      <text x={padL - 6} y={yOf(0) + 3} textAnchor="end" fontSize={9} fill="var(--rt-t3)">0</text>

      {/* faint planned-points bars per sprint */}
      {series.map((v, i) => {
        const h = (v / yMax) * plotH;
        const remaining = i >= firstRemainingIndex;
        return (
          <rect
            key={i}
            x={xOf(i) + bw * 0.18}
            y={yOf(v)}
            width={bw * 0.64}
            height={Math.max(0, h)}
            rx={2}
            fill={remaining ? 'var(--rt-fill)' : 'var(--rt-line)'}
            stroke={i === activeIndex ? 'var(--rt-st-ac-dot)' : 'none'}
            strokeWidth={i === activeIndex ? 1.25 : 0}
          />
        );
      })}

      {/* shortfall gap (work left unburned at the end) */}
      {endVal > 0.5 && burn.length > 0 && (
        <line
          x1={burn[burn.length - 1].x}
          y1={yOf(0)}
          x2={burn[burn.length - 1].x}
          y2={yOf(endVal)}
          stroke={statusVars('Blocked').dot}
          strokeWidth={3}
          strokeLinecap="round"
        />
      )}

      {/* capacity burndown line */}
      {burn.length > 1 && (
        <polyline
          points={burn.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
          fill="none"
          stroke={lineColor}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
      {burn.length > 0 && <circle cx={burn[0].x} cy={burn[0].y} r={3} fill={lineColor} />}

      {/* projected finish marker */}
      {finishX !== null && (
        <>
          <line x1={finishX} y1={padT} x2={finishX} y2={yOf(0)} stroke={statusVars('Complete').dot} strokeWidth={1} strokeDasharray="2 3" />
          <circle cx={finishX} cy={yOf(0)} r={3} fill={statusVars('Complete').dot} />
        </>
      )}

      {/* sprint ticks */}
      {series.map((_, i) => (
        <text key={i} x={xOf(i) + bw / 2} y={H - 9} textAnchor="middle" fontSize={9} fill={i >= firstRemainingIndex ? 'var(--rt-t2)' : 'var(--rt-t3)'}>
          {i + 1}
        </text>
      ))}
    </svg>
  );
}

/** Compact completion ring + percentage. */
export function CompletionRing({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? done / total : 0;
  const sz = 15;
  const r = 5.75;
  const c = 2 * Math.PI * r;
  const center = sz / 2;
  return (
    <span className={styles.ring} title={`${done} of ${total} complete`}>
      <svg width={sz} height={sz} viewBox={`0 0 ${sz} ${sz}`} aria-hidden="true">
        <circle cx={center} cy={center} r={r} fill="none" stroke="var(--rt-fill)" strokeWidth={2.25} />
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke={statusVars('Complete').dot}
          strokeWidth={2.25}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          transform={`rotate(-90 ${center} ${center})`}
        />
      </svg>
      <span className={styles.ringPct}>{Math.round(pct * 100)}%</span>
    </span>
  );
}
