// Executive-summary snapshot of a release — a frozen, self-contained analysis
// carried entirely in a URL hash, viewable in the standalone summary page with no
// backend, no app state, and no connector knowledge.
//
// This is the inverse of shareRelease.ts. That link carries *inputs* (connector
// config + local metadata) and the recipient re-syncs to rehydrate live data. A
// snapshot instead carries *outputs*: the derivation results (capacity, velocity,
// per-stream status counts + health) precomputed at share time, because the
// recipient has no work items to run derivations over. Crucially it embeds status
// *counts*, never items — so a snapshot structurally cannot leak a work item's
// key, subject, or description. It works for local and connector releases alike.
//
// Payload: JSON → deflate → URL-safe string (see lib/urlCodec), carried in the URL
// *hash* (`#s=`) rather than a query param. The fragment is never sent to any host
// in a request, so the (potentially large) analysis blob never reaches a server even
// if the viewer is hosted somewhere with request logging.

import { MAX_URL_LENGTH, decodeJson, encodeJson } from './urlCodec';
import type { HealthVerdict, RunwayVerdict, VelocityAttainment, VelocitySuggestion } from './derive';
import {
  capPct,
  effectiveStreamCodeFreeze,
  freezeSprintX,
  sprintEventChips,
  sprintVel,
  statusSegs,
  streamHealth,
  sumPoints,
  velocityAttainment,
  velocitySuggestion,
} from './derive';
import { assessRelease, assessStreams } from './streamAssessment';
import { spanOfItems, sprintIndex } from './streamTimeline';
import { between, dOf, fmtShort, todayISO } from './dates';
import type { Release, StatusSeg, Team, WorkItem, WorkStream } from '../types';

/** Hash-fragment key carrying an encoded snapshot payload (`…/summary.html#s=…`). */
export const SNAPSHOT_PARAM = 's';

/** Schema version for the snapshot payload, so a future shape change is detectable.
 *  v2 adds the release `capacity` block and per-stream `doneItems`; v3 adds
 *  `contributingMembers` and a per-capacity-row `verdict`; v5 adds per-stream
 *  `externalUrl` (connector deep link); v6 adds the `wholeRelease` block; v7 adds
 *  per-stream `span` / `freezeISO` / `unassigned` (the timeline). Older payloads
 *  still decode — the viewer guards the added fields and defaults them. */
export const SNAPSHOT_VERSION = 7;

/** One sprint's precomputed row in a snapshot. */
export interface SnapshotSprint {
  name: string;
  startISO: string;
  endISO: string;
  /** Pre-formatted date range for display (recipient has no locale context to match). */
  dateRange: string;
  isActive: boolean;
  isPast: boolean;
  /** Capacity-adjusted planned velocity (points). */
  vel: number;
  /** Points planned into the sprint. */
  planned: number;
  /** Points completed in the sprint (meaningful once past). */
  donePts: number;
  daysOff: number;
  /** Effective capacity after days off, 0–100 (100 when no days off). Spelled out in
   *  the viewer so the reduction isn't inferred from the abbreviated day count. */
  capacityPct: number;
  itemCount: number;
  events: { label: string; dateISO: string; critical: boolean }[];
}

/** One work stream's precomputed row in a snapshot. Carries status *counts*, never
 *  items — the structural guarantee that no work-item detail travels. */
