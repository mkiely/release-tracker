// Pure derivations — ported verbatim from proto-store.jsx. Unit-tested.

import { STATUSES, type Release, type Sprint, type StatusSeg, type Team, type WorkItem } from '../types';
import { between, todayISO, workdaysInRange } from './dates';

/** Full capacity in person-days: contributing members × the sprint's actual business days. */
export const fullCap = (team: Team | undefined, sprint: Sprint): number =>
  team ? team.members.filter((m) => !m.nonContributing).length * workdaysInRange(sprint.startISO, sprint.endISO) : 0;

/** Fraction of capacity remaining after person-days off (clamped to [0, ∞)). */
export const capPct = (team: Team | undefined, sprint: Sprint, daysOff: number): number => {
  const f = fullCap(team, sprint);
  return f > 0 ? Math.max(0, (f - daysOff) / f) : 0;
};

/** Sprint velocity in points: team velocity scaled by capacity %, rounded. */
export const sprintVel = (team: Team | undefined, sprint: Sprint, daysOff: number): number =>
  Math.round((team ? team.velocity : 0) * capPct(team, sprint, daysOff));

/**
 * Planned velocity for a sprint, in points — the point-in-time-aware reading of
 * its commitment. A frozen `plannedVelocity` baseline wins (a started sprint's
 * commitment is a historical fact and must not move when `team.velocity` later
 * changes); otherwise it derives live from the current team velocity, exactly as
 * a future sprint should. The freeze itself happens in stampStartedSprints (store);
 * this is the read side every metric uses. See docs/metrics.md.
 */
export const plannedVel = (team: Team | undefined, sprint: Sprint): number =>
  sprint.plannedVelocity ?? sprintVel(team, sprint, sprint.daysOff);

/** The sprint whose date range contains today, or null. */
export const activeSprint = (release: Release): Sprint | null =>
  release.sprints.find((s) => between(todayISO(), s.startISO, s.endISO)) || null;

/** Release events that fall inside a sprint's range, sorted ascending. */
export const eventsIn = (release: Release, sp: Sprint) =>
  release.events
    .filter((e) => between(e.dateISO, sp.startISO, sp.endISO))
    .sort((a, b) => (a.dateISO < b.dateISO ? -1 : 1));

/** Per-status counts (non-zero only) for the segmented status bar. */
export const statusSegs = (items: WorkItem[]): StatusSeg[] =>
  STATUSES.map((k) => ({ k, v: items.filter((i) => i.status === k).length })).filter((s) => s.v > 0);

/** Sum of story points across a set of work items. Null points contribute 0. */
export const sumPoints = (items: { points: number | null }[]): number =>
  items.reduce((a, i) => a + (i.points ?? 0), 0);

export interface StreamHealth {
  /** Number of work items in the stream (regardless of points). Lets the forecast
   *  tell "no items" apart from "items exist but none are estimated yet". */
  itemCount: number;
  totalPts: number;
  donePts: number;
  remainingPts: number;
  blockedPts: number;
  /** Points-based completion, 0–100. */
  pct: number;
  /** Non-zero points by status, for the progress/breakdown bar. */
  pointsByStatus: StatusSeg[];
}

/**
 * Current-state completion metrics for a work stream (points-based). Deliberately
 * carries no finish projection or on-track verdict: in this domain past sprints
 * are always fully complete (incomplete items roll forward), so a meaningful
 * "health" verdict is a forward capacity question — see docs/work-stream-health.md.
 */
export function streamHealth(items: WorkItem[]): StreamHealth {
  const pts = (pred: (i: WorkItem) => boolean) =>
    items.reduce((a, i) => (pred(i) ? a + (i.points ?? 0) : a), 0);
  const totalPts = pts(() => true);
  const donePts = pts((i) => i.status === 'Complete');
  const blockedPts = pts((i) => i.status === 'Blocked');
  const remainingPts = Math.max(0, totalPts - donePts);
  const pct = totalPts > 0 ? Math.round((donePts / totalPts) * 100) : 0;
  const pointsByStatus = STATUSES.map((k) => ({ k, v: pts((i) => i.status === k) })).filter((s) => s.v > 0);
  return { itemCount: items.length, totalPts, donePts, remainingPts, blockedPts, pct, pointsByStatus };
}

// ── Forward capacity-fit health ─────────────────────────────────────────────
// Does a work stream's remaining work fit the remaining team capacity? This is a
// FORWARD question by design: past sprints are always fully complete (incomplete
// items roll forward), so there is no past slippage to detect — see
// docs/work-stream-health.md. Assumptions are spelled out at each step.

