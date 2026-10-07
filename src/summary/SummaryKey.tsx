// The legend for the chips a summary is full of. A recipient reads this page cold —
// no app, no one to ask — so "Under-planned" and "At risk" have to explain
// themselves. The badges are the real components, so the key can't drift from what
// the cards render; only the prose is written here.

import type { ReactNode } from 'react';
import { RunwayBadge, VerdictBadge } from '../components/VerdictLine';
import { warningVars } from '../components/statusVars';
import { UNPOINTED_WARN_SHARE, type HealthVerdict, type RunwayVerdict } from '../lib/derive';
import styles from './summary.module.css';

const DELIVERY: Array<[HealthVerdict, string]> = [
  ['on-track', 'The work still open fits the capacity left before the stream’s code freeze.'],
  ['at-risk', 'There is more open work than the stream’s engineers can finish before its freeze, or the freeze has passed with work outstanding.'],
  ['complete', 'Everything in the stream is done.'],
  ['unestimated', 'Items exist but none has points yet, so there is nothing to measure.'],
  ['unconfigured', 'No engineer count is set for the stream, so capacity can’t be assessed.'],
  ['no-work', 'Nothing has been created in the stream.'],
];

const PLANNING: Array<[RunwayVerdict, string]> = [
  ['planned', 'Enough work is created to fill the engineers reserved for the stream.'],
  ['under-planned', 'Engineers are reserved but not enough work is written down to keep them busy. It is always on track for delivery, which is exactly why it needs its own flag.'],
  ['over-reserved', 'Scope is declared complete and the reservation is larger than it needs. Engineers could move elsewhere.'],
  ['unplanned', 'Capacity is reserved against a stream with nothing created.'],
  ['complete', 'No sprints remain before the freeze, so nothing is left to plan.'],
];

function Row({ badge, children }: { badge: ReactNode; children: ReactNode }) {
  return (
    <div className={styles.keyRow}>
      <span className={styles.keyBadge}>{badge}</span>
      <span className={styles.keyText}>{children}</span>
    </div>
  );
}

/** Collapsed by default: the page is for reading results, and the key is for the
 *  moment a chip needs decoding. */
export function SummaryKey() {
  return (
    <details className={`card ${styles.key}`}>
      <summary className={styles.keySummary}>Key: what the tags mean</summary>
      <div className={styles.keyBody}>
        <div>
          <h3 className={styles.keyHeading}>Delivery: can the open work be finished in time?</h3>
          {DELIVERY.map(([v, text]) => (
            <Row key={v} badge={<VerdictBadge verdict={v} />}>{text}</Row>
          ))}
        </div>
        <div>
          <h3 className={styles.keyHeading}>Planning: is enough work lined up for the engineers reserved?</h3>
          {PLANNING.map(([v, text]) => (
            <Row key={v} badge={<RunwayBadge verdict={v} />}>{text}</Row>
          ))}
        </div>
        <div>
          <h3 className={styles.keyHeading}>Other markers</h3>
          <Row
            badge={
              <span className={styles.keyChip} style={{ color: warningVars().text, background: warningVars().soft }}>
                N unpointed
              </span>
            }
          >
            Open items with no point estimate. They count as zero in every verdict, so a stream with many of them is being
            judged on less work than it really has. Turns amber when {Math.round(UNPOINTED_WARN_SHARE * 100)}% or more of
            the open items are unpointed.
          </Row>
          <Row
            badge={
              <span className={styles.keyChip} style={{ color: warningVars().text, background: warningVars().soft }}>
                N pts after freeze
              </span>
            }
          >
            Work scheduled into sprints that start after the stream’s code freeze. It is left out of the verdicts.
          </Row>
          <Row badge={<span className={styles.keyChip}>Muted</span>}>
            An informational stream, left out of the capacity figures.
          </Row>
        </div>
      </div>
    </details>
  );
}
