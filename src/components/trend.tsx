import { statusVars, warningVars } from './statusVars';
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
 * burns the remaining work down by the stream's effective capacity — spread over the
 * sprints *up to the code freeze*, since that is the window the capacity model is
 * computed over. Where the line reaches zero (if before the freeze) is the projected
 * finish; if it ends above zero at the freeze, that gap is the shortfall. The freeze
 * is drawn as an amber marker (matching the freeze chip elsewhere), and sprints past
 * it are faded — no work can land there. No charting kit — same SVG idiom as Sparkline.
 *
 * The x-axis is sprint *assignment*, not completion history (none exists) — an
 * approximation the caller should label.
 */
export function StreamBurnChart({
  series,
  firstRemainingIndex,
  freezeX,
  activeIndex,
  remainingPts,
  effectiveCap,
  tone,
}: {
  series: number[];
  firstRemainingIndex: number;
  /** Fractional sprint-index position of the (effective) code freeze — the burn's right
   *  boundary and where the amber marker is drawn. Pass series.length when the freeze is
   *  at/after the last sprint's end (no artificial cutoff). See derive.freezeSprintX. */
  freezeX: number;
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
  const xOf = (i: number) => padL + i * bw; // left edge of sprint band i (i may be fractional)

  const okColor = statusVars('Complete').dot;
  const riskColor = statusVars('Blocked').dot;
  const freezeColor = warningVars().dot;
  const lineColor = tone === 'risk' ? riskColor : okColor;

  // Burn: remaining work drawn down by the stream's effective capacity, from the current
  // sprint to the code freeze. Capacity accrues at a constant rate, so the burn is a
  // straight segment. Bounding it at the freeze (not the last sprint) is the whole point:
  // effectiveCap only covers pre-freeze sprints, so the line must reach its shortfall/finish
  // exactly at the freeze. Guard the start so a freeze before "today" still yields a segment.
  const xStart = xOf(Math.min(firstRemainingIndex, freezeX));
  const xFreeze = xOf(freezeX);
  const span = Math.max(0, xFreeze - xStart);
  const endVal = remainingPts - effectiveCap; // work still unburned at the freeze (>0 = shortfall)
  // x where the burn crosses zero within [xStart, xFreeze], if the capacity gets there.
  const finishX = effectiveCap > 0 && remainingPts <= effectiveCap ? xStart + (remainingPts / effectiveCap) * span : null;
  const burnStart = { x: xStart, y: yOf(remainingPts) };
  const burnEnd = finishX !== null ? { x: finishX, y: yOf(0) } : { x: xFreeze, y: yOf(Math.max(0, endVal)) };

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Remaining work vs capacity by sprint, bounded by the code freeze" style={{ display: 'block' }}>
      {/* baseline + gridline at remainingPts */}
      <line x1={padL} y1={yOf(0)} x2={W - padR} y2={yOf(0)} stroke="var(--rt-line-strong)" strokeWidth={1} />
      <line x1={padL} y1={yOf(remainingPts)} x2={W - padR} y2={yOf(remainingPts)} stroke="var(--rt-line)" strokeWidth={1} strokeDasharray="3 3" />
      <text x={padL - 6} y={yOf(remainingPts) + 3} textAnchor="end" fontSize={9} fill="var(--rt-t3)">{remainingPts}</text>
      <text x={padL - 6} y={yOf(0) + 3} textAnchor="end" fontSize={9} fill="var(--rt-t3)">0</text>

      {/* faint planned-points bars per sprint; sprints past the freeze are faded (no work lands there) */}
      {series.map((v, i) => {
        const h = (v / yMax) * plotH;
        const remaining = i >= firstRemainingIndex;
        const postFreeze = i >= freezeX; // band starts on/after the freeze
        return (
          <rect
            key={i}
            x={xOf(i) + bw * 0.18}
            y={yOf(v)}
            width={bw * 0.64}
            height={Math.max(0, h)}
            rx={2}
            fill={remaining ? 'var(--rt-fill)' : 'var(--rt-line)'}
            opacity={postFreeze ? 0.35 : 1}
            stroke={i === activeIndex ? 'var(--rt-st-ac-dot)' : 'none'}
            strokeWidth={i === activeIndex ? 1.25 : 0}
          />
        );
      })}

      {/* code-freeze marker — the burn's boundary; amber, matching the freeze chip */}
      {freezeX < n && (
        <>
          <line x1={xFreeze} y1={padT} x2={xFreeze} y2={yOf(0)} stroke={freezeColor} strokeWidth={1.5} strokeDasharray="4 3" />
          <text x={Math.min(xFreeze + 4, W - padR)} y={padT + 8} textAnchor={xFreeze > W - padR - 40 ? 'end' : 'start'} fontSize={9} fill={freezeColor}>Freeze</text>
        </>
      )}

      {/* shortfall gap (work left unburned at the freeze) */}
      {finishX === null && endVal > 0.5 && (
        <line x1={burnEnd.x} y1={yOf(0)} x2={burnEnd.x} y2={yOf(endVal)} stroke={riskColor} strokeWidth={3} strokeLinecap="round" />
      )}

      {/* capacity burndown line */}
      {span > 0 && (
        <polyline
          points={`${burnStart.x.toFixed(1)},${burnStart.y.toFixed(1)} ${burnEnd.x.toFixed(1)},${burnEnd.y.toFixed(1)}`}
          fill="none"
          stroke={lineColor}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
      <circle cx={burnStart.x} cy={burnStart.y} r={3} fill={lineColor} />

      {/* projected finish marker (only when the burn reaches zero before the freeze) */}
      {finishX !== null && (
        <>
          <line x1={finishX} y1={padT} x2={finishX} y2={yOf(0)} stroke={okColor} strokeWidth={1} strokeDasharray="2 3" />
          <circle cx={finishX} cy={yOf(0)} r={3} fill={okColor} />
        </>
      )}

      {/* sprint ticks */}
      {series.map((_, i) => (
        <text key={i} x={xOf(i) + bw / 2} y={H - 9} textAnchor="middle" fontSize={9} fill={i >= freezeX ? 'var(--rt-t3)' : i >= firstRemainingIndex ? 'var(--rt-t2)' : 'var(--rt-t3)'}>
          {i + 1}
        </text>
      ))}
    </svg>
  );
}

/**
 * Velocity attainment over the elapsed sprints: per sprint, a faint "planned"
 * bar (the sprint's capacity-adjusted velocity) overlaid with a bold "actual"
 * bar (points completed) and a line connecting the actuals. Same SVG idiom as
 * the other charts here — no charting kit. Tone colours the actuals.
 */
export function VelocityTrendChart({
  series,
  tone,
}: {
  series: { label: string; planned: number; actual: number }[];
  tone: 'ok' | 'under';
}) {
  const W = 560;
  const H = 170;
  const padL = 28;
  const padR = 12;
  const padT = 14;
  const padB = 24;
  const n = Math.max(1, series.length);
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const bw = plotW / n;
  const yMax = Math.max(1, ...series.flatMap((s) => [s.planned, s.actual]));
  const yOf = (v: number) => padT + plotH - (Math.max(0, v) / yMax) * plotH;
  const xMid = (i: number) => padL + i * bw + bw / 2;

  const actualColor = tone === 'under' ? statusVars('Blocked').dot : statusVars('Complete').dot;
  const linePts = series.map((s, i) => `${xMid(i).toFixed(1)},${yOf(s.actual).toFixed(1)}`).join(' ');

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Actual vs planned velocity by sprint" style={{ display: 'block' }}>
      {/* baseline */}
      <line x1={padL} y1={yOf(0)} x2={W - padR} y2={yOf(0)} stroke="var(--rt-line-strong)" strokeWidth={1} />
      <text x={padL - 6} y={yOf(yMax) + 3} textAnchor="end" fontSize={9} fill="var(--rt-t3)">{yMax}</text>
      <text x={padL - 6} y={yOf(0) + 3} textAnchor="end" fontSize={9} fill="var(--rt-t3)">0</text>

      {series.map((s, i) => {
        const cx = xMid(i);
        const pw = bw * 0.5;
        const aw = bw * 0.3;
        return (
          <g key={i}>
            {/* planned (faint, wide) */}
            <rect x={cx - pw / 2} y={yOf(s.planned)} width={pw} height={Math.max(0, yOf(0) - yOf(s.planned))} rx={2} fill="var(--rt-line)" />
            {/* actual (bold, narrow, on top) */}
            <rect x={cx - aw / 2} y={yOf(s.actual)} width={aw} height={Math.max(0, yOf(0) - yOf(s.actual))} rx={2} fill={actualColor} />
            <text x={cx} y={H - 8} textAnchor="middle" fontSize={9} fill="var(--rt-t3)">{s.label}</text>
          </g>
        );
      })}

      {/* actuals trend line */}
      {series.length > 1 && (
        <polyline points={linePts} fill="none" stroke={actualColor} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" opacity={0.55} />
      )}
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
