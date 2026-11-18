// Derivations over the recorded past — the sprint readings (Sprint.opening /
// Sprint.closing in types.ts) rather than today's state.
//
// Everything in derive.ts reads the plan as it stands now, which is the right
// question for "can we still finish" and the wrong one for "what happened": a
// release that grew by a third reads exactly like one that was scoped right, and an
// item that slipped three sprints reads like one planned late. These functions
// answer from what was observed at the time, and from nothing else. Where a sprint
// was never observed they say so — `null`, or a `source: 'estimated'` fallback to
// the final-plan reading, never a guess presented as a record.
//
// Like derive.ts: pure, and `today` is always a parameter.

import type { Release, Sprint, SprintReading, SprintReadingItem, Status, WorkItem } from '../types';
import { addDays, todayISO, workdaysInRange } from './dates';
import { streamContention } from './derive';
import type { ReleaseRetro, SprintAllocation } from './streamAssessment';

// ── Freshness ───────────────────────────────────────────────────────────────

/** Business days a reading may miss its mark by before it is flagged: an opening
 *  taken on the sprint's second working day is still the commitment, and a closing
 *  last seen the working day before the end still describes how it ended. Counted
 *  in working days so a weekend between the last visit and a Sunday end is not
 *  mistaken for a gap. */
export const READING_TOLERANCE_WORKDAYS = 1;

/** The opening was first taken well into the sprint, so work may already have
 *  moved before the commitment was recorded. */
export const openingLate = (sp: Sprint): boolean =>
  !!sp.opening && workdaysInRange(addDays(sp.startISO, 1), sp.opening.dateISO) > READING_TOLERANCE_WORKDAYS;

/** The sprint has ended, but its closing was last refreshed well before the end —
 *  what happened in between was never seen. Never true while the sprint runs. */
export const closingStale = (sp: Sprint, today: string = todayISO()): boolean =>
  !!sp.closing &&
  sp.endISO < today &&
  workdaysInRange(addDays(sp.closing.dateISO, 1), sp.endISO) > READING_TOLERANCE_WORKDAYS;

// ── Muted streams ───────────────────────────────────────────────────────────
// A muted stream is not this team's work (WorkStream.muted) and leaves every total
// over live data; it leaves these too. Readings don't record the flag, so it is read
// from the release as it is now — the same choice the live maths makes.

const mutedIds = (release: Release): Set<string> =>
  new Set(release.workStreams.filter((ws) => ws.muted).map((ws) => ws.id));

const counted = (muted: Set<string>) => (x: { workStreamId: string | null }) =>
  x.workStreamId === null || !muted.has(x.workStreamId);

// ── Sprint review ───────────────────────────────────────────────────────────

export interface SprintReview {
  sprint: Sprint;
  /** The sprint has ended, so the closing is its last word. While it runs the
   *  review is interim and `unfinished` is simply work still open. */
  final: boolean;
  openingLate: boolean;
  closingStale: boolean;
  /** In the opening: what the sprint set out to do. Opening values. */
  committed: SprintReadingItem[];
  /** In the closing but not the opening: pulled in after planning. Closing values. */
  added: SprintReadingItem[];
  /** In the opening but not the closing: moved out (or deleted) mid-sprint. Opening
   *  values — they are the record of what was dropped. */
  removed: SprintReadingItem[];
  /** In the closing, Complete. Closing values. */
  completed: SprintReadingItem[];
  /** In the closing, not Complete — carried over, once the sprint is final. */
  unfinished: SprintReadingItem[];
  pts: {
    committed: number;
    added: number;
    removed: number;
    completed: number;
    unfinished: number;
    /** Committed items that were completed, at their OPENING points: how much of the
     *  promise was kept. Measuring at closing points would let a mid-sprint re-estimate
     *  move the answer — 3 points promised and delivered as 5 is not 167%. */
    committedCompleted: number;
  };
  /** committedCompleted / committed, as a whole percentage; null with nothing committed. */
  commitmentMetPct: number | null;
}

const ptsOf = (xs: SprintReadingItem[]) => xs.reduce((a, x) => a + (x.points ?? 0), 0);

/** What a sprint committed to, gained, dropped, finished and left — from its own
 *  readings. Null until the sprint has both (an unobserved sprint has neither; a
 *  stamped one always has both, so null means "never seen"). */