export interface SnapshotStream {
  name: string;
  /** Connector deep link to this stream in the external system, or null for local
   *  streams / non-connector releases. Rendered as an external-link on the name.
   *  Absent on pre-v5 payloads — the viewer guards it. */
  externalUrl: string | null;
  itemCount: number;
  /** Completed work items (open = itemCount − doneItems). */
  doneItems: number;
  totalPts: number;
  donePts: number;
  pct: number;
  /** Per-status counts for the segmented bar (no item identity). */
  segs: StatusSeg[];
  /** Points per sprint across the release, for the trend sparkline. */
  series: number[];
  engineersRequired: number | null;
  /**
   * The sprint range this stream's work occupies, as `[startIdx, endIdx]` into
   * `sprints` — the timeline's bar. Null when nothing of the stream is in a sprint.
   *
   * Two numbers rather than two dates, because the payload rides a length-capped
   * URL and the sprints it indexes are already in it. It could ALMOST be derived
   * from `series` (first and last non-zero), which is why it isn't obvious it needs
   * to be here: `series` is points per sprint, so a stream of entirely unestimated
   * items is all zeroes and would silently lose its bar. Absent on pre-v7 payloads.
   */
  span?: [number, number] | null;
  /** This stream's effective code freeze (its own override, or the release's) — the
   *  tick on its timeline bar. Absent on pre-v7 payloads. */
  freezeISO?: string;
  /** Marks the Unassigned bucket, which is a catch-all and not a work stream. The
   *  timeline skips it; the status cards still show it. Absent on every real stream
   *  (and on pre-v7 payloads), so it costs nothing in the URL. */
  unassigned?: true;
  /** Forward capacity-fit verdict + its plain-language "why". */
  forecast: { verdict: HealthVerdict; summary: string };
  /** Planning-runway verdict + alarm + "why". */
  runway: { verdict: RunwayVerdict; alarm: boolean; summary: string };
  /** Precomputed StreamBurnChart props, or null when the stream can't be forecast
   *  (no engineer count or no estimated work). */
  burn: {
    series: number[];
    firstRemainingIndex: number;
    freezeX: number;
    activeIndex: number;
    remainingPts: number;
    effectiveCap: number;
    tone: 'ok' | 'risk';
  } | null;
}

/** The decoded contents of a snapshot link: a self-contained, frozen analysis of a
 *  release with no work-item detail. */
export interface SnapshotPayload {
  v: number;
  /** Durable per-release id (= release.id). Keys the recipient's local library so a
   *  fresher share of the same release updates the remembered copy in place. */
  summaryId: string;
  /** When this snapshot was built. Drives the library's fresher-wins upsert. */
  generatedAtISO: string;
  name: string;
  teamName: string | null;
  dateRange: string;
  connectorLabel: string | null;
  /** Names of the team's contributing members (nonContributing excluded), for the
   *  comma-delimited roster shown up top. Empty when the release has no bound team. */
  contributingMembers: string[];
  overall: {
    totalItems: number;
    totalPts: number;
    donePts: number;
    /** Points-based completion across the whole release, 0–100. */
    completionPct: number;
    teamVelocity: number;
    contributingCount: number;
    engineersRequiredTotal: number;
    overAllocated: boolean;
    runwayAlarmCount: number;
  };
  /** Release-level capacity analysis — the highest-level insight, shown first.
   *  Mirrors the app's Capacity metric: how the streams with remaining work
   *  collectively demand engineers against the team's contributing headcount, and
   *  (when over-allocated) how each stream's effective staffing is scaled down. */
  capacity: {
    contributingCount: number;
    totalRequired: number;
    overAllocated: boolean;
    /** contention.scale — the fraction each over-allocated stream is staffed at. */
    scale: number;
    /** totalRequired − contributingCount when over (0 otherwise). */
    over: number;
    /** contributingCount − totalRequired when within capacity (0 otherwise). */
    headroom: number;
    remainingSprintCount: number;
    /** The contending streams: those with a configured engineer count and work left. */
    activeStreams: {
      name: string;
      engineersRequired: number;
      remainingPts: number;
      /** engineersRequired × scale — realistic staffing under contention. */
      effectiveEngineers: number;
      /** Forward capacity-fit verdict, so the highest-visibility capacity rows carry
       *  the same at-risk/on-track chip as the status cards below. */
      verdict: HealthVerdict;
    }[];
  };
  /** Whole-release (retrospective) analysis — the completion-invariant counterpart to
   *  `capacity` above, which reads remaining work against remaining sprints and so
   *  improves as streams finish. See the ReleaseLedger comment in derive.ts for what
   *  this reading can claim.
   *
   *  Optional **because pre-v6 payloads genuinely lack it** — a snapshot decoded from
   *  an older link, or one already sitting in a recipient's local library, has no such
   *  block. Typing it optional makes the viewer's guard a compiler obligation rather
   *  than a convention (`capacity` is the cautionary example: required in the type,
   *  yet still absent from pre-v2 payloads and guarded by hand). */
  wholeRelease?: {
    contributingCount: number;
    /** Σ engineersRequired over every stream that carried work — complete ones
     *  included, which is what makes it immune to completion. */
    totalRequired: number;
    overAllocated: boolean;
    /** totalRequired − contributingCount when over (0 otherwise). */
    over: number;
    /** contributingCount − totalRequired when within capacity (0 otherwise). */
    headroom: number;
    /** Engineers reserved by streams held back from a scoped share. Contention is a
     *  whole-team figure assessed over the entire release, so on a filtered share the
     *  headline can exceed the rows listed below it; this is what reconciles the two.
     *  0 on an unscoped share. */
    outOfScopeRequired: number;
    /** Capacity the release had in total: Σ planned velocity over every sprint
     *  starting on/before the freeze, prorated at it. Started sprints contribute
     *  their frozen baseline, so this is not a today-rewrite. */
    totalCap: number;
    sprintCount: number;
    /** Points across every item in the release, and the completed portion. */
    totalPts: number;
    donePts: number;
    overCommitted: boolean;
    /** totalPts − totalCap, signed: positive is over-commitment, negative headroom. */
    scopeGap: number;
    /** Sprints whose reservations exceeded the team, over those that can be judged
     *  (idle sprints excluded) — the "overbooked in N of M sprints" reading. */
    overbookedSprints: number;
    judgedSprints: number;
    /** The allocation strip, **index-aligned with `sprints` above** rather than
     *  repeating each sprint's name — both are one entry per release sprint, in
     *  order. Kept lean because the payload rides in a length-capped URL. */
    perSprint: { totalRequired: number; streamCount: number; overAllocated: boolean; idle: boolean }[];
    /** Reservation vs. what the scope turned out to need, per stream. Narrowed to the
     *  shared subset like every other per-stream section; `outOfScopeRequired` above
     *  accounts for what that narrowing hides. */
    streams: { name: string; engineersRequired: number | null; engineersImplied: number; totalPts: number }[];
  };
  velocity: {
    verdict: VelocityAttainment['verdict'];
    totalPlanned: number;
    totalActual: number;
    attainmentPct: number | null;
    /** Delivered-vs-planned per elapsed sprint, for the velocity trend chart. */
    series: { label: string; planned: number; actual: number }[];
    /** Recommended velocity change from recent delivery, or null when no sprint has
     *  elapsed. The viewer surfaces it read-only (it can't mutate the team). */
    suggestion: VelocitySuggestion | null;
  };
  sprints: SnapshotSprint[];
  streams: SnapshotStream[];
}