export type HealthVerdict = 'on-track' | 'at-risk' | 'complete' | 'unconfigured' | 'unestimated';

/** Sprints whose range hasn't fully elapsed (endISO >= today). The active sprint is
 *  included; fully-past sprints are excluded — encoding the "past sprints are
 *  complete" domain rule. ISO date strings compare lexically. */
export const remainingSprints = (release: Release, today: string = todayISO()): Sprint[] =>
  release.sprints.filter((s) => s.endISO >= today);

export interface ReleaseCapacity {
  remainingSprintCount: number;
  /** Σ sprintVel over remaining sprints — capacity-adjusted (respects each sprint's daysOff). */
  teamRemainingCap: number;
  contributingCount: number;
  /** Points one engineer can deliver across the remaining sprints. 0-safe. */
  perEngineerCap: number;
}

/** Remaining team capacity for a release, split per contributing engineer. Engineers
 *  are assumed interchangeable; per-engineer velocity = team velocity ÷ contributing
 *  members. Future sprints use their own daysOff (0 unless set). */
export const releaseCapacity = (release: Release, team: Team | undefined, today: string = todayISO()): ReleaseCapacity => {
  const rem = remainingSprints(release, today);
  const teamRemainingCap = rem.reduce((a, sp) => a + sprintVel(team, sp, sp.daysOff), 0);
  const contributingCount = team ? team.members.filter((m) => !m.nonContributing).length : 0;
  const perEngineerCap = contributingCount > 0 ? teamRemainingCap / contributingCount : 0;
  return { remainingSprintCount: rem.length, teamRemainingCap, contributingCount, perEngineerCap };
};

export interface StreamContention {
  /** Σ engineersRequired over streams that still have remaining work. */
  totalRequired: number;
  overAllocated: boolean;
  /** contributingCount / totalRequired when over-allocated, else 1. In (0, 1]. */
  scale: number;
}

/** Release-level parallelism check: if the streams with remaining work collectively
 *  demand more engineers than the team has, no stream can be staffed at its full
 *  ask, so effective engineers scale down proportionally. */
export const streamContention = (activeEngineerCounts: number[], contributingCount: number): StreamContention => {
  const totalRequired = activeEngineerCounts.reduce((a, n) => a + n, 0);
  const overAllocated = contributingCount > 0 && totalRequired > contributingCount;
  const scale = overAllocated ? contributingCount / totalRequired : 1;
  return { totalRequired, overAllocated, scale };
};

export interface StreamForecast {
  verdict: HealthVerdict;
  remainingPts: number;
  engineersRequired: number | null;
  remainingSprintCount: number;
  perEngineerCap: number;
  /** engineersRequired × perEngineerCap — assumes the stream gets its full ask. */
  nominalCap: number;
  /** engineersRequired × contention.scale — what the stream realistically gets. */
  effectiveEngineers: number;
  /** effectiveEngineers × perEngineerCap. */
  effectiveCap: number;
  /** remainingPts − effectiveCap (>0 = short). */
  shortfallPts: number;
  /** Sprints needed to finish at the effective rate (Infinity if no capacity). */
  runwaySprints: number;
  /** runwaySprints − remainingSprintCount. */
  sprintsShort: number;
  /** Release is over-allocated and this stream still has work — parallelism bites. */
  contended: boolean;
  /** Plain-language one-liner for the row + modal. */
  summary: string;
}

const r0 = (n: number) => Math.round(n);

/** Forward capacity-fit forecast for one stream. Verdict is on-track when remaining
 *  work fits the contention-adjusted capacity, at-risk otherwise. */
