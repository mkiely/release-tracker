// The per-stream assessment pipeline, in one place.
//
// Every consumer that shows a work stream's verdicts needs the same six steps in
// the same order: release capacity → per-stream health → release-level contention
// → each stream's own freeze window → the pre/post-freeze split → forecast and
// runway. The order is not incidental. Contention needs every stream's remaining
// work before any single stream can be forecast, and forecast and runway must be
// handed the SAME capacity baseline or a stream can read both "too much work" and
// "too little work planned" at once (docs/metrics.md, "Reconciling at-risk vs
// under-planned").
//
// That sequence was copied into five callers — the release view model, the metrics
// modal, the TSV export, the exec-summary snapshot and the stream health modal —
// each free to drift in exactly the way that reconciliation forbids. This module is
// the single source; callers pick the fields they render.
//
// Pure: `today` is a parameter, nothing reads the store.

import type { PlanningState, Release, Sprint, Team, WorkItem, WorkStream } from '../types';
import { todayISO } from './dates';
import {
  effectiveStreamCodeFreeze,
  releaseCapacity,
  releaseLedger,
  remainingByFreeze,
  streamCapacityCtx,
  streamContention,
  streamForecast,
  streamHealth,
  streamRunway,
  sumPoints,
  type ReleaseCapacity,
  type ReleaseLedger,
  type StreamContention,
  type StreamForecast,
  type StreamHealth,
  type StreamRunway,
} from './derive';

/** One stream's complete assessment. `ws` is null for the Unassigned bucket, which
 *  has no engineer reservation and so always reads as unconfigured. */
export interface StreamAssessment {
  ws: WorkStream | null;
  items: WorkItem[];
  health: StreamHealth;
  forecast: StreamForecast;
  runway: StreamRunway;
  /** This stream's capacity window — its own freeze override, or the release's. */
  ctx: ReleaseCapacity;
  /** Remaining points landing on/before this stream's effective freeze. */
  preFreezePts: number;
  /** Remaining points parked in sprints starting after it — the work neither verdict
   *  measures, surfaced separately so it can't hide behind a green chip. */
  postFreezePts: number;
}

export interface ReleaseAssessment {
  /** Release-level remaining capacity (no per-stream freeze override applied). */
  ctx: ReleaseCapacity;
  /** Release-level parallelism check, shared by every stream's forecast and runway. */
  contention: StreamContention;
  /** One entry per work stream, release order, plus the Unassigned bucket last when
   *  the caller supplied one. */
  streams: StreamAssessment[];
  /** Assessment by work-stream id — the Unassigned bucket is keyed `null`. */
  byId: Map<string | null, StreamAssessment>;
}

/**
 * Assess every work stream in a release.
 *
 * `items` must be the release's full item set: contention is a release-level figure,
 * so a stream assessed from a filtered subset would silently read against a smaller
 * team than it actually competes with. Callers that only DISPLAY a subset should
 * assess everything and then pick from `byId`.
 *
 * `unassignedItems` is supplied by the caller rather than derived here, because what
 * counts as unassigned differs by screen — the release view and the snapshot both
 * exclude off-build items, other callers don't have the bucket at all.
 */
