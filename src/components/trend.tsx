import { statusVars } from './statusVars';
import styles from './trend.module.css';

/** Trend of a series across the release; the highlighted index is dotted. */
export function Sparkline({ series, activeIndex }: { series: number[]; activeIndex: number }) {
  const w = 56;
  const h = 16;
  const pad = 2.5;
  const n = series.length;
  if (n === 0) return <span className={styles.spark} aria-hidden="true" />;
  const max = Math.max(1, ...series);
  const x = (i: number) => (n <= 1 ? w / 2 : pad + (i * (w - 2 * pad)) / (n - 1));
  const y = (v: number) => h - pad - (v / max) * (h - 2 * pad);
  const pts = series.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg className={styles.spark} width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <polyline points={pts} fill="none" stroke="var(--rt-line-strong)" strokeWidth={1.25} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(activeIndex)} cy={y(series[activeIndex] ?? 0)} r={2.25} fill="var(--rt-st-ac-dot)" />
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