export function streamForecast(
  health: StreamHealth,
  engineersRequired: number | null,
  ctx: ReleaseCapacity,
  contention: StreamContention,
): StreamForecast {
  const remainingPts = health.remainingPts;
  const base = {
    remainingPts,
    engineersRequired,
    remainingSprintCount: ctx.remainingSprintCount,
    perEngineerCap: ctx.perEngineerCap,
  };

  const inert = { nominalCap: 0, effectiveEngineers: 0, effectiveCap: 0, shortfallPts: 0, runwaySprints: 0, sprintsShort: 0, contended: false };

  // Items exist but none carry points yet — there's nothing to measure, so this is
  // emphatically not "complete". Checked before the other gates because no amount of
  // engineer config makes an unestimated stream assessable.
  if (health.totalPts === 0 && health.itemCount > 0) {
    const n = health.itemCount;
    return { ...base, ...inert, verdict: 'unestimated', summary: `${n} item${n === 1 ? '' : 's'} not yet estimated — add points to assess capacity fit` };
  }
  if (engineersRequired == null) {
    return { ...base, ...inert, verdict: 'unconfigured', summary: 'Set engineers required to assess capacity fit' };
  }
  if (remainingPts === 0) {
    return { ...base, ...inert, verdict: 'complete', effectiveEngineers: engineersRequired, summary: 'All work complete' };
  }

  const contended = contention.overAllocated;
  const nominalCap = engineersRequired * ctx.perEngineerCap;
  const effectiveEngineers = engineersRequired * contention.scale;
  const effectiveCap = effectiveEngineers * ctx.perEngineerCap;
  const shortfallPts = remainingPts - effectiveCap;
  const perSprintRate = ctx.remainingSprintCount > 0 ? effectiveCap / ctx.remainingSprintCount : 0;
  const runwaySprints = perSprintRate > 0 ? remainingPts / perSprintRate : Infinity;
  const sprintsShort = runwaySprints - ctx.remainingSprintCount;

  const EPS = 0.5; // points tolerance to avoid float-noise flips
  const verdict: HealthVerdict = shortfallPts > EPS ? 'at-risk' : 'on-track';

  const overbook = contended ? ` \xb7 team overbooked (${contention.totalRequired} req / ${ctx.contributingCount} avail)` : '';
  let summary: string;
  if (ctx.remainingSprintCount === 0) {
    summary = `${remainingPts} pts left, no sprints remaining → won't land`;
  } else if (!Number.isFinite(runwaySprints)) {
    summary = `${remainingPts} pts left, no forward capacity (check team velocity)`;
  } else if (verdict === 'on-track') {
    summary = `${remainingPts} pts left \xb7 ${engineersRequired} eng \xd7 ~${r0(perSprintRate)} pts/sprint \xd7 ${ctx.remainingSprintCount} = ${r0(effectiveCap)} cap → fits${overbook}`;
  } else {
    const short = Math.max(1, Math.ceil(sprintsShort));
    summary = `${remainingPts} pts left, ~${runwaySprints.toFixed(1)} sprints required at ${engineersRequired} eng → short by ~${short} sprint${short !== 1 ? 's' : ''}${overbook}`;
  }

  return { ...base, verdict, nominalCap, effectiveEngineers, effectiveCap, shortfallPts, runwaySprints, sprintsShort, contended, summary };
}

// ── Planning runway / proactive ticket creation ─────────────────────────────
// The inverse of streamForecast. streamForecast asks "is there too MUCH work for
// the remaining capacity?"; this asks "is there too LITTLE created work to fill
// the capacity we're holding for this stream?" A large unclaimed runway is both a
// "create tickets sooner" nudge AND a measurability warning: with little/no work
// planned there's nothing to forecast or measure attainment against, so the
// stream is un-judgeable rather than green. See docs/metrics.md.

export type RunwayVerdict =
  | 'unplanned' // no items at all — nothing to measure (un-judgeable)
  | 'unestimated' // items exist but none carry points (un-judgeable)
  | 'unconfigured' // engineersRequired unset — can't size the held capacity (un-judgeable)
  | 'complete' // no remaining sprints — nothing left to plan forward
  | 'under-planned' // held capacity materially exceeds created remaining work
  | 'planned'; // created work reasonably fills the held capacity

export interface StreamRunway {
  verdict: RunwayVerdict;
  /** False for the un-judgeable verdicts — a runway figure you can't stand a green behind. */
  judgeable: boolean;
  engineersRequired: number | null;
  remainingSprintCount: number;
  /** engineersRequired × perEngineerCap — capacity reserved for this stream over the remaining sprints. */
  availableCap: number;
  /** Remaining (not-Complete) points of created items, current+future (== health.remainingPts; past is complete). */
  createdRemainingPts: number;
  /** max(0, availableCap − createdRemainingPts) — capacity held but not yet planned. */
  unclaimedRunway: number;
  /** unclaimedRunway expressed in sprints of this stream's own held capacity. */
  unclaimedSprints: number;
  /** Not-Complete items planned into a sprint beyond the next one (proactive-planning signal). */
  itemsBeyondNext: number;
  /** User muted the proactive-creation alarm (e.g. research pending). Never promotes to green. */
  muted: boolean;
  /** Under-planned AND nothing created beyond the next sprint AND not muted — the "only one sprint ahead" smell. */
  alarm: boolean;
  /** Plain-language one-liner for the row + modal. */
  summary: string;
}

/** Tolerate up to ~1 sprint of unclaimed held capacity before flagging under-planned. */
const RUNWAY_SPRINT_TOLERANCE = 1;

