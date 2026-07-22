// Release → tab-delimited (TSV) export for pasting into Google Sheets.
//
// Layout: per-work-stream sections. Each section opens with a single header row
// whose first cell is a multi-line block containing the stream name and all
// health / forecast / runway metrics; the sprint columns on that row are empty.
// Work item rows follow below with the first column blank and items in their
// sprint columns (stacking into extra rows when a sprint has multiple items).
//
// Multi-line cells use RFC 4180 quoting ("..." with embedded \n) which Google
// Sheets honours when pasting from the clipboard.

import type { AppState, WorkItem } from '../types';
import { fmtShort, todayISO } from './dates';
import {
  eventsIn,
  releaseCapacity,
  sprintVel,
  streamCapacityCtx,
  streamContention,
  streamForecast,
  streamHealth,
  streamRunway,
  sumPoints,
} from './derive';

const TAB = '\t';

// Strip tabs/newlines from user-supplied text so item labels can't break the grid.
const cell = (s: string): string => s.replace(/[\t\r\n]+/g, ' ').trim();

const itemLabel = (it: WorkItem): string => cell(`${it.key} ${it.subject}`);

// Wrap a field in RFC 4180 quotes when it contains newlines or quotes, so Google
// Sheets treats it as a single (possibly tall) cell on paste.
const quoteField = (s: string): string =>
  /[\n"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;

const serializeRow = (row: string[]): string => row.map(quoteField).join(TAB);

/**
 * Build a TSV string for a release. Returns '' if the release is not found.
 *
 * `visibleStreamIds` mirrors the release view's active stream facets (build +
 * connector-declared): streams outside the set are dropped from the per-stream
 * sections (and from the contention math that feeds their forecast/runway
 * lines), matching what's on screen when facets are active. Null/undefined =
 * all streams. The release-wide summary rows (dates, capacity, planned) stay
 * unfiltered, same as the app.
 */
export function releaseToTSV(
  state: AppState,
  releaseId: string,
  visibleStreamIds?: ReadonlySet<string> | null,
): string {
  const release = state.releases.find((r) => r.id === releaseId);
  if (!release) return '';

  const team = state.teams.find((t) => t.id === release.teamId);
  const sprints = [...release.sprints].sort((a, b) => a.startISO.localeCompare(b.startISO));
  const emptySprints = sprints.map(() => '');

  const visibleWorkStreams = visibleStreamIds
    ? release.workStreams.filter((ws) => visibleStreamIds.has(ws.id))
    : release.workStreams;

  // Pre-compute per-stream metrics.
  const today = todayISO();
  const ctx = releaseCapacity(release, team, today);

  const streamHealthMap = new Map(
    visibleWorkStreams.map((ws) => {
      const its = state.items.filter((i) => i.releaseId === releaseId && i.workStreamId === ws.id);
      return [ws.id, { health: streamHealth(its), items: its }] as const;
    }),
  );
  const unassignedItems = state.items.filter((i) => i.releaseId === releaseId && i.workStreamId === null);
  const unassignedHealth = streamHealth(unassignedItems);

  const activeEngineerCounts = visibleWorkStreams
    .filter((ws) => ws.engineersRequired != null && (streamHealthMap.get(ws.id)?.health.remainingPts ?? 0) > 0)
    .map((ws) => ws.engineersRequired!);
  const contention = streamContention(activeEngineerCounts, ctx.contributingCount);

  const firstRemainingIndex = release.sprints.findIndex((sp) => sp.endISO >= today);
  const beyondNextThreshold = (firstRemainingIndex < 0 ? release.sprints.length : firstRemainingIndex) + 2;
  const sprintIndexById = new Map(release.sprints.map((sp, i) => [sp.id, i] as const));
  const itemsBeyondNextFor = (its: WorkItem[]): number =>
    its.filter((i) => i.status !== 'Complete' && i.sprintId != null && (sprintIndexById.get(i.sprintId) ?? -1) >= beyondNextThreshold).length;

  /** Multi-line string for the stream header cell: name + compact metric lines. */
  const streamHeaderCell = (wsId: string | null, name: string, muted: boolean): string => {
    const its = wsId ? (streamHealthMap.get(wsId)?.items ?? []) : unassignedItems;
    const h = wsId ? (streamHealthMap.get(wsId)?.health ?? streamHealth([])) : unassignedHealth;
    const ws = wsId ? release.workStreams.find((w) => w.id === wsId) : null;
    const engReq = ws?.engineersRequired ?? null;
    // Per-stream freeze override → per-stream capacity window, matching the app views.
    const streamCtx = streamCapacityCtx(release, team, ws ?? null, ctx, today);
    const forecast = streamForecast(h, engReq, streamCtx, contention);
    const runway = streamRunway(h, engReq, streamCtx, contention, { itemsBeyondNext: itemsBeyondNextFor(its), muted });

    const healthLine = `${h.itemCount} items · ${h.pct}% done (${h.donePts}/${h.totalPts}pt) · ${h.remainingPts}pt rem${h.blockedPts > 0 ? ` · ${h.blockedPts}pt blocked` : ''}`;

    let forecastLine = `Forecast: ${forecast.verdict}`;
    if (forecast.verdict === 'at-risk') {
      forecastLine += ` — ${Math.round(forecast.shortfallPts)}pt short (~${Math.ceil(forecast.sprintsShort)} sprint${Math.ceil(forecast.sprintsShort) !== 1 ? 's' : ''})`;
    } else if (forecast.verdict === 'unconfigured') {
      forecastLine += ' — set eng. required';
    } else if (forecast.verdict === 'unestimated') {
      forecastLine += ' — add points';
    }

    let runwayLine = `Runway: ${runway.verdict}`;
    if (runway.verdict === 'under-planned') {
      runwayLine += ` — ~${Math.round(runway.unclaimedRunway)}pt unclaimed`;
      if (runway.alarm) runwayLine += ' ⚠';
    } else if (runway.verdict === 'unconfigured') {
      runwayLine += ' — set eng. required';
    } else if (runway.verdict === 'unplanned') {
      runwayLine += ' — no items created';
    }

    return [name, '----', healthLine, forecastLine, runwayLine].join('\n');
  };

  const outputRows: string[] = [
    serializeRow(['', ...sprints.map((s) => cell(s.name))]),
    serializeRow(['Dates', ...sprints.map((s) => `${fmtShort(s.startISO)} – ${fmtShort(s.endISO)}`)]),
    serializeRow(['Days off', ...sprints.map((s) => String(s.daysOff))]),
    serializeRow(['Events', ...sprints.map((s) => cell(eventsIn(release, s).map((e) => `${e.label} (${fmtShort(e.dateISO)})`).join('; ')))]),
    serializeRow(['Capacity', ...sprints.map((s) => String(sprintVel(team, s, s.daysOff)))]),
    serializeRow(['Planned', ...sprints.map((s) => String(sumPoints(state.items.filter((i) => i.releaseId === releaseId && i.sprintId === s.id))))]),
  ];

  const streamsToExport: Array<{ name: string; matchId: string | null; muted: boolean }> = [
    ...visibleWorkStreams.map((ws) => ({ name: ws.name, matchId: ws.id, muted: ws.planningMuted })),
  ];
  const unassignedInRelease = state.items.filter((i) => i.releaseId === releaseId && i.workStreamId === null);
  if (unassignedInRelease.length > 0) {
    // Catch-all for every streamless item (native and carried-in alike), so the
    // export stays complete — broader than the app's Unassigned view, hence the label.
    streamsToExport.push({ name: 'No stream', matchId: null, muted: false });
  }

  for (const { name, matchId, muted } of streamsToExport) {
    // Stream header row: multi-line stats cell in col 0, sprint columns empty.
    outputRows.push(serializeRow([streamHeaderCell(matchId, name, muted), ...emptySprints]));

    // Collect items grouped by sprint.
    const bySprint = new Map<string, WorkItem[]>(sprints.map((s) => [s.id, []]));
    for (const it of state.items) {
      if (it.releaseId !== releaseId || it.workStreamId !== matchId) continue;
      if (it.sprintId !== null) bySprint.get(it.sprintId)?.push(it);
    }
    for (const arr of bySprint.values()) {
      arr.sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
    }

    const depth = Math.max(0, ...sprints.map((s) => bySprint.get(s.id)!.length));
    for (let r = 0; r < depth; r++) {
      const row = [''];
      for (const s of sprints) {
        const it = bySprint.get(s.id)![r];
        row.push(it ? itemLabel(it) : '');
      }
      outputRows.push(serializeRow(row));
    }
  }

  return outputRows.join('\n');
}