/** Options for {@link buildSnapshot}. `connectorLabel` is passed in (rather than
 *  imported) so this module stays free of the sync layer and safe to import into
 *  the standalone viewer bundle. `now` is injectable for deterministic tests. */
export interface BuildSnapshotOptions {
  connectorLabel?: string | null;
  now?: string;
  /** Restrict the snapshot to these work-stream ids — the release view's active
   *  stream facets (build + connector-declared), mirroring what {@link releaseToTSV}
   *  does for the export. Streams outside the set are dropped from the per-stream
   *  sections, the capacity/contention math, and the release-level completion
   *  rollup, so the summary reflects exactly what's on screen. Team-level metrics
   *  (sprint capacity/velocity, velocity attainment) stay unfiltered. Null/undefined
   *  = every stream. The Unassigned bucket is never stream-filtered. */
  visibleStreamIds?: ReadonlySet<string> | null;
}

/** Alphabetical (case-insensitive) stream order, matching the release view. */
function byName(a: WorkStream, b: WorkStream): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}

/** Remove streamForecast's trailing "· team overbooked (N req / M avail)" clause.
 *  The release capacity section states the over-allocation once, so repeating it on
 *  every stream's why-line is redundant. Matches the exact suffix derive.ts appends. */
function stripOverbook(summary: string): string {
  return summary.replace(/\s*·\s*team overbooked \([^)]*\)\s*$/, '');
}

/**
 * Build a frozen executive-summary snapshot from a release. Runs the same
 * derivations the release view uses, then serializes their *outputs*. Unlike
 * shareRelease, this works for local releases too — the snapshot is self-contained
 * and never re-syncs.
 *
 * `items` should be the release's work items; `team` its bound team (for capacity
 * and velocity). Pure and store-free.
 */
