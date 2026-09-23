// Pure derivations over the domain model — capacity, velocity, health, runway.
//
// Everything here is a function of its arguments alone: no store access, no
// dates read from the clock unless passed in. That's what makes the planning
// maths testable, and it's why `today` is a parameter throughout.

import { STATUSES, type PlanningState, type Release, type Sprint, type StatusSeg, type Team, type WorkItem, type WorkStream } from '../types';
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
 *
 * A `0` (or null) baseline means "no real baseline" — never a genuine commitment of
 * zero points. It re-derives live, so a sprint that started while the team velocity
 * was still unset (0 — the default for connector releases) picks up a meaningful
 * planned figure the moment a velocity is set, instead of being trapped at 0.
 */
export const plannedVel = (team: Team | undefined, sprint: Sprint): number =>
  sprint.plannedVelocity || sprintVel(team, sprint, sprint.daysOff);

/** The sprint whose date range contains today, or null. */
export const activeSprint = (release: Release): Sprint | null =>
  release.sprints.find((s) => between(todayISO(), s.startISO, s.endISO)) || null;

/** Release events that fall inside a sprint's range, sorted ascending. */
export const eventsIn = (release: Release, sp: Sprint) =>
  release.events
    .filter((e) => between(e.dateISO, sp.startISO, sp.endISO))
    .sort((a, b) => (a.dateISO < b.dateISO ? -1 : 1));

/** Calendar chip shown on a sprint row/header — either a stored ReleaseEvent or the
 *  app-derived code-freeze marker (see CODE_FREEZE_CHIP_ID). `critical` drives the
 *  warning tone so the freeze reads as more consequential than a routine milestone;
 *  unlike a real ReleaseEvent it isn't user-editable from the chip — the code freeze
 *  has its own dedicated editor (release settings / work-stream override). */
export interface EventChip {
  id: string;
  label: string;
  dateISO: string;
  critical?: boolean;
}

/** Sentinel id for the synthesized code-freeze chip — not a real ReleaseEvent. */
export const CODE_FREEZE_CHIP_ID = 'code-freeze';

/** Prefix for a work stream's own freeze chip: `code-freeze:<wsId>`. */
const STREAM_FREEZE_CHIP_PREFIX = 'code-freeze:';

/** What an event chip's id points at: the release freeze editor, one work stream's
 *  freeze override, or (null) a real ReleaseEvent. Callers own the modal mapping —
 *  this keeps the sentinel ids from leaking as magic strings into every hook. */
export const parseFreezeChipId = (id: string): { kind: 'release' } | { kind: 'stream'; wsId: string } | null => {
  if (id === CODE_FREEZE_CHIP_ID) return { kind: 'release' };
  if (id.startsWith(STREAM_FREEZE_CHIP_PREFIX)) return { kind: 'stream', wsId: id.slice(STREAM_FREEZE_CHIP_PREFIX.length) };
  return null;
};

/** One chip per work stream whose OWN freeze override (not the inherited release
 *  date) falls inside this sprint. A stream that pins its override to the release
 *  date still gets a chip: the row then agrees with the header's "+N" count, and
 *  the two chips say different things — when the release freezes, and that this
 *  stream is pinned there rather than following it. */
const streamFreezeChips = (release: Release, sp: Sprint): EventChip[] =>
  release.workStreams
    .filter((ws) => ws.codeFreezeISO != null && between(ws.codeFreezeISO, sp.startISO, sp.endISO))
    .map((ws) => ({ id: `${STREAM_FREEZE_CHIP_PREFIX}${ws.id}`, label: `${ws.name} freeze`, dateISO: ws.codeFreezeISO!, critical: true }));

/** eventsIn, plus the synthesized freeze chips landing in this sprint: the release's
 *  effective freeze (see effectiveCodeFreeze) and every work-stream override. Without
 *  the latter a stream's own deadline was invisible outside its own screen. */
export const sprintEventChips = (release: Release, sp: Sprint): EventChip[] => {
  const chips: EventChip[] = [...eventsIn(release, sp), ...streamFreezeChips(release, sp)];
  const freeze = effectiveCodeFreeze(release);
  if (between(freeze, sp.startISO, sp.endISO)) {
    chips.push({ id: CODE_FREEZE_CHIP_ID, label: 'Code freeze', dateISO: freeze, critical: true });
  }
  return chips.sort((a, b) => (a.dateISO < b.dateISO ? -1 : 1));
};