export function assessStreams(
  release: Release,
  team: Team | undefined,
  items: WorkItem[],
  opts: { today?: string; unassignedItems?: WorkItem[] } = {},
): ReleaseAssessment {
  const today = opts.today ?? todayISO();
  const ctx = releaseCapacity(release, team, today);

  const inputs: Array<{ ws: WorkStream | null; items: WorkItem[] }> = release.workStreams.map((ws) => ({
    ws,
    items: items.filter((i) => i.workStreamId === ws.id),
  }));
  if (opts.unassignedItems && opts.unassignedItems.length > 0) {
    inputs.push({ ws: null, items: opts.unassignedItems });
  }

  const withHealth = inputs.map((s) => ({ ...s, health: streamHealth(s.items) }));

  // Only streams that still have work compete for engineers — a finished stream's
  // reservation isn't taken from anyone.
  const contention = streamContention(
    withHealth.filter((s) => s.ws?.engineersRequired != null && s.health.remainingPts > 0).map((s) => s.ws!.engineersRequired!),
    ctx.contributingCount,
  );

  // "Beyond next" = sprints two or more past the current one. An item created there is
  // evidence of planning further than a sprint ahead; the runway alarm fires when a
  // stream holds capacity but has nothing out there. firstRemaining is the current
  // sprint (active or first upcoming); -1 → the release has fully elapsed.
  const firstRemainingIndex = release.sprints.findIndex((sp) => sp.endISO >= today);
  const beyondNextThreshold = (firstRemainingIndex < 0 ? release.sprints.length : firstRemainingIndex) + 2;
  const sprintIndexById = new Map(release.sprints.map((sp, i) => [sp.id, i] as const));
  const itemsBeyondNext = (streamItems: WorkItem[]): number =>
    streamItems.filter(
      (i) => i.status !== 'Complete' && i.sprintId != null && (sprintIndexById.get(i.sprintId) ?? -1) >= beyondNextThreshold,
    ).length;

  const streams: StreamAssessment[] = withHealth.map(({ ws, items: streamItems, health }) => {
    const engineersRequired = ws ? ws.engineersRequired : null;
    const planningState: PlanningState = ws ? ws.planningState : 'open';
    // Most streams inherit the release freeze and reuse `ctx`; only a stream with its
    // own override gets its own window.
    const streamCtx = streamCapacityCtx(release, team, ws, ctx, today);
    const { preFreezePts, postFreezePts } = remainingByFreeze(streamItems, release.sprints, effectiveStreamCodeFreeze(release, ws));
    return {
      ws,
      items: streamItems,
      health,
      ctx: streamCtx,
      preFreezePts,
      postFreezePts,
      forecast: streamForecast(health, engineersRequired, streamCtx, contention, preFreezePts),
      runway: streamRunway(health, engineersRequired, streamCtx, contention, {
        itemsBeyondNext: itemsBeyondNext(streamItems),
        planningState,
        remainingPreFreezePts: preFreezePts,
      }),
    };
  });

  return { ctx, contention, streams, byId: new Map(streams.map((s) => [s.ws ? s.ws.id : null, s])) };
}

// ── Whole-release assessment (retrospective) ────────────────────────────────
// assessStreams answers "can we finish from here". This answers "how did this
// release run" — the same contention maths over every stream that carried work
// rather than only those with work left, plus the points ledger the forward view
// has no equivalent of. Its verdicts are completion-invariant by construction.
//
// The two are deliberately separate functions rather than one with a flag: they
// share a primitive, not a meaning, and a caller should have to say which question
// it is asking. See the ReleaseLedger comment in derive.ts for what this reading
// can and cannot claim.

export interface RetroStream {
  ws: WorkStream;
  /** All points the stream carried, complete or not — the figure that doesn't move. */
  totalPts: number;
  donePts: number;
  engineersRequired: number | null;
  /** Engineer-equivalents the stream's full scope actually demanded across the
   *  release, from the whole-release per-engineer capacity. Compared against
   *  `engineersRequired`, this is reservation vs. what the work turned out to need.
   *  0 when there is no capacity baseline to divide by. */
  engineersImplied: number;
}

export interface SprintAllocation {
  sprint: Sprint;
  /** Reservations held by the streams that carried work in this sprint, against the
   *  team's headcount. The release-level figure asks the same question of the whole
   *  cycle at once; this asks it sprint by sprint. */
  contention: StreamContention;
  /** Work streams holding at least one item in this sprint, reserved or not. */
  streamCount: number;
  /** No work stream held work here. Reported rather than judged: an empty sprint is
   *  not an under-allocated one, and counting it as such would flatter the tally. */
  idle: boolean;
}

