// Readouts over the recorded sprint history (lib/sprintHistory.ts): the short
// phrases and chart points the screens show. Pure, so the wording — which is where
// a history display most easily overclaims — is pinned by tests rather than buried
// in JSX.
//
// The one rule every function here keeps: say what was recorded, and say when the
// record is thin. A late opening or a stale closing changes what a number means,
// so it travels with the number instead of being dropped.

import type { Release, Sprint } from '../types';
import { addDays, fmtShort, workdaysInRange } from './dates';
import { freezeSprintX } from './derive';
import { closingStale, openingLate, scopeSeries, type ScopeChange, type SprintInjection, type SprintReview } from './sprintHistory';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "1 pt", "3 pts" — every point figure a readout prints goes through this. */
export const ptsLabel = (n: number): string => plural(n, 'pt');

// ── Freshness ───────────────────────────────────────────────────────────────

/** Plain-language caveats on a sprint's readings, empty when they are sound. */
export function readingCaveats(sp: Sprint, today: string): string[] {
  const out: string[] = [];
  if (openingLate(sp) && sp.opening) {
    const n = workdaysInRange(addDays(sp.startISO, 1), sp.opening.dateISO);
    out.push(`Commitment first recorded ${fmtShort(sp.opening.dateISO)}, ${plural(n, 'working day')} in — work may have moved before then.`);
  }
  if (closingStale(sp, today) && sp.closing) {
    const n = workdaysInRange(addDays(sp.closing.dateISO, 1), sp.endISO);
    out.push(`Last seen ${fmtShort(sp.closing.dateISO)}, ${plural(n, 'working day')} before it ended — the end of the sprint was not observed.`);
  }
  return out;
}

// ── Sprint review ───────────────────────────────────────────────────────────

export interface ReviewReadout {
  /** The compact line for a sprint header: "75% of commitment · +2 added · 1 carried over". */
  label: string;
  /** The same, as a sentence, for a tooltip or a modal lede. */
  sentence: string;
  /** The readings are late or stale: the label should carry a caveat mark. */
  caveated: boolean;
}

export function reviewReadout(review: SprintReview, today: string): ReviewReadout {
  const { pts, final } = review;
  const parts: string[] = [];
  parts.push(review.commitmentMetPct === null ? 'nothing committed' : `${review.commitmentMetPct}% of commitment`);
  if (review.added.length) parts.push(`+${review.added.length} added`);
  if (review.removed.length) parts.push(`−${review.removed.length} removed`);
  if (final && review.unfinished.length) parts.push(`${review.unfinished.length} carried over`);
  if (!final) parts.push('so far');

  const commit =
    pts.committed > 0
      ? `Committed ${ptsLabel(pts.committed)}; ${ptsLabel(pts.committedCompleted)} of that ${final ? 'were' : 'are'} done (${review.commitmentMetPct}%).`
      : 'Nothing was committed when the sprint opened.';
  const moved = [
    review.added.length ? `${plural(review.added.length, 'item')} (${ptsLabel(pts.added)}) added mid-sprint` : '',
    review.removed.length ? `${plural(review.removed.length, 'item')} (${ptsLabel(pts.removed)}) moved out` : '',
  ].filter(Boolean);
  const left = review.unfinished.length
    ? final
      ? `${plural(review.unfinished.length, 'item')} (${ptsLabel(pts.unfinished)}) carried over.`
      : `${plural(review.unfinished.length, 'item')} (${ptsLabel(pts.unfinished)}) still open.`
    : final
      ? 'Nothing carried over.'
      : '';
  const sentence = [
    final ? '' : `In progress, as of ${fmtShort(review.sprint.closing!.dateISO)}:`,
    commit,
    moved.length ? `${moved.join('; ')}.` : '',
    left,
  ].filter(Boolean).join(' ');

  return { label: parts.join(' · '), sentence, caveated: readingCaveats(review.sprint, today).length > 0 };
}

// ── Scope change ────────────────────────────────────────────────────────────

export interface ScopeChangeReadout {
  /** Where the record begins: "Since Kickoff opened". */
  since: string;
  /** Growth — work that arrived after a stream declared its scope complete. */
  growth: string;
  /** Unplanned work pulled into sprints already under way. Null with no sprint observed. */
  injection: string | null;
  /** Tickets written while planning was open. Null when there were none. */
  planning: string | null;
}

