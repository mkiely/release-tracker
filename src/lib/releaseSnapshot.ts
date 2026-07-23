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
// Payload: JSON → LZ-compressed → URL-safe string, carried in the URL *hash*
// (`#s=`) rather than a query param. The fragment is never sent to any host in a
// request, so the (potentially large) analysis blob never reaches a server even
// if the viewer is hosted somewhere with request logging.

import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import type { HealthVerdict, RunwayVerdict, StreamHealth, VelocityAttainment, VelocitySuggestion } from './derive';
import {
  effectiveStreamCodeFreeze,
  freezeSprintX,
  releaseCapacity,
  sprintEventChips,
  sprintVel,
  statusSegs,
  streamCapacityCtx,
  streamContention,
  streamForecast,
  streamHealth,
  streamRunway,
  sumPoints,
  velocityAttainment,
  velocitySuggestion,
} from './derive';
import { between, dOf, fmtShort, todayISO } from './dates';
import type { Release, StatusSeg, Team, WorkItem, WorkStream } from '../types';

/** Hash-fragment key carrying an encoded snapshot payload (`…/summary.html#s=…`). */
export const SNAPSHOT_PARAM = 's';

/**
 * Ceiling on a snapshot link's length. Far higher than shareRelease's 2000 —
 * these are copy-paste links, not hand-typed, and a snapshot carries per-sprint
 * and per-stream aggregates. A snapshot that would exceed this is reported, not
 * produced.
 */
export const MAX_SNAPSHOT_URL_LENGTH = 8000;

/** Schema version for the snapshot payload, so a future shape change is detectable. */
export const SNAPSHOT_VERSION = 1;

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
  itemCount: number;
  events: { label: string; dateISO: string; critical: boolean }[];
}

/** One work stream's precomputed row in a snapshot. Carries status *counts*, never
 *  items — the structural guarantee that no work-item detail travels. */
export interface SnapshotStream {
  name: string;
  itemCount: number;
  totalPts: number;
  donePts: number;
  pct: number;
  /** Per-status counts for the segmented bar (no item identity). */
  segs: StatusSeg[];
  /** Points per sprint across the release, for the trend sparkline. */
  series: number[];
  engineersRequired: number | null;
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
}