/**
 * Forward planning-runway signal for one stream: does the created work fill the
 * capacity reserved for it over the remaining sprints? `itemsBeyondNext` and
 * `muted` are computed by the caller (active-sprint index + the stream's mute
 * flag). Un-judgeable gates run first, mirroring streamForecast — an empty or
 * unestimated stream must read as "can't tell", never as on-track.
 */
export function streamRunway(
  health: StreamHealth,
  engineersRequired: number | null,
  ctx: ReleaseCapacity,
  opts: { itemsBeyondNext: number; muted: boolean },
): StreamRunway {
  const { itemsBeyondNext, muted } = opts;
  const base = {
    engineersRequired,
    remainingSprintCount: ctx.remainingSprintCount,
    itemsBeyondNext,
    muted,
  };
  const inert = { availableCap: 0, createdRemainingPts: health.remainingPts, unclaimedRunway: 0, unclaimedSprints: 0, alarm: false };

  if (health.itemCount === 0) {
    const held = engineersRequired != null ? ` (${r0(engineersRequired * ctx.perEngineerCap)} pts reserved)` : '';
    return { ...base, ...inert, verdict: 'unplanned', judgeable: false, summary: `Nothing created${held} — unassessable until work is planned` };
  }
  if (health.totalPts === 0) {
    const n = health.itemCount;
    return { ...base, ...inert, verdict: 'unestimated', judgeable: false, summary: `${n} item${n === 1 ? '' : 's'} not yet estimated — can't tell if reserved capacity is filled` };
  }
  if (engineersRequired == null) {
    return { ...base, ...inert, verdict: 'unconfigured', judgeable: false, summary: 'Set engineers required to assess planning runway' };
  }
  if (ctx.remainingSprintCount === 0) {
    return { ...base, ...inert, verdict: 'complete', judgeable: true, summary: 'No sprints remaining — nothing left to plan' };
  }

  const availableCap = engineersRequired * ctx.perEngineerCap;
  const createdRemainingPts = health.remainingPts;
  const unclaimedRunway = Math.max(0, availableCap - createdRemainingPts);
  const perSprintHeld = availableCap / ctx.remainingSprintCount;
  const unclaimedSprints = perSprintHeld > 0 ? unclaimedRunway / perSprintHeld : 0;

  const underPlanned = unclaimedSprints > RUNWAY_SPRINT_TOLERANCE;
  const verdict: RunwayVerdict = underPlanned ? 'under-planned' : 'planned';
  // The "only planning one sprint ahead" smell: holding 2+ sprints of capacity
  // with nothing created beyond the next sprint. Mute silences the alarm only —
  // the verdict stays under-planned (never promoted to green).
  const alarm = underPlanned && itemsBeyondNext === 0 && ctx.remainingSprintCount > 1 && !muted;

  let summary: string;
  if (verdict === 'under-planned') {
    summary = `~${r0(unclaimedRunway)} pts over ${ctx.remainingSprintCount} sprint${ctx.remainingSprintCount === 1 ? '' : 's'} remaining at ${engineersRequired} eng capacity remaining`;
    if (alarm) summary += ' \xb7 nothing created beyond the next sprint';
    else if (muted && itemsBeyondNext === 0 && ctx.remainingSprintCount > 1) summary += ' \xb7 alarm muted (planning deferred)';
  } else {
    summary = unclaimedRunway > 0 ? `Reserved capacity is planned (~${r0(unclaimedRunway)} pts headroom)` : 'Reserved capacity fully planned';
  }

  return { ...base, verdict, judgeable: true, availableCap, createdRemainingPts, unclaimedRunway, unclaimedSprints, alarm, summary };
}

// ── Velocity attainment ─────────────────────────────────────────────────────
// As a release progresses, is the team actually delivering at its set velocity?
// This is a BACKWARD-looking question, the mirror of streamForecast: it measures
// elapsed sprints only. Each elapsed sprint compares points actually completed
// against that sprint's planned velocity (capacity-adjusted team velocity).

/** Sprints whose range has fully elapsed (endISO < today). ISO dates compare lexically. */
export const elapsedSprints = (release: Release, today: string = todayISO()): Sprint[] =>
  release.sprints.filter((s) => s.endISO < today);

export interface SprintVelocity {
  sprint: Sprint;
  /** Capacity-adjusted planned velocity for the sprint. */
  planned: number;
  /** Points completed in the sprint (status === 'Complete'). */
  actual: number;
}