/** The work streams overriding the release freeze with their own date, earliest
 *  first — the header readout's "+N" and the freeze editor's listing both need the
 *  names, not just the count. */
export const freezeOverrides = (release: Release): Array<{ id: string; name: string; dateISO: string }> =>
  release.workStreams
    .filter((ws) => ws.codeFreezeISO != null)
    .map((ws) => ({ id: ws.id, name: ws.name, dateISO: ws.codeFreezeISO! }))
    .sort((a, b) => (a.dateISO < b.dateISO ? -1 : 1));

/** The code-freeze chip for one work stream in a sprint — its own override wins
 *  (see effectiveStreamCodeFreeze), else the release's. Drives the freeze marker in
 *  the work-stream views, which show one stream's own deadline rather than the
 *  release's events. `ws` is null for the Unassigned bucket. Returns null when the
 *  effective freeze doesn't fall inside this sprint's range. */
export const streamCodeFreezeChip = (release: Release, sp: Sprint, ws: WorkStream | null): EventChip | null => {
  const freeze = effectiveStreamCodeFreeze(release, ws);
  if (!between(freeze, sp.startISO, sp.endISO)) return null;
  return { id: CODE_FREEZE_CHIP_ID, label: 'Code freeze', dateISO: freeze, critical: true };
};

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

export type HealthVerdict = 'on-track' | 'at-risk' | 'complete' | 'no-work' | 'unconfigured' | 'unestimated';

/** Effective code check-in deadline for the release: an explicit codeFreezeISO wins;
 *  otherwise it defaults to the last sprint's end (no artificial cutoff). */
export const effectiveCodeFreeze = (release: Release): string =>
  release.codeFreezeISO ?? release.sprints[release.sprints.length - 1]?.endISO ?? release.startISO;

/** Effective code freeze for one work stream: its own override wins (when set),
 *  else the release's effective freeze. `ws` is null for the Unassigned bucket. */
export const effectiveStreamCodeFreeze = (release: Release, ws: WorkStream | null): string =>
  ws?.codeFreezeISO ?? effectiveCodeFreeze(release);

/** Fractional sprint-index x-position of a date across a release's sprints, for the
 *  burndown chart's freeze marker and burn boundary: `i` at the left edge of sprint i,
 *  `i + f` a fraction f (by workdays, mirroring sprintFreezeFactor) into sprint i, and
 *  `sprints.length` at/after the last sprint's end. Keeps the drawn freeze line sitting
 *  exactly where the capacity model cuts the freeze sprint. */
export const freezeSprintX = (sprints: Sprint[], dateISO: string): number => {
  for (let i = 0; i < sprints.length; i++) {
    const sp = sprints[i];
    if (dateISO < sp.startISO) return i;
    if (dateISO <= sp.endISO) {
      const total = workdaysInRange(sp.startISO, sp.endISO);
      const frac = total > 0 ? workdaysInRange(sp.startISO, dateISO) / total : 0;
      return i + Math.min(1, Math.max(0, frac));
    }
  }
  return sprints.length;
};

/** Sprints whose range hasn't fully elapsed (endISO >= today) AND that start on or
 *  before the code freeze (no work can land in a sprint that starts after it). The
 *  active sprint is included; fully-past sprints are excluded — encoding the "past
 *  sprints are complete" domain rule. ISO date strings compare lexically. */
export const remainingSprints = (
  release: Release,
  today: string = todayISO(),
  freezeISO: string = effectiveCodeFreeze(release),
): Sprint[] => release.sprints.filter((s) => s.endISO >= today && s.startISO <= freezeISO);

/** Fraction of a sprint's capacity that lands before the code freeze: 1 for sprints
 *  ending on/before it, 0 for ones starting after it (already excluded upstream by
 *  remainingSprints, but kept total here for safety), and prorated by workdays for
 *  the one sprint the freeze date falls inside. */