export interface ReleaseRetro {
  ledger: ReleaseLedger;
  /** Contention across every stream that carried work — complete streams included,
   *  so finishing can never improve the verdict. */
  contention: StreamContention;
  /** One entry per work stream, release order. The Unassigned bucket is excluded:
   *  it holds no reservation, so it cannot contend. Its points are still in
   *  `totalPts` when the caller supplies them. */
  streams: RetroStream[];
  /** One entry per sprint, release order — including sprints past the freeze, which
   *  the ledger's capacity window excludes but which can still hold work. Dropping
   *  them would quietly shrink the denominator of "overbooked in N of M". */
  perSprint: SprintAllocation[];
  /** Sprints whose reservations exceeded the team, over those that can be judged
   *  (i.e. excluding idle ones) — the "overbooked for 8 of 11 sprints" reading. */
  overbookedSprints: number;
  judgedSprints: number;
  /** Σ points across the release's items, and the completed portion. */
  totalPts: number;
  donePts: number;
  /** Total scope measured against total capacity — the ledger's own verdict, and
   *  the one figure here that needs no engineer reservations to be configured. */
  overCommitted: boolean;
}

/**
 * Assess a release as a whole, for the retrospective lens.
 *
 * `items` must be the release's full item set, as with assessStreams — and here it
 * matters twice over, since both the contention set and the points ledger are
 * whole-release figures that a filtered subset would silently understate.
 */
export function assessRelease(
  release: Release,
  team: Team | undefined,
  items: WorkItem[],
): ReleaseRetro {
  const ledger = releaseLedger(release, team);

  const streams: RetroStream[] = release.workStreams.map((ws) => {
    const health = streamHealth(items.filter((i) => i.workStreamId === ws.id));
    return {
      ws,
      totalPts: health.totalPts,
      donePts: health.donePts,
      engineersRequired: ws.engineersRequired,
      engineersImplied: ledger.perEngineerCap > 0 ? health.totalPts / ledger.perEngineerCap : 0,
    };
  });

  // The one substantive difference from the forward view: `totalPts > 0` where
  // assessStreams uses `remainingPts > 0`. A stream that finished still consumed
  // engineers for the part of the release it ran in, so it still counts here.
  const contention = streamContention(
    streams.filter((s) => s.engineersRequired != null && s.totalPts > 0).map((s) => s.engineersRequired!),
    ledger.contributingCount,
  );

  // Which streams held work in each sprint. Every item counts, complete or not —
  // the same completion-invariance the release-level figure relies on.
  const streamsBySprint = new Map<string, Set<string>>();
  for (const i of items) {
    if (i.sprintId == null || i.workStreamId == null) continue;
    const held = streamsBySprint.get(i.sprintId);
    if (held) held.add(i.workStreamId);
    else streamsBySprint.set(i.sprintId, new Set([i.workStreamId]));
  }
  const reservationOf = new Map(release.workStreams.map((ws) => [ws.id, ws.engineersRequired] as const));

  const perSprint: SprintAllocation[] = release.sprints.map((sprint) => {
    const held = streamsBySprint.get(sprint.id);
    const counts = [...(held ?? [])]
      .map((id) => reservationOf.get(id) ?? null)
      .filter((n): n is number => n != null);
    return {
      sprint,
      contention: streamContention(counts, ledger.contributingCount),
      streamCount: held?.size ?? 0,
      idle: (held?.size ?? 0) === 0,
    };
  });

  const totalPts = sumPoints(items);
  return {
    ledger,
    contention,
    streams,
    perSprint,
    overbookedSprints: perSprint.filter((s) => s.contention.overAllocated).length,
    judgedSprints: perSprint.filter((s) => !s.idle).length,
    totalPts,
    donePts: sumPoints(items.filter((i) => i.status === 'Complete')),
    overCommitted: ledger.totalCap > 0 && totalPts > ledger.totalCap,
  };
}

/** One stream's assessment, for callers that only render a single stream (the work
 *  stream screen, the health modal). Still assesses the whole release — contention
 *  is a release-level figure and can't be derived from one stream alone. */
export function assessStream(
  release: Release,
  team: Team | undefined,
  items: WorkItem[],
  wsId: string,
  opts: { today?: string } = {},
): StreamAssessment | undefined {
  return assessStreams(release, team, items, opts).byId.get(wsId);
}