/** Alphabetical (case-insensitive) stream order, matching the release view. */
function byName(a: WorkStream, b: WorkStream): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
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

  const streams = [...release.workStreams].sort(byName);
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
      itemCount: spItems.length,
      events: sprintEventChips(release, sp).map((e) => ({ label: e.label, dateISO: e.dateISO, critical: !!e.critical })),
    };
  });

  // ── Streams (+ unassigned bucket) ────────────────────────────────────────
  const ctx = releaseCapacity(release, team, today);
  const streamInputs: Array<{ ws: WorkStream | null; items: WorkItem[]; series: number[]; health: StreamHealth }> = [
    ...streams.map((ws) => ({ ws, items: items.filter((i) => i.workStreamId === ws.id), series: streamSeries.get(ws.id) ?? [] })),
    ...(unassigned.length > 0 ? [{ ws: null as WorkStream | null, items: unassigned, series: unassignedSeries }] : []),
  ].map((s) => ({ ...s, health: streamHealth(s.items) }));

  const contention = streamContention(
    streamInputs
      .filter((s) => s.ws && s.ws.engineersRequired != null && s.health.remainingPts > 0)
      .map((s) => s.ws!.engineersRequired!),
    ctx.contributingCount,
  );

  // "Beyond next" = two or more sprints past the current one — evidence of planning
  // further than a sprint ahead. Mirrors useReleaseView's runway-alarm input.
  const firstRemainingIndex = release.sprints.findIndex((sp) => sp.endISO >= today);
  const beyondNextThreshold = (firstRemainingIndex < 0 ? release.sprints.length : firstRemainingIndex) + 2;
  const sprintIndexById = new Map(release.sprints.map((sp, i) => [sp.id, i] as const));
  const itemsBeyondNextFor = (streamItems: WorkItem[]): number =>
    streamItems.filter((i) => i.status !== 'Complete' && i.sprintId != null && (sprintIndexById.get(i.sprintId) ?? -1) >= beyondNextThreshold).length;

  const activeIndex = release.sprints.findIndex((sp) => between(today, sp.startISO, sp.endISO));
  const friClamped = firstRemainingIndex < 0 ? release.sprints.length : firstRemainingIndex;

  const outStreams: SnapshotStream[] = streamInputs.map(({ ws, items: streamItems, series, health }) => {
    const streamCtx = streamCapacityCtx(release, team, ws, ctx, today);
    const forecast = streamForecast(health, ws ? ws.engineersRequired : null, streamCtx, contention);
    const runway = streamRunway(health, ws ? ws.engineersRequired : null, streamCtx, contention, {
      itemsBeyondNext: itemsBeyondNextFor(streamItems),
      muted: ws ? ws.planningMuted : false,
    });
    const canForecast = (ws ? ws.engineersRequired : null) != null && health.totalPts > 0;
    return {
      name: ws ? ws.name : 'Unassigned',
      itemCount: streamItems.length,
      totalPts: health.totalPts,
      donePts: health.donePts,
      pct: health.pct,
      segs: statusSegs(streamItems),
      series,
      engineersRequired: ws ? ws.engineersRequired : null,
      forecast: { verdict: forecast.verdict, summary: forecast.summary },
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
  const releaseHealth = streamHealth(items);
  const velocity = velocityAttainment(release, team, items, today);
  const runwayAlarmCount = outStreams.filter((s) => s.runway.alarm).length;

  return {
    v: SNAPSHOT_VERSION,
    summaryId: release.id,
    generatedAtISO: opts.now ? `${opts.now}T00:00:00.000Z` : new Date().toISOString(),
    name: release.name,
    teamName: team ? team.name : null,
    dateRange,
    connectorLabel: opts.connectorLabel ?? null,
    overall: {
      totalItems: items.length,
      totalPts: releaseHealth.totalPts,
      donePts: releaseHealth.donePts,
      completionPct: releaseHealth.pct,
      teamVelocity: team ? team.velocity : 0,
      contributingCount: ctx.contributingCount,
      engineersRequiredTotal: contention.totalRequired,
      overAllocated: contention.overAllocated,
      runwayAlarmCount,
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
export function encodeSnapshot(payload: SnapshotPayload): string {
  return compressToEncodedURIComponent(JSON.stringify(payload));
}

/** Decode + decompress an `#s=` value back into a payload. Returns null if the value
 *  is malformed, truncated, or not a recognized snapshot payload. */
export function decodeSnapshot(encoded: string): SnapshotPayload | null {
  try {
    const json = decompressFromEncodedURIComponent(encoded);
    if (!json) return null;
    const p = JSON.parse(json) as Partial<SnapshotPayload>;
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
  } catch {
    return null;
  }
}

/** Result of attempting to build a snapshot link. */
export type SnapshotLinkResult =
  | { ok: true; url: string; payload: SnapshotPayload }
  | { ok: false; reason: 'too-long'; length: number };

/**
 * Build the absolute summary-viewer URL for a release. `base` is the published
 * viewer origin+path (e.g. `https://user.github.io/release-tracker`); the payload
 * rides in the hash. Reports `too-long` rather than producing a truncatable link.
 */
export function buildSnapshotUrl(
  release: Release,
  team: Team | undefined,
  items: WorkItem[],
  base: string,
  opts: BuildSnapshotOptions = {},
): SnapshotLinkResult {
  const payload = buildSnapshot(release, team, items, opts);
  const trimmed = base.replace(/\/+$/, '');
  const url = `${trimmed}/summary.html#${SNAPSHOT_PARAM}=${encodeSnapshot(payload)}`;
  if (url.length > MAX_SNAPSHOT_URL_LENGTH) return { ok: false, reason: 'too-long', length: url.length };
  return { ok: true, url, payload };
}