const sprintFreezeFactor = (sprint: Sprint, freezeISO: string): number => {
  if (sprint.endISO <= freezeISO) return 1;
  if (sprint.startISO > freezeISO) return 0;
  const total = workdaysInRange(sprint.startISO, sprint.endISO);
  return total > 0 ? workdaysInRange(sprint.startISO, freezeISO) / total : 0;
};

export interface RemainingSplit {
  /** Not-Complete points that, as scheduled, land on/before the freeze: items in a
   *  sprint starting on/before it, plus unassigned (null-sprint) items — the work that
   *  competes for the pre-freeze capacity window and is measured for capacity fit. */
  preFreezePts: number;
  /** Not-Complete points parked in sprints that start AFTER the freeze — scheduled
   *  work that won't land by the freeze as things stand. Surfaced as a callout rather
   *  than folded into the fit math. */
  postFreezePts: number;
}

/** Split a stream's remaining (not-Complete) points into pre- vs post-freeze by each
 *  item's sprint start relative to `freezeISO`, using the same boundary as
 *  remainingSprints (a sprint counts as pre-freeze when it starts on/before the freeze).
 *  Unassigned (null-sprint) items count as pre-freeze — they still need to land. This
 *  is what keeps the capacity-fit forecast from measuring deliberately post-freeze work
 *  against the pre-freeze window (which over-flagged at-risk). Pure. */
export const remainingByFreeze = (
  items: WorkItem[],
  sprints: Sprint[],
  freezeISO: string,
): RemainingSplit => {
  let preFreezePts = 0;
  let postFreezePts = 0;
  for (const i of items) {
    if (i.status === 'Complete') continue;
    const pts = i.points ?? 0;
    const sp = i.sprintId != null ? sprints.find((s) => s.id === i.sprintId) : undefined;
    if (sp && sp.startISO > freezeISO) postFreezePts += pts;
    else preFreezePts += pts;
  }
  return { preFreezePts, postFreezePts };
};

export interface ReleaseCapacity {
  remainingSprintCount: number;
  /** Σ sprintVel over remaining sprints — capacity-adjusted (respects each sprint's
   *  daysOff and, for the sprint the code freeze falls inside, prorated to only the
   *  portion of it before the freeze). */
  teamRemainingCap: number;
  contributingCount: number;
  /** Points one engineer can deliver across the remaining sprints. 0-safe. */
  perEngineerCap: number;
}

/** Remaining team capacity for a release (or one work stream's effective freeze,
 *  when it overrides the release's), split per contributing engineer. Engineers are
 *  assumed interchangeable; per-engineer velocity = team velocity ÷ contributing
 *  members. Future sprints use their own daysOff (0 unless set). */
export const releaseCapacity = (
  release: Release,
  team: Team | undefined,
  today: string = todayISO(),
  freezeISO: string = effectiveCodeFreeze(release),
): ReleaseCapacity => {
  const rem = remainingSprints(release, today, freezeISO);
  const teamRemainingCap = rem.reduce((a, sp) => a + sprintVel(team, sp, sp.daysOff) * sprintFreezeFactor(sp, freezeISO), 0);
  const contributingCount = team ? team.members.filter((m) => !m.nonContributing).length : 0;
  const perEngineerCap = contributingCount > 0 ? teamRemainingCap / contributingCount : 0;
  return { remainingSprintCount: rem.length, teamRemainingCap, contributingCount, perEngineerCap };
};

/** Remaining capacity for ONE stream, honoring its code-freeze override (falls back to
 *  the release's freeze when unset). `baseCtx` is the release-level capacity to reuse for
 *  the common no-override case, so we only recompute when a stream truly overrides. `ws`
 *  null → Unassigned (no override). The single source of the per-stream capacity window,
 *  shared by every forecast/runway consumer so a stream reads the same everywhere. */
export const streamCapacityCtx = (
  release: Release,
  team: Team | undefined,
  ws: WorkStream | null,
  baseCtx: ReleaseCapacity,
  today: string = todayISO(),
): ReleaseCapacity =>
  ws?.codeFreezeISO != null ? releaseCapacity(release, team, today, effectiveStreamCodeFreeze(release, ws)) : baseCtx;