export function sprintReview(release: Release, sprint: Sprint, today: string = todayISO()): SprintReview | null {
  if (!sprint.opening || !sprint.closing) return null;
  const keep = counted(mutedIds(release));
  const opening = sprint.opening.items.filter(keep);
  const closing = sprint.closing.items.filter(keep);
  const openIds = new Set(opening.map((i) => i.id));
  const closeIds = new Set(closing.map((i) => i.id));
  const done = (s: Status) => s === 'Complete';

  const completed = closing.filter((i) => done(i.status));
  const doneIds = new Set(completed.map((i) => i.id));
  const committedCompleted = ptsOf(opening.filter((i) => doneIds.has(i.id)));
  const committedPts = ptsOf(opening);
  const unfinished = closing.filter((i) => !done(i.status));
  const added = closing.filter((i) => !openIds.has(i.id));
  const removed = opening.filter((i) => !closeIds.has(i.id));

  return {
    sprint,
    final: sprint.endISO < today,
    openingLate: openingLate(sprint),
    closingStale: closingStale(sprint, today),
    committed: opening,
    added,
    removed,
    completed,
    unfinished,
    pts: {
      committed: committedPts,
      added: ptsOf(added),
      removed: ptsOf(removed),
      completed: ptsOf(completed),
      unfinished: ptsOf(unfinished),
      committedCompleted,
    },
    commitmentMetPct: committedPts > 0 ? Math.round((committedCompleted / committedPts) * 100) : null,
  };
}

// ── Carry-over ──────────────────────────────────────────────────────────────

/** Ended unfinished this many times, an item is chronic: one slip is a sprint going
 *  long, two is a pattern worth raising. */
export const CHRONIC_SLIPS = 2;

export interface CarriedItem {
  id: string;
  key: string;
  workStreamId: string | null;
  /** Current points — the item as it stands to be discussed now. */
  points: number | null;
  /** Ended sprints whose closing held this item unfinished, release order. Not
   *  necessarily consecutive: an unobserved sprint between two slips is unknown, not
   *  a recovery, so it neither breaks nor extends the count. */
  sprintIds: string[];
  slips: number;
  chronic: boolean;
}

/**
 * Open work that has ended a sprint unfinished, worst first.
 *
 * The live model cannot see this: incomplete work rolls forward, so an item three
 * sprints late looks like one planned into the current sprint. Only items still
 * open today are reported — once something lands its history is a retro question,
 * not a standup one — and `items` should be the release's current items for that
 * reason.
 */
export function carryOver(release: Release, items: WorkItem[], today: string = todayISO()): CarriedItem[] {
  const keep = counted(mutedIds(release));
  const slipsById = new Map<string, string[]>();
  for (const sp of release.sprints) {
    if (!sp.closing || sp.endISO >= today) continue;
    for (const i of sp.closing.items) {
      if (i.status === 'Complete' || !keep(i)) continue;
      slipsById.set(i.id, [...(slipsById.get(i.id) ?? []), sp.id]);
    }
  }
  return items
    .filter((i) => i.status !== 'Complete' && slipsById.has(i.id) && keep(i))
    .map((i) => {
      const sprintIds = slipsById.get(i.id)!;
      return {
        id: i.id, key: i.key, workStreamId: i.workStreamId, points: i.points,
        sprintIds, slips: sprintIds.length, chronic: sprintIds.length >= CHRONIC_SLIPS,
      };
    })
    .sort((a, b) => b.slips - a.slips || a.key.localeCompare(b.key, undefined, { numeric: true }));
}

// ── Scope over time ─────────────────────────────────────────────────────────

export interface ScopePoint {
  dateISO: string;
  scopePts: number;
  remainingPts: number;
}

export interface SprintScope {
  sprint: Sprint;
  opening: ScopePoint | null;
  closing: ScopePoint | null;
}

export interface ScopeSeries {
  perSprint: SprintScope[];
  /** The earliest reading there is, and the sprint it belongs to. Not necessarily the
   *  release's start: history begins whenever observation did. */
  baseline: (ScopePoint & { sprintId: string }) | null;
  /** The most recent reading there is. */
  latest: (ScopePoint & { sprintId: string }) | null;
  /** latest.scopePts − baseline.scopePts. Negative when scope was cut. */
  growthPts: number;
  /** growthPts / baseline.scopePts as a whole percentage; null with no baseline scope. */
  growthPct: number | null;
}

