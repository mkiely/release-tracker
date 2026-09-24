// Work streams on a continuous date axis.
//
// Presentational only: it takes rows and sprints and draws them. Both callers — the
// in-app timeline panel and the standalone summary viewer — hand it the same shape,
// which is what keeps a shared link's timeline identical to the one the sharer saw.
//
// HTML/CSS rather than SVG, unlike the charts in Trend.tsx: this one needs truncatable
// stream names, native tooltips and hit targets on every bar, all of which SVG makes
// harder than it makes the geometry. Positions arrive from lib/streamTimeline as
// percentages and are passed through as CSS custom properties — the one case the
// house style keeps inline styles for (genuinely data-driven values).

import type { CSSProperties } from 'react';
import { fmtShort } from '../lib/dates';
import {
  barGeometry,
  clampPct,
  pctOfDate,
  segmentPct,
  timelineWindow,
  type TimelineRow,
  type TimelineSprint,
} from '../lib/streamTimeline';
import { statusVars, warningVars } from './statusVars';
import styles from './StreamGantt.module.css';

/** CSS custom properties are not in React's CSSProperties, so they're widened at the
 *  one place they're set rather than casting at every call. */
type Vars = CSSProperties & Record<`--${string}`, string>;

export function StreamGantt({
  sprints,
  rows,
  todayISO,
  labelWidth,
  trackHeight,
  onSelectRow,
}: {
  sprints: readonly TimelineSprint[];
  rows: readonly TimelineRow[];
  todayISO: string;
  /** Label gutter width — any CSS length, so a caller can cap it against the
   *  viewport. The in-app panel is a wide modal and spends it on stream names:
   *  connector epic names run long, and truncation eats the END, which is usually
   *  the distinguishing part. The summary viewer sits in a narrow reading column
   *  and takes the default. */
  labelWidth?: number | string;
  /** Row height. Taller rows in the app panel, where there is screen to use. */
  trackHeight?: number;
  /** Optional drill-through. Omitted in the summary viewer, which has nowhere to go. */
  onSelectRow?: (id: string) => void;
}) {
  const window = timelineWindow(sprints);
  if (!window || rows.length === 0) {
    return (
      <p className={styles.empty}>
        {!window ? 'This release has no sprints yet, so there is no calendar to lay work out on.' : 'No work streams to show.'}
      </p>
    );
  }

  const okColor = statusVars('Complete').dot;
  const riskColor = statusVars('Blocked').dot;
  const freezeColor = warningVars().dot;
  const toneColor = (tone: TimelineRow['tone']): string =>
    tone === 'risk' ? riskColor : tone === 'ok' ? okColor : 'var(--rt-line-strong)';

  // Today only earns a line when it actually falls inside the release. Outside it,
  // a clamped marker pinned to an edge would read as "the release starts today".
  const todayPct = pctOfDate(todayISO, window);
  const todayInWindow = todayPct >= 0 && todayPct <= 100;

  // Sprint boundaries: one gridline at each sprint's start, skipping the first (it
  // is the track's own left edge).
  const boundaries = sprints.slice(1).map((sp) => clampPct(pctOfDate(sp.startISO, window)));

  const rootVars: Vars = {};
  if (labelWidth) rootVars['--gantt-label-w'] = typeof labelWidth === 'number' ? `${labelWidth}px` : labelWidth;
  if (trackHeight) {
    rootVars['--gantt-track-h'] = `${trackHeight}px`;
    // Row spacing tracks row height, so a taller timeline doesn't read as one solid
    // block of bars with hairlines between them.
    rootVars['--gantt-row-gap'] = `${Math.round(trackHeight / 5)}px`;
  }

  return (
    <div className={styles.gantt} style={rootVars}>
      {/* Axis first: the dates every bar below is read against. */}
      <div className={styles.row}>
        <span />
        <div className={styles.axis}>
          {sprints.map((sp, i) => {
            const at = clampPct(pctOfDate(sp.startISO, window));
            const isFirst = i === 0;
            const isLast = i === sprints.length - 1;
            return (
              <span
                key={`${sp.name}-${i}`}
                className={`${styles.axisTick} ${isFirst ? styles.axisTickStart : isLast ? styles.axisTickEnd : ''}`}
                style={{ '--at': `${at}%` } as Vars}
                title={`${sp.name}: ${fmtShort(sp.startISO)} – ${fmtShort(sp.endISO)}`}
              >
                {fmtShort(sp.startISO)}
              </span>
            );
          })}
        </div>
      </div>

      {rows.map((row) => {
        const freezePct = pctOfDate(row.freezeISO, window);
        // A freeze outside the window is clamped to the edge it overshot — it still
        // tells you which side of the release it lands on, which is the useful part.
        const freezeInWindow = freezePct >= 0 && freezePct <= 100;
        const color = toneColor(row.tone);
        // Each run of sprints reads as its own period of work. The row's tooltip
        // lists them rather than collapsing to first-start..last-end, which would
        // restate exactly the span the segmentation exists to avoid drawing.
        const scheduled = row.segments.length
          ? row.segments
              .map((s) => `${fmtShort(sprints[s.startIdx].startISO)} – ${fmtShort(sprints[s.endIdx].endISO)}`)
              .join(', ')
          : 'not scheduled';
        const title = [
          row.name,
          `Scheduled: ${scheduled}`,
          `${row.itemCount} item${row.itemCount === 1 ? '' : 's'} · ${row.totalPts - row.remainingPts}/${row.totalPts} pts done`,
          `Code freeze: ${fmtShort(row.freezeISO)}`,
        ].join('\n');

        return (
          <div className={`${styles.row} ${styles.rowGrow}`} key={row.id}>
            <span className={styles.label} title={row.name}>
              {row.name}{' '}
              <span className={styles.labelMeta}>
                {row.totalPts > 0 ? `${row.totalPts}pt` : `${row.itemCount} item${row.itemCount === 1 ? '' : 's'}`}
              </span>
            </span>
            <div
              className={styles.track}
              role={onSelectRow ? 'button' : undefined}
              tabIndex={onSelectRow ? 0 : undefined}
              onClick={onSelectRow ? () => onSelectRow(row.id) : undefined}
              onKeyDown={
                onSelectRow
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectRow(row.id);
                      }
                    }
                  : undefined
              }
              title={title}
            >
              {boundaries.map((at, i) => (
                <span key={i} className={styles.gridline} style={{ '--at': `${at}%` } as Vars} />
              ))}
              {row.segments.length > 0 ? (
                row.segments.map((seg, i) => {
                  const geo = barGeometry(seg, sprints, window);
                  const pct = segmentPct(seg);
                  const span = `${fmtShort(sprints[seg.startIdx].startISO)} – ${fmtShort(sprints[seg.endIdx].endISO)}`;
                  return (
                    <div
                      key={i}
                      className={styles.bar}
                      style={
                        {
                          '--bar-left': `${geo.leftPct}%`,
                          '--bar-width': `${geo.widthPct}%`,
                          '--bar-bg': 'var(--rt-paper)',
                          '--bar-border': color,
                        } as Vars
                      }
                      // Its own tooltip: with several bars on a row, the row-level one
                      // can't say which period the pointer is over.
                      title={`${row.name}\n${span}\n${seg.pts} pts · ${pct}% done`}
                    >
                      <span className={styles.barFill} style={{ '--fill-width': `${clampPct(pct)}%` } as Vars} />
                      <span className={styles.barLabel}>{pct}%</span>
                    </div>
                  );
                })
              ) : (
                <span className={styles.unscheduled}>No sprinted work</span>
              )}
              {freezeInWindow && (
                <span
                  className={styles.freeze}
                  style={{ '--at': `${freezePct}%`, '--freeze-color': freezeColor } as Vars}
                />
              )}
              {todayInWindow && <span className={styles.today} style={{ '--at': `${todayPct}%` } as Vars} />}
            </div>
          </div>
        );
      })}

      <div className={styles.row}>
        <span />
        <div className={styles.legend}>
          {todayInWindow && (
            <span className={styles.legendItem}>
              <span className={styles.legendSwatch} style={{ '--swatch': 'var(--rt-st-ac-dot)' } as Vars} />
              Today
            </span>
          )}
          <span className={styles.legendItem}>
            <span className={styles.legendSwatchDashed} style={{ '--swatch': freezeColor } as Vars} />
            Code freeze
          </span>
          <span className={styles.legendItem}>
            <span className={styles.legendSwatch} style={{ '--swatch': okColor } as Vars} />
            On track
          </span>
          <span className={styles.legendItem}>
            <span className={styles.legendSwatch} style={{ '--swatch': riskColor } as Vars} />
            At risk
          </span>
        </div>
      </div>
    </div>
  );
}