// ── Whole-release ledger (retrospective) ────────────────────────────────────
// Every capacity figure above measures what is LEFT: remaining sprints against
// remaining points. That is the right question for "can we still finish", but it
// means the verdict improves by completion alone — a release overbooked for its
// whole cycle reads identically to one comfortably staffed throughout, because
// finished streams drop out of the numerator.
//
// This is the same maths over the release's FULL window: every sprint, every
// point, complete or not. Nothing here shrinks as work lands, so it answers a
// question the forward view structurally cannot — how the release ran, not how it
// ends. See docs/capacity-history.md.
//
// It is a final-plan reading, not a time series: engineersRequired, the roster and
// each item's sprint are read at their current values, so a mid-release change in
// any of them is reported as though it had always been so. Genuine point-in-time
// history needs a stored record (that doc's Track C). What makes the capacity side
// honest anyway is plannedVel — a started sprint's commitment is frozen, so
// elapsed sprints contribute what they actually committed.

export interface ReleaseLedger {
  /** Every sprint that can hold work (i.e. starts on/before the freeze), not just
   *  the ones still to come. */
  sprintCount: number;
  /** Σ plannedVel over those sprints, prorated at the freeze — the capacity the
   *  release had in total, using each started sprint's frozen baseline. */
  totalCap: number;
  contributingCount: number;
  /** Points one engineer could deliver across the whole release. 0-safe. */
  perEngineerCap: number;
}

/** Whole-release capacity: the retrospective counterpart to {@link releaseCapacity},
 *  summing every sprint rather than only those still remaining. Takes no `today` —
 *  that is the entire point, and is why the figure is stable as the release runs. */
export const releaseLedger = (
  release: Release,
  team: Team | undefined,
  freezeISO: string = effectiveCodeFreeze(release),
): ReleaseLedger => {
  const inWindow = release.sprints.filter((sp) => sp.startISO <= freezeISO);
  const totalCap = inWindow.reduce((a, sp) => a + plannedVel(team, sp) * sprintFreezeFactor(sp, freezeISO), 0);
  const contributingCount = team ? team.members.filter((m) => !m.nonContributing).length : 0;
  return {
    sprintCount: inWindow.length,
    totalCap,
    contributingCount,
    perEngineerCap: contributingCount > 0 ? totalCap / contributingCount : 0,
  };
};

export interface StreamContention {
  /** Σ engineersRequired over the streams the caller supplied — those with work
   *  REMAINING for the forward view, those that carried any work at all for the
   *  whole-release one. */
  totalRequired: number;
  overAllocated: boolean;
  /** contributingCount / totalRequired when over-allocated, else 1. In (0, 1]. */
  scale: number;
}

/** Parallelism check: if the supplied streams collectively demand more engineers
 *  than the team has, no stream can be staffed at its full ask, so effective
 *  engineers scale down proportionally. Which streams count is the caller's call —
 *  see assessStreams (remaining work) vs. assessRelease (all work). */
export const streamContention = (activeEngineerCounts: number[], contributingCount: number): StreamContention => {
  const totalRequired = activeEngineerCounts.reduce((a, n) => a + n, 0);
  const overAllocated = contributingCount > 0 && totalRequired > contributingCount;
  const scale = overAllocated ? contributingCount / totalRequired : 1;
  return { totalRequired, overAllocated, scale };
};