export function buildSnapshot(
  release: Release,
  team: Team | undefined,
  items: WorkItem[],
  opts: BuildSnapshotOptions = {},
): SnapshotPayload {
  const today = opts.now ?? todayISO();
  // Compute the active sprint from `today` directly (activeSprint() reads the real
  // clock and isn't injectable) so the snapshot is deterministic and testable.
  const active = release.sprints.find((sp) => between(today, sp.startISO, sp.endISO)) ?? null;
  const last = release.sprints.length ? release.sprints[release.sprints.length - 1] : null;

  const dateRange = last
    ? `${fmtShort(release.startISO)} – ${fmtShort(last.endISO)}, ${dOf(last.endISO).getFullYear()}`
    : `${fmtShort(release.startISO)}, ${dOf(release.startISO).getFullYear()}`;

  // Active stream facets (build + connector-declared): drop hidden streams from the
  // per-stream sections and the contention math, exactly as the TSV export does.
  const visible = opts.visibleStreamIds ?? null;
  const streams = [...release.workStreams].filter((ws) => !visible || visible.has(ws.id)).sort(byName);
  const unassigned = items.filter((i) => i.workStreamId === null && i.build === null);

  // Points-per-sprint series for each stream (and the unassigned bucket), sliced
  // by sprint id — the trend sparkline / burn input.
  const seriesFor = (pred: (i: WorkItem) => boolean): number[] =>
    release.sprints.map((sp) => sumPoints(items.filter((i) => pred(i) && i.sprintId === sp.id)));
  const streamSeries = new Map<string, number[]>(streams.map((ws) => [ws.id, seriesFor((i) => i.workStreamId === ws.id)]));
  const unassignedIds = new Set(unassigned.map((i) => i.id));
  const unassignedSeries = seriesFor((i) => unassignedIds.has(i.id));

  // ── Sprints ────────────────────────────────────────────────────────────
  const sprints: SnapshotSprint[] = release.sprints.map((sp) => {
    const spItems = items.filter((i) => i.sprintId === sp.id);
    const isActive = !!active && active.id === sp.id;
    return {
      name: sp.name,
      startISO: sp.startISO,
      endISO: sp.endISO,
      dateRange: `${fmtShort(sp.startISO)} – ${fmtShort(sp.endISO)}`,
      isActive,
      isPast: sp.endISO < today && !isActive,
      vel: sprintVel(team, sp, sp.daysOff),
      planned: sumPoints(spItems),
      donePts: sumPoints(spItems.filter((i) => i.status === 'Complete')),
      daysOff: sp.daysOff,
      capacityPct: Math.round(capPct(team, sp, sp.daysOff) * 100),
      itemCount: spItems.length,
      events: sprintEventChips(release, sp).map((e) => ({ label: e.label, dateISO: e.dateISO, critical: !!e.critical })),
    };
  });

  // ── Streams (+ unassigned bucket) ────────────────────────────────────────
  // Assessed over every stream in the release, then narrowed to the shared subset:
  // contention measures the whole team's allocation, so a share scope that omits
  // streams must not make the remaining ones look less contended than they are.
  const { ctx, contention, byId } = assessStreams(release, team, items, { today, unassignedItems: unassigned });
  const computed = [
    ...streams.map((ws) => ({ ...byId.get(ws.id)!, series: streamSeries.get(ws.id) ?? [] })),
    ...(unassigned.length > 0 ? [{ ...byId.get(null)!, series: unassignedSeries }] : []),
  ];

  const firstRemainingIndex = release.sprints.findIndex((sp) => sp.endISO >= today);
  const activeIndex = release.sprints.findIndex((sp) => between(today, sp.startISO, sp.endISO));
  const friClamped = firstRemainingIndex < 0 ? release.sprints.length : firstRemainingIndex;

  const sprintIdxById = sprintIndex(release.sprints);

  const outStreams: SnapshotStream[] = computed.map(({ ws, items: streamItems, series, health, forecast, runway }) => {
    const canForecast = (ws ? ws.engineersRequired : null) != null && health.totalPts > 0;
    const span = spanOfItems(streamItems, sprintIdxById);
    return {
      name: ws ? ws.name : 'Unassigned',
      externalUrl: ws ? ws.externalUrl : null,
      span: span ? [span.startIdx, span.endIdx] : null,
      freezeISO: effectiveStreamCodeFreeze(release, ws),
      ...(ws ? {} : { unassigned: true as const }),
      itemCount: streamItems.length,
      doneItems: streamItems.filter((i) => i.status === 'Complete').length,
      totalPts: health.totalPts,
      donePts: health.donePts,
      pct: health.pct,
      segs: statusSegs(streamItems),
      series,
      engineersRequired: ws ? ws.engineersRequired : null,
      // The over-allocation is stated once, up front, in the release capacity section —
      // strip the per-stream "· team overbooked (…)" restatement so it isn't repeated
      // on every card.
      forecast: { verdict: forecast.verdict, summary: stripOverbook(forecast.summary) },
      runway: { verdict: runway.verdict, alarm: runway.alarm, summary: runway.summary },
      burn: canForecast
        ? {
            series,
            firstRemainingIndex: friClamped,
            freezeX: freezeSprintX(release.sprints, effectiveStreamCodeFreeze(release, ws)),
            activeIndex,
            remainingPts: health.remainingPts,
            effectiveCap: forecast.effectiveCap,
            // Only the at-risk verdict reads as risk tone (mirrors verdictVars).
            tone: forecast.verdict === 'at-risk' ? 'risk' : 'ok',
          }
        : null,
    };
  });

  // ── Release-level rollups ────────────────────────────────────────────────
  // Completion is scoped to the visible streams (+ the never-filtered Unassigned
  // bucket) so the headline agrees with the streams shown. Velocity below stays
  // team-level and unfiltered — it measures the team's throughput, not a stream.
  const scopedItems = visible ? items.filter((i) => i.workStreamId === null || visible.has(i.workStreamId)) : items;
  const releaseHealth = streamHealth(scopedItems);
  const velocity = velocityAttainment(release, team, items, today);
  const runwayAlarmCount = outStreams.filter((s) => s.runway.alarm).length;

  // Contending streams: those with a configured engineer count and work remaining —
  // exactly the ones that feed streamContention above. effectiveEngineers reflects
  // the scale-down when the release is over-allocated; verdict is the same chip the
  // status card shows, surfaced here for the above-the-fold capacity table.
  const activeStreams = computed
    .filter((c) => c.ws && c.ws.engineersRequired != null && c.health.remainingPts > 0)
    .map((c) => ({
      name: c.ws!.name,
      engineersRequired: c.ws!.engineersRequired!,
      remainingPts: c.health.remainingPts,
      effectiveEngineers: Math.round(c.ws!.engineersRequired! * contention.scale * 10) / 10,
      verdict: c.forecast.verdict,
    }))
    .sort((a, b) => b.engineersRequired - a.engineersRequired);
  const over = Math.max(0, contention.totalRequired - ctx.contributingCount);
  const headroom = Math.max(0, ctx.contributingCount - contention.totalRequired);
  const contributingMembers = team ? team.members.filter((m) => !m.nonContributing).map((m) => m.name) : [];

  // ── Whole release (retrospective) ────────────────────────────────────────
  // Assessed over the ENTIRE release, never the share scope: this reading's whole
  // claim is that nothing has been left out of it, and a scoped assessment would
  // understate contention exactly as it would in `capacity` above. The per-stream
  // rows are still narrowed to what's shared, so `outOfScopeRequired` carries what
  // that narrowing hides and lets the headline reconcile against its own rows.
  const retro = assessRelease(release, team, items);
  const visibleRetro = retro.streams.filter((s) => !visible || visible.has(s.ws.id));
  const outOfScopeRequired = retro.streams
    .filter((s) => (visible ? !visible.has(s.ws.id) : false) && s.engineersRequired != null && s.totalPts > 0)
    .reduce((a, s) => a + (s.engineersRequired ?? 0), 0);
  const retroOver = Math.max(0, retro.contention.totalRequired - retro.ledger.contributingCount);
  const retroHeadroom = Math.max(0, retro.ledger.contributingCount - retro.contention.totalRequired);

  return {
    v: SNAPSHOT_VERSION,
    summaryId: release.id,
    generatedAtISO: opts.now ? `${opts.now}T00:00:00.000Z` : new Date().toISOString(),
    name: release.name,
    teamName: team ? team.name : null,
    dateRange,
    connectorLabel: opts.connectorLabel ?? null,
    contributingMembers,
    overall: {
      totalItems: scopedItems.length,
      totalPts: releaseHealth.totalPts,
      donePts: releaseHealth.donePts,
      completionPct: releaseHealth.pct,
      teamVelocity: team ? team.velocity : 0,
      contributingCount: ctx.contributingCount,
      engineersRequiredTotal: contention.totalRequired,
      overAllocated: contention.overAllocated,
      runwayAlarmCount,
    },
    capacity: {
      contributingCount: ctx.contributingCount,
      totalRequired: contention.totalRequired,
      overAllocated: contention.overAllocated,
      scale: contention.scale,
      over,
      headroom,
      remainingSprintCount: ctx.remainingSprintCount,
      activeStreams,
    },
    wholeRelease: {
      contributingCount: retro.ledger.contributingCount,
      totalRequired: retro.contention.totalRequired,
      overAllocated: retro.contention.overAllocated,
      over: retroOver,
      headroom: retroHeadroom,
      outOfScopeRequired,
      totalCap: Math.round(retro.ledger.totalCap),
      sprintCount: retro.ledger.sprintCount,
      totalPts: retro.totalPts,
      donePts: retro.donePts,
      overCommitted: retro.overCommitted,
      scopeGap: retro.totalPts - Math.round(retro.ledger.totalCap),
      overbookedSprints: retro.overbookedSprints,
      judgedSprints: retro.judgedSprints,
      perSprint: retro.perSprint.map((s) => ({
        totalRequired: s.contention.totalRequired,
        streamCount: s.streamCount,
        overAllocated: s.contention.overAllocated,
        idle: s.idle,
      })),
      streams: visibleRetro
        .filter((s) => s.totalPts > 0)
        .map((s) => ({
          name: s.ws.name,
          engineersRequired: s.engineersRequired,
          // One decimal is all the viewer renders; carrying full float precision
          // would spend payload bytes on digits nothing displays.
          engineersImplied: Math.round(s.engineersImplied * 10) / 10,
          totalPts: s.totalPts,
        }))
        .sort((a, b) => b.totalPts - a.totalPts),
    },
    velocity: {
      verdict: velocity.verdict,
      totalPlanned: velocity.totalPlanned,
      totalActual: velocity.totalActual,
      attainmentPct: velocity.attainmentPct,
      series: velocity.perSprint.map((s) => ({
        label: s.sprint.name.replace(/^Sprint\s*/i, 'S'),
        planned: s.planned,
        actual: s.actual,
      })),
      suggestion: velocitySuggestion(release, team, items, 3, today),
    },
    sprints,
    streams: outStreams,
  };
}