export interface VelocityAttainment {
  /** One entry per elapsed sprint, in release order. */
  perSprint: SprintVelocity[];
  totalPlanned: number;
  totalActual: number;
  /** totalActual / totalPlanned as a percentage; null when nothing to measure. */
  attainmentPct: number | null;
  /** 'none' until a sprint has elapsed; 'on-track' within tolerance of plan, else 'under'. */
  verdict: 'on-track' | 'under' | 'none';
}

/** Points delivered vs. planned across the release's elapsed sprints. `items` should
 *  be the release's work items. On-track means delivered ≥ 90% of planned. */
export function velocityAttainment(
  release: Release,
  team: Team | undefined,
  items: WorkItem[],
  today: string = todayISO(),
): VelocityAttainment {
  const perSprint: SprintVelocity[] = elapsedSprints(release, today).map((sprint) => ({
    sprint,
    // Frozen baseline when the sprint has one, else live — so lowering the team
    // velocity can never improve a past sprint's attainment retroactively.
    planned: plannedVel(team, sprint),
    actual: sumPoints(items.filter((i) => i.sprintId === sprint.id && i.status === 'Complete')),
  }));
  const totalPlanned = perSprint.reduce((a, s) => a + s.planned, 0);
  const totalActual = perSprint.reduce((a, s) => a + s.actual, 0);
  const attainmentPct = perSprint.length === 0 || totalPlanned === 0 ? null : Math.round((totalActual / totalPlanned) * 100);
  const verdict = attainmentPct === null ? 'none' : attainmentPct >= 90 ? 'on-track' : 'under';
  return { perSprint, totalPlanned, totalActual, attainmentPct, verdict };
}

export interface VelocitySuggestion {
  /** Mean points delivered across the sampled recent elapsed sprints, rounded. */
  recentAvg: number;
  /** How many elapsed sprints fed the average (≤ the requested window). */
  sampleSize: number;
  /** The team's currently-set velocity, for comparison. */
  currentVelocity: number;
  /** recentAvg − currentVelocity (negative = delivering under the set velocity). */
  delta: number;
  /** True when the gap is material enough to suggest a change (|delta| ≥ threshold). */
  meaningful: boolean;
}

/**
 * Advisory velocity suggestion from recent delivery: the mean points actually
 * completed over the last `window` elapsed sprints, compared to the set velocity.
 * Returns null until at least one sprint has elapsed. Applying this (setting
 * `team.velocity = recentAvg`) is only safe because started sprints carry a frozen
 * `plannedVelocity` baseline — without that, changing the velocity would rewrite
 * the very attainment history this suggestion is derived from. See docs/metrics.md.
 */
export function velocitySuggestion(
  release: Release,
  team: Team | undefined,
  items: WorkItem[],
  window = 3,
  today: string = todayISO(),
): VelocitySuggestion | null {
  const elapsed = elapsedSprints(release, today);
  if (elapsed.length === 0) return null;
  const recent = elapsed.slice(-window);
  const actuals = recent.map((sp) =>
    sumPoints(items.filter((i) => i.sprintId === sp.id && i.status === 'Complete')),
  );
  const recentAvg = Math.round(actuals.reduce((a, n) => a + n, 0) / recent.length);
  const currentVelocity = team ? team.velocity : 0;
  const delta = recentAvg - currentVelocity;
  // Suggest a change only when the gap is both absolutely and relatively material,
  // to avoid nagging on noise. 3 pts or 15% of the current velocity, whichever is larger.
  const threshold = Math.max(3, Math.round(currentVelocity * 0.15));
  return { recentAvg, sampleSize: recent.length, currentVelocity, delta, meaningful: Math.abs(delta) >= threshold };
}

/**
 * Groups a flat list of items by work stream, preserving the release's stream
 * order. Items whose workStreamId is absent from the stream list (or null) are
 * collected into a trailing "unassigned" group. Groups with no items are
 * omitted entirely.
 */
export function groupItemsByStream(
  items: WorkItem[],
  workStreams: { id: string; name: string }[],
): Array<{ wsId: string | null; wsName: string | null; items: WorkItem[] }> {
  const groups: Array<{ wsId: string | null; wsName: string | null; items: WorkItem[] }> = [];
  const placed = new Set<string | null>();
  for (const ws of workStreams) {
    const its = items.filter((i) => i.workStreamId === ws.id);
    if (its.length) {
      groups.push({ wsId: ws.id, wsName: ws.name, items: its });
      placed.add(ws.id);
    }
  }
  const unassigned = items.filter((i) => !placed.has(i.workStreamId));
  if (unassigned.length) groups.push({ wsId: null, wsName: null, items: unassigned });
  return groups;
}
