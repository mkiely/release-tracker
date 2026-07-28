// The two verdicts a work stream carries, side by side, plus the work neither of
// them measures.
//
// They answer opposite questions — "can we finish what's created?" and "is enough
// created to fill what we're holding?" — and collapsing them loses the case that
// matters most: an under-planned stream is ALWAYS on-track on delivery, because it
// is green precisely for the reason it's being flagged. One chip could only ever
// tell half of that. See docs/metrics.md.

import type { StreamForecast, StreamRunway } from '../lib/derive';
import type { PlanningState } from '../types';
import { RunwayBadge, VerdictBadge } from './VerdictLine';
import { runwayVars, verdictVars, warningVars } from './statusVars';
import styles from './StreamAssessmentChips.module.css';

export function StreamAssessmentChips({
  forecast,
  runway,
  planningState,
  onOpenDelivery,
  onOpenPlanning,
  /** Hides the planning chip where there is no room for it (dense table cells). */
  planning = true,
}: {
  forecast: StreamForecast;
  runway: StreamRunway;
  planningState: PlanningState;
  onOpenDelivery: () => void;
  onOpenPlanning: () => void;
  planning?: boolean;
}) {
  const postFreeze = Math.round(forecast.postFreezeRemainingPts);
  // When neither side can be assessed they fail for the SAME reason (no engineer
  // count, nothing estimated) and render the same word twice. One chip, one fix.
  const sameStory = verdictVars(forecast.verdict).label === runwayVars(runway.verdict, planningState).label;
  return (
    <div className={styles.chips}>
      <button type="button" className={styles.chipBtn} onClick={(e) => { e.stopPropagation(); onOpenDelivery(); }} title={forecast.summary}>
        <VerdictBadge verdict={forecast.verdict} />
      </button>
      {planning && !sameStory && (
        <button
          type="button"
          className={styles.chipBtn}
          onClick={(e) => { e.stopPropagation(); onOpenPlanning(); }}
          title={`${runway.summary}\nPlanning status: ${planningLabel(planningState)}. Click for detail.`}
        >
          <RunwayBadge verdict={runway.verdict} planningState={planningState} />
        </button>
      )}
      {/* Scheduled past the freeze: outside the window both verdicts measure, so it
          states itself rather than sitting silently behind a green chip. */}
      {postFreeze > 0 && (
        <span
          className={styles.postFreeze}
          style={{ color: warningVars().text, borderColor: warningVars().soft, background: warningVars().soft }}
          title={`${postFreeze} pts are scheduled into sprints starting after this stream's code freeze — as planned, that work won't land by it.`}
        >
          {postFreeze} pts after freeze
        </span>
      )}
    </div>
  );
}

const planningLabel = (p: PlanningState): string =>
  p === 'complete' ? 'scope complete' : p === 'deferred' ? 'deferred' : 'open';