/** Compress + URL-safe-encode a payload into the value for the `#s=` fragment. */
export function encodeSnapshot(payload: SnapshotPayload): Promise<string> {
  return encodeJson(payload);
}

/** Decode + decompress an `#s=` value back into a payload. Returns null if the value
 *  is malformed, truncated, or not a recognized snapshot payload. */
export async function decodeSnapshot(encoded: string): Promise<SnapshotPayload | null> {
  const p = await decodeJson<Partial<SnapshotPayload>>(encoded);
  if (
    typeof p !== 'object' || p === null ||
    typeof p.summaryId !== 'string' ||
    typeof p.generatedAtISO !== 'string' ||
    typeof p.name !== 'string' ||
    !p.overall || typeof p.overall !== 'object' ||
    !Array.isArray(p.sprints) || !Array.isArray(p.streams)
  ) {
    return null;
  }
  return p as SnapshotPayload;
}

/** Result of attempting to build a snapshot link. On `too-long`, the raw `encoded`
 *  value is still returned so the caller can offer it via the viewer's manual paste
 *  loader (which accepts a bare encoded value) rather than a copy-pasteable URL. */
export type SnapshotLinkResult =
  | { ok: true; url: string; payload: SnapshotPayload }
  | { ok: false; reason: 'too-long'; length: number; encoded: string };

/**
 * Build the absolute summary-viewer URL for a release. `base` is the published
 * viewer origin+path (e.g. `https://user.github.io/release-tracker`); the payload
 * rides in the hash. Reports `too-long` (with the encoded value) rather than
 * producing a truncatable link.
 */
export async function buildSnapshotUrl(
  release: Release,
  team: Team | undefined,
  items: WorkItem[],
  base: string,
  opts: BuildSnapshotOptions = {},
): Promise<SnapshotLinkResult> {
  const payload = buildSnapshot(release, team, items, opts);
  const encoded = await encodeSnapshot(payload);
  const trimmed = base.replace(/\/+$/, '');
  const url = `${trimmed}/summary.html#${SNAPSHOT_PARAM}=${encoded}`;
  if (url.length > MAX_URL_LENGTH) return { ok: false, reason: 'too-long', length: url.length, encoded };
  return { ok: true, url, payload };
}