/**
 * The History tab's account of scope. Three separate statements, never summed: growth
 * (after a stream declared its scope complete), injection (into sprints already under
 * way), and planning progress (tickets written while scope was still open). Null with
 * nothing recorded.
 */
export function scopeChangeReadout(release: Release, change: ScopeChange, injection: SprintInjection): ScopeChangeReadout | null {
  if (!change.from) return null;
  const from = change.from;
  const sp = release.sprints.find((s) => s.id === from.sprintId);
  const since = sp ? `Since ${sp.name} ${from.phase === 'opening' ? 'opened' : 'closed'}` : 'Since recording began';
  const nameOf = (id: string | null) =>
    id === null ? 'work with no stream' : release.workStreams.find((w) => w.id === id)?.name ?? 'a deleted stream';
  const list = (pick: (e: ScopeChange['byStream'][number]) => number, sign: string) =>
    change.byStream
      .filter((e) => pick(e) > 0)
      .map((e) => `${nameOf(e.workStreamId)} ${sign}${pick(e)}`)
      .join(', ');

  let growth: string;
  if (!change.everDeclared) {
    growth = 'No stream has declared its scope complete yet, so every new ticket counts as planning, not growth.';
  } else if (change.grownPts === 0 && change.cutPts === 0) {
    growth = 'No scope was added after a stream declared it complete.';
  } else {
    const parts = [
      change.grownPts > 0 ? `grew by ${ptsLabel(change.grownPts)} (${list((e) => e.grownPts, '+')})` : '',
      change.cutPts > 0 ? `was cut by ${ptsLabel(change.cutPts)} (${list((e) => e.cutPts, '\u2212')})` : '',
    ].filter(Boolean);
    growth = `After streams declared their scope complete, scope ${parts.join(' and ')}.`;
  }

  const inj =
    injection.observedSprints === 0
      ? null
      : injection.addedPts === 0
        ? 'Nothing was added to a sprint once it was under way.'
        : `${ptsLabel(injection.addedPts)} were added to sprints already under way` +
          (injection.pct === null ? '' : ` — ${injection.pct}% of the ${ptsLabel(injection.committedPts)} committed`) +
          `, in ${plural(injection.sprintsWithAdds, 'sprint')}.`;

  const planning =
    change.planningPts > 0
      ? `${ptsLabel(change.planningPts)} of tickets were written while planning was still open — planning progress, not growth.`
      : change.planningPts < 0
        ? `${ptsLabel(-change.planningPts)} of tickets were removed while planning was still open.`
        : null;

  return { since, growth, injection: inj, planning };
}

// ── Recorded burn line ──────────────────────────────────────────────────────

export interface BurnPoint {
  /** Fractional sprint-index position, on the same axis as freezeSprintX. */
  x: number;
  /** Remaining (not Complete) points. */
  pts: number;
  /** All points in scope at the reading — the faint line that shows a rise in
   *  remaining work was scope arriving, not work going backwards. */
  scope: number;
  /** Read late (an opening) or stale (a closing): drawn hollow. */
  hollow: boolean;
}

/**
 * Remaining work as recorded, for StreamBurnChart's actual line: each sprint's
 * opening and closing, placed at the day each was taken. `null` breaks the line
 * where a sprint was never observed — a gap, not an interpolation. Empty when
 * nothing was recorded, so the chart can skip the line entirely.
 */
export function recordedBurn(release: Release, workStreamId: string | undefined, today: string): (BurnPoint | null)[] {
  const series = scopeSeries(release, workStreamId);
  if (!series.some((s) => s.opening || s.closing)) return [];
  const out: (BurnPoint | null)[] = [];
  for (const { sprint, opening, closing } of series) {
    if (sprint.startISO > today) break;
    if (!opening && !closing) {
      if (out.length && out.at(-1) !== null) out.push(null);
      continue;
    }
    if (opening) out.push({ x: freezeSprintX(release.sprints, opening.dateISO), pts: opening.remainingPts, scope: opening.scopePts, hollow: openingLate(sprint) });
    if (closing) out.push({ x: freezeSprintX(release.sprints, closing.dateISO), pts: closing.remainingPts, scope: closing.scopePts, hollow: closingStale(sprint, today) });
  }
  while (out.length && out.at(-1) === null) out.pop();
  return out;
}