export interface StreamForecast {
  verdict: HealthVerdict;
  /** Remaining (not-Complete) points measured for capacity fit — the PRE-freeze
   *  portion when a split is supplied, else all remaining points. Post-freeze work is
   *  reported separately in `postFreezeRemainingPts`. */
  remainingPts: number;
  /** Not-Complete points scheduled into sprints after the (effective) freeze — work
   *  that, as planned, won't land by then. Kept out of the fit math and surfaced as a
   *  callout. 0 when nothing is parked past the freeze (or no split was supplied). */
  postFreezeRemainingPts: number;
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
  remainingPreFreezePts: number = health.remainingPts,
): StreamForecast {
  // The fit math runs on PRE-freeze remaining work only (default: all remaining, when
  // no split is supplied). Post-freeze work is scheduled past the deadline and can't
  // land by it, so it rides as a callout rather than inflating the capacity shortfall.
  const remainingPts = remainingPreFreezePts;
  const postFreezeRemainingPts = Math.max(0, health.remainingPts - remainingPts);
  const postNote = postFreezeRemainingPts > 0 ? ` \xb7 ${r0(postFreezeRemainingPts)} pts scheduled after freeze` : '';
  const base = {
    remainingPts,
    postFreezeRemainingPts,
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
  // Nothing was ever created. Checked BEFORE the remaining-work gate, which would
  // otherwise read 0 remaining as "all work complete" and paint an empty stream green
  // — the "0 created masquerading as 0 remaining" failure docs/metrics.md warns about.
  // The planning runway carries the consequence (capacity held against nothing).
  if (health.itemCount === 0) {
    return { ...base, ...inert, verdict: 'no-work', summary: 'No work items created — nothing to forecast' };
  }
  // "Complete" is a fact about ALL remaining work, not just the pre-freeze slice — a
  // stream with work parked after the freeze isn't done.
  if (health.remainingPts === 0) {
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
  // Work with nowhere left to land. An empty pre-freeze slice reads as a trivial fit
  // (shortfall 0 − 0), which is right while the freeze is still AHEAD — that work was
  // deliberately parked past it. Once the window is gone the same arithmetic paints a
  // stream that has already missed its freeze green, so the un-landable remainder is
  // measured in full rather than through the pre-freeze split.
  const strandedPts = ctx.remainingSprintCount === 0 ? health.remainingPts : 0;
  const verdict: HealthVerdict = shortfallPts > EPS || strandedPts > EPS ? 'at-risk' : 'on-track';

  const overbook = contended ? ` \xb7 team overbooked (${contention.totalRequired} req / ${ctx.contributingCount} avail)` : '';
  let summary: string;
  if (strandedPts > EPS && remainingPts === 0) {
    // The freeze is behind us and everything left sits past it — the case that used to
    // read "Nothing due before freeze" and score green.
    summary = `Freeze passed with ${r0(strandedPts)} pts outstanding → won't land in this window`;
  } else if (remainingPts === 0) {
    // All remaining work is parked after a freeze that is still ahead — nothing is due
    // before it, so the pre-freeze window fits trivially. The callout carries the rest.
    summary = `Nothing due before freeze${postNote}`;
  } else if (ctx.remainingSprintCount === 0) {
    summary = `${remainingPts} pts left, no sprints remaining → won't land${postNote}`;
  } else if (!Number.isFinite(runwaySprints)) {
    summary = `${remainingPts} pts left, no forward capacity (check team velocity)${postNote}`;
  } else if (verdict === 'on-track') {
    summary = `${remainingPts} pts left \xb7 ${engineersRequired} eng \xd7 ~${r0(perSprintRate)} pts/sprint \xd7 ${ctx.remainingSprintCount} = ${r0(effectiveCap)} cap → fits${overbook}${postNote}`;
  } else {
    const short = Math.max(1, Math.ceil(sprintsShort));
    const rem = ctx.remainingSprintCount;
    summary = `${remainingPts} pts left, ~${runwaySprints.toFixed(1)} sprints required at ${engineersRequired} eng → short by ~${short} sprint${short !== 1 ? 's' : ''} (${rem} sprint${rem === 1 ? ' remains' : 's remain'})${overbook}${postNote}`;
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
  | 'under-planned' // held capacity materially exceeds created remaining work (planning still open)
  | 'over-reserved' // planning is COMPLETE, yet reserved engineers exceed the defined scope
  | 'planned'; // created work reasonably fills the held capacity

export interface StreamRunway {
  verdict: RunwayVerdict;
  /** False for the un-judgeable verdicts — a runway figure you can't stand a green behind. */
  judgeable: boolean;
  engineersRequired: number | null;
  remainingSprintCount: number;
  /** Effective (contention-adjusted) capacity reserved for this stream over the
   *  remaining sprints — engineersRequired × contention.scale × perEngineerCap.
   *  Uses the SAME capacity baseline as streamForecast so a stream can never be
   *  both "too much work" (at-risk) and "too little created" (under-planned) at
   *  once (see docs/metrics.md "Reconciling at-risk vs under-planned"). */
  availableCap: number;
  /** Remaining (not-Complete) points of created items, current+future (== health.remainingPts; past is complete). */
  createdRemainingPts: number;
  /** max(0, availableCap − createdRemainingPts) — capacity held but not yet planned. */
  unclaimedRunway: number;
  /** unclaimedRunway expressed in sprints of this stream's own held capacity. */
  unclaimedSprints: number;
  /** unclaimedRunway when the verdict is `over-reserved` (planning complete, capacity
   *  held beyond the defined scope), else 0 — the points a scope-complete stream could
   *  give back. Feeds the release-level reservationBalance roll-up. */
  overReservedPts: number;
  /** perEngineerCap for this stream's window, so the roll-up can convert points of
   *  slack/shortfall into engineer-equivalents. 0 when there's no forward capacity. */
  perEngineerCap: number;
  /** Not-Complete items planned into a sprint beyond the next one (proactive-planning signal). */
  itemsBeyondNext: number;
  /** The stream's planning posture (see WorkStream.planningState) — drives whether
   *  unclaimed capacity reads as under-planned (open), muted (deferred), or
   *  over-reserved (complete). */
  planningState: PlanningState;
  /** User silenced the proactive-creation alarm (planningState === 'deferred').
   *  Never promotes to green. Named for the alarm, not the stream: WorkStream.muted
   *  is an unrelated flag meaning "not this team's work at all". */
  alarmMuted: boolean;
  /** Under-planned AND nothing created beyond the next sprint AND the alarm isn't
   *  silenced — the "only one sprint ahead" smell. */
  alarm: boolean;
  /** Release is over-allocated, so this stream's reserved capacity was scaled down. */
  contended: boolean;
  /** Plain-language one-liner for the row + modal. */
  summary: string;
}

/** Tolerate up to ~1 sprint of unclaimed held capacity before flagging under-planned. */
const RUNWAY_SPRINT_TOLERANCE = 1;

/**
 * Forward planning-runway signal for one stream: does the created work fill the
 * capacity reserved for it over the remaining sprints? Measured against the same
 * contention-adjusted EFFECTIVE capacity as streamForecast (so the two verdicts
 * sit on one spectrum and can't contradict — an overbooked, over-capacity stream
 * reads at-risk on the forecast and simply "not under-planned" here, rather than
 * paradoxically holding "unclaimed" capacity the team can't actually provide).
 * `contention` is the release-level parallelism check; `itemsBeyondNext` and
 * `planningState` come from the caller. Un-judgeable gates run first, mirroring
 * streamForecast — an empty or unestimated stream reads "can't tell", never green.
 *
 * `planningState` shapes how unclaimed capacity reads: `'open'` → under-planned (+
 * proactive-creation alarm); `'deferred'` → same but the alarm is muted; `'complete'`
 * → the created work IS the whole scope, so unclaimed capacity is OVER-reservation
 * (engineers held beyond the defined scope) rather than a planning gap.
 */
export function streamRunway(
  health: StreamHealth,
  engineersRequired: number | null,
  ctx: ReleaseCapacity,
  contention: StreamContention,
  opts: { itemsBeyondNext: number; planningState: PlanningState; remainingPreFreezePts?: number },
): StreamRunway {
  const { itemsBeyondNext, planningState } = opts;
  const alarmMuted = planningState === 'deferred';
  const scopeComplete = planningState === 'complete';
  const contended = contention.overAllocated;
  const base = {
    engineersRequired,
    remainingSprintCount: ctx.remainingSprintCount,
    overReservedPts: 0,
    perEngineerCap: ctx.perEngineerCap,
    itemsBeyondNext,
    planningState,
    alarmMuted,
    contended,
  };
  const inert = { availableCap: 0, createdRemainingPts: health.remainingPts, unclaimedRunway: 0, unclaimedSprints: 0, alarm: false };

  // A scope-complete stream can legitimately have no/unestimated items (it's declaring
  // "this is all the work"), so it skips the "unplanned" gate and flows to the
  // reservation check below — where held-but-unbacked capacity reads as over-reserved.
  if (health.itemCount === 0 && !scopeComplete) {
    const held = engineersRequired != null ? ` (${r0(engineersRequired * contention.scale * ctx.perEngineerCap)} pts reserved)` : '';
    return { ...base, ...inert, verdict: 'unplanned', judgeable: false, summary: `Nothing created${held} — unassessable until work is planned` };
  }
  if (health.itemCount > 0 && health.totalPts === 0) {
    const n = health.itemCount;
    return { ...base, ...inert, verdict: 'unestimated', judgeable: false, summary: `${n} item${n === 1 ? '' : 's'} not yet estimated — can't tell if reserved capacity is filled` };
  }
  if (engineersRequired == null) {
    return { ...base, ...inert, verdict: 'unconfigured', judgeable: false, summary: 'Set engineers required to assess planning runway' };
  }
  if (ctx.remainingSprintCount === 0) {
    return { ...base, ...inert, verdict: 'complete', judgeable: true, summary: 'No sprints remaining — nothing left to plan' };
  }

  // Effective capacity: the stream's share after the release-level contention scale,
  // matching streamForecast.effectiveCap. When the release is overbooked this shrinks,
  // so "unclaimed runway" reflects capacity the team can REALISTICALLY give the stream.
  const availableCap = engineersRequired * contention.scale * ctx.perEngineerCap;
  // Only pre-freeze remaining work competes for the reserved (pre-freeze) window;
  // work parked after the freeze mustn't mask an under-planned window (default: all
  // remaining, when no split is supplied).
  const createdRemainingPts = opts.remainingPreFreezePts ?? health.remainingPts;
  const unclaimedRunway = Math.max(0, availableCap - createdRemainingPts);
  const perSprintHeld = availableCap / ctx.remainingSprintCount;
  const unclaimedSprints = perSprintHeld > 0 ? unclaimedRunway / perSprintHeld : 0;
  const materialSlack = unclaimedSprints > RUNWAY_SPRINT_TOLERANCE;

  let verdict: RunwayVerdict;
  let alarm = false;
  let summary: string;

  if (scopeComplete) {
    // Planning is done — the created work is the whole scope. Leftover reserved
    // capacity is over-reservation (engineers held beyond what the scope needs), not a
    // planning gap. Never alarms; the release-level roll-up turns it into a rebalancing
    // suggestion.
    verdict = materialSlack ? 'over-reserved' : 'planned';
    if (verdict === 'over-reserved') {
      const backing = createdRemainingPts / perSprintHeld; // sprints of work the reservation actually has
      summary = `Scope complete: ~${r0(unclaimedRunway)} pts of reserved capacity beyond defined scope (${engineersRequired} eng holds ~${ctx.remainingSprintCount} sprint${ctx.remainingSprintCount === 1 ? '' : 's'}, scope needs ~${backing.toFixed(1)})`;
    } else {
      summary = 'Scope complete: reserved capacity matches defined work';
    }
  } else {
    const underPlanned = materialSlack;
    verdict = underPlanned ? 'under-planned' : 'planned';
    // The "only planning one sprint ahead" smell: holding 2+ sprints of capacity
    // with nothing created beyond the next sprint. Mute silences the alarm only —
    // the verdict stays under-planned (never promoted to green).
    alarm = underPlanned && itemsBeyondNext === 0 && ctx.remainingSprintCount > 1 && !alarmMuted;
    if (underPlanned) {
      summary = `~${r0(unclaimedRunway)} pts over ${ctx.remainingSprintCount} sprint${ctx.remainingSprintCount === 1 ? '' : 's'} remaining at ${engineersRequired} eng capacity remaining`;
      if (alarm) summary += ' \xb7 nothing created beyond the next sprint';
      else if (alarmMuted && itemsBeyondNext === 0 && ctx.remainingSprintCount > 1) summary += ' \xb7 alarm muted (planning deferred)';
      else if (contended) summary += ' \xb7 capacity scaled for team overbooking';
    } else {
      summary = unclaimedRunway > 0 ? `Reserved capacity is planned (~${r0(unclaimedRunway)} pts headroom)` : 'Reserved capacity fully planned';
    }
  }

  const overReservedPts = verdict === 'over-reserved' ? unclaimedRunway : 0;
  return { ...base, verdict, judgeable: true, availableCap, createdRemainingPts, unclaimedRunway, unclaimedSprints, overReservedPts, alarm, summary };
}

// ── Reservation balance (work vs engineers assigned) ────────────────────────
// The release-level pairing of the two per-stream signals: streams that are at-risk
// (too much work for their reserved engineers) against streams that are over-reserved
// (scope complete, engineers held beyond the defined work). When both exist, reserved
// engineers could move from the latter to the former — a rebalancing suggestion, not
// an alarm. Only scope-complete slack counts as movable: an open stream's "unclaimed"
// capacity might just be tickets not written yet, so it isn't offered up.

export interface ReservationInput {
  name: string;
  /** streamForecast.shortfallPts (counted only when the stream is at-risk). */
  shortfallPts: number;
  atRisk: boolean;
  /** streamRunway.overReservedPts (non-zero only for scope-complete streams). */
  overReservedPts: number;
  /** Per-engineer capacity for the stream's window, to convert points ↔ engineers. */
  perEngineerCap: number;
}

export interface ReservationBalance {
  /** Σ engineer-equivalents of over-reserved capacity across scope-complete streams. */
  overReservedEngineers: number;
  /** Σ engineer-equivalents of shortfall across at-risk streams. */
  shortEngineers: number;
  /** Stream names contributing over-reservation / shortfall, largest first. */
  overReservedStreams: string[];
  shortStreams: string[];
  /** Meaningful slack exists that could cover meaningful shortfall. */
  rebalanceable: boolean;
  /** Plain-language rebalancing suggestion, or '' when there's nothing to suggest. */
  summary: string;
}

/** ~half an engineer of slack AND shortfall before a rebalance is worth surfacing. */
const RESERVATION_ENGINEER_TOLERANCE = 0.5;

/** Pair over-reserved (scope-complete) streams against at-risk ones to spot reserved
 *  engineers that could be redeployed. Pure; callers supply per-stream forecast/runway
 *  figures. Engineer-equivalents use each stream's own perEngineerCap (freeze overrides
 *  can differ), so points are converted per-stream before summing. */
export function reservationBalance(streams: ReservationInput[]): ReservationBalance {
  const toEng = (pts: number, cap: number) => (cap > 0 ? pts / cap : 0);
  const over = streams
    .map((s) => ({ name: s.name, eng: toEng(s.overReservedPts, s.perEngineerCap) }))
    .filter((s) => s.eng > 0)
    .sort((a, b) => b.eng - a.eng);
  const short = streams
    .map((s) => ({ name: s.name, eng: s.atRisk ? toEng(Math.max(0, s.shortfallPts), s.perEngineerCap) : 0 }))
    .filter((s) => s.eng > 0)
    .sort((a, b) => b.eng - a.eng);
  const overReservedEngineers = over.reduce((a, s) => a + s.eng, 0);
  const shortEngineers = short.reduce((a, s) => a + s.eng, 0);
  const rebalanceable =
    overReservedEngineers >= RESERVATION_ENGINEER_TOLERANCE && shortEngineers >= RESERVATION_ENGINEER_TOLERANCE;
  const movable = Math.min(overReservedEngineers, shortEngineers);
  const summary = rebalanceable
    ? `~${movable.toFixed(1)} eng could shift from ${over.map((s) => s.name).join(', ')} (scope complete) to ${short.map((s) => s.name).join(', ')} (at risk)`
    : '';
  return {
    overReservedEngineers,
    shortEngineers,
    overReservedStreams: over.map((s) => s.name),
    shortStreams: short.map((s) => s.name),
    rebalanceable,
    summary,
  };
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
  /** 'none' until a sprint has elapsed; 'no-baseline' when sprints have elapsed but
   *  there's no planned total to measure against (team velocity unset — the default
   *  for connector releases); 'on-track' within tolerance of plan, else 'under'. */
  verdict: 'on-track' | 'under' | 'none' | 'no-baseline';
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
  // Two distinct "can't measure" states share attainmentPct === null: no elapsed
  // sprints at all ('none') vs. elapsed sprints with no velocity baseline to compare
  // against ('no-baseline'). Callers surface very different copy for each.
  const verdict: VelocityAttainment['verdict'] =
    perSprint.length === 0 ? 'none' : totalPlanned === 0 ? 'no-baseline' : attainmentPct! >= 90 ? 'on-track' : 'under';
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