/**
 * Release (or one stream's) scope and remaining work at each reading — the input
 * for an actual burn line and for "scope grew N% since planning".
 *
 * `workStreamId` narrows it: undefined for the whole release (muted streams out,
 * the no-stream bucket in, as the live totals count it), a stream id for that
 * stream, or null for the no-stream bucket alone.
 */
export function scopeSeries(release: Release, workStreamId?: string | null): ScopeSeries {
  const muted = mutedIds(release);
  const pick =
    workStreamId === undefined
      ? counted(muted)
      : (s: { workStreamId: string | null }) => s.workStreamId === workStreamId;
  const point = (r: SprintReading | null): ScopePoint | null => {
    if (!r) return null;
    const streams = r.streams.filter(pick);
    return {
      dateISO: r.dateISO,
      scopePts: streams.reduce((a, s) => a + s.scopePts, 0),
      remainingPts: streams.reduce((a, s) => a + s.remainingPts, 0),
    };
  };

  const perSprint = release.sprints.map((sprint) => ({ sprint, opening: point(sprint.opening), closing: point(sprint.closing) }));
  const timeline = perSprint.flatMap((s) =>
    [s.opening, s.closing].filter((p): p is ScopePoint => p !== null).map((p) => ({ ...p, sprintId: s.sprint.id })),
  );
  const baseline = timeline[0] ?? null;
  const latest = timeline.at(-1) ?? null;
  const growthPts = baseline && latest ? latest.scopePts - baseline.scopePts : 0;
  return {
    perSprint,
    baseline,
    latest,
    growthPts,
    growthPct: baseline && baseline.scopePts > 0 ? Math.round((growthPts / baseline.scopePts) * 100) : null,
  };
}

// ── Contention over time ────────────────────────────────────────────────────

export interface HistoricAllocation extends SprintAllocation {
  /** 'recorded' — from the sprint's own readings: the streams that held work then,
   *  their reservations then, the roster then. 'estimated' — never observed, so the
   *  whole-release lens's final-plan reading stands in, and must be shown as such. */
  source: 'recorded' | 'estimated';
  /** The contributing roster the contention was measured against: the reading's for
   *  a recorded sprint, today's for an estimated one. */
  contributingCount: number;
}

export interface HistoricContention {
  perSprint: HistoricAllocation[];
  overbookedSprints: number;
  judgedSprints: number;
  /** How many of `perSprint` are recorded rather than estimated. */
  recordedSprints: number;
}

/**
 * "Overbooked in N of M sprints", from what was recorded where it was recorded.
 *
 * Same question as ReleaseRetro.perSprint — the reservations of the streams that
 * held work in a sprint, against the contributing roster — asked of the readings.
 * A stream held work if either reading has an item of it. Its reservation and the
 * roster come from the closing (the latest word), else the opening. A stream
 * deleted since still counts: it was real at the time. Pass the release's
 * `assessRelease` result as `retro` for the unobserved sprints' fallback.
 */
export function historicContention(release: Release, retro: ReleaseRetro): HistoricContention {
  const muted = mutedIds(release);
  const perSprint: HistoricAllocation[] = retro.perSprint.map((estimate) => {
    const { sprint } = estimate;
    const latest = sprint.closing ?? sprint.opening;
    if (!latest) return { ...estimate, source: 'estimated', contributingCount: retro.ledger.contributingCount };
    const held = new Set(
      [...(sprint.opening?.items ?? []), ...(sprint.closing?.items ?? [])]
        .map((i) => i.workStreamId)
        .filter((id): id is string => id !== null && !muted.has(id)),
    );
    const reservation = new Map(latest.streams.map((s) => [s.workStreamId, s.engineersRequired] as const));
    const counts = [...held].map((id) => reservation.get(id) ?? null).filter((n): n is number => n != null);
    return {
      sprint,
      contention: streamContention(counts, latest.contributingCount),
      streamCount: held.size,
      idle: held.size === 0,
      source: 'recorded',
      contributingCount: latest.contributingCount,
    };
  });
  return {
    perSprint,
    overbookedSprints: perSprint.filter((s) => s.contention.overAllocated).length,
    judgedSprints: perSprint.filter((s) => !s.idle).length,
    recordedSprints: perSprint.filter((s) => s.source === 'recorded').length,
  };
}
