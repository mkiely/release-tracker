import type { HealthVerdict, StreamForecast } from '../lib/derive';
import { verdictVars } from './statusVars';
import styles from './VerdictLine.module.css';

/** Verdict pill — colored dot + label, shared by the stream presenters and the
 *  health detail modal. Muted tone for unconfigured/complete, status tones else. */
export function VerdictBadge({ verdict }: { verdict: HealthVerdict }) {
  const v = verdictVars(verdict);
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontSize: 'var(--rt-fs-xs)', fontWeight: 'var(--rt-fw-semibold)',
        color: v.tone === 'muted' ? 'var(--rt-t3)' : v.text,
        background: v.tone === 'muted' ? 'var(--rt-fill)' : v.soft,
        border: `1.5px solid ${v.tone === 'muted' ? 'var(--rt-line)' : v.soft}`,
        borderRadius: 6, padding: '3px 9px', lineHeight: 1, whiteSpace: 'nowrap',
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: v.tone === 'muted' ? 'var(--rt-t3)' : v.dot, flexShrink: 0 }} />
      {v.label}
    </span>
  );
}

/** Always-visible verdict + plain-language "why", clickable to the detail modal
 *  (or the edit modal when engineers haven't been set yet). Pass `summary={false}`
 *  for a badge-only variant in tight spaces (e.g. a card header strip). */
export function VerdictLine({
  forecast,
  onOpen,
  summary = true,
}: {
  forecast: StreamForecast;
  onOpen: () => void;
  summary?: boolean;
}) {
  return (
    <button
      type="button"
      className={summary ? styles.verdictBtn : styles.verdictBtnBadge}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      title={
        forecast.verdict === 'unconfigured'
          ? 'Set engineers required'
          : forecast.verdict === 'unestimated'
            ? 'Add points to this stream’s items to assess'
            : 'View capacity-fit details'
      }
    >
      <VerdictBadge verdict={forecast.verdict} />
      {summary && <span className={styles.verdictSummary}>{forecast.summary}</span>}
    </button>
  );
}
