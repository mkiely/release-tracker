// Work streams laid out against the release calendar — the Gantt reading.
//
// The stream-axis table already shows streams × sprints as a grid, so the thing a
// timeline adds is not "streams over sprints" but a CONTINUOUS date axis: bars whose
// length is proportional to real elapsed time, and markers (today, each stream's code
// freeze) that land between sprint boundaries rather than snapping to them. A stream
// that runs one long sprint and a stream that runs three short ones read identically
// in the grid and quite differently here, which is the whole point.
//
// Work streams carry no dates of their own — only their items' sprint assignments do.
// So a span is DERIVED: first sprint holding one of the stream's items through the
// last. That makes it a statement about where the work is currently planned, not a
// commitment anybody made, and a stream with no sprinted work has no span at all
// rather than a zero-width bar pinned to the start of the release.
//
// Pure: `today` is a parameter, nothing reads the store. Shared by the in-app panel
// and the standalone summary viewer, which is why spans are expressed as sprint
// INDICES — the snapshot payload carries them as two small numbers and resolves them
// against its own sprint list, with no dates duplicated into the URL.

import type { Sprint, WorkItem } from '../types';
import { dOf } from './dates';

/** The sprint range a stream's planned work occupies, as indices into the release's
 *  sprint list (inclusive both ends). */
export interface StreamSpan {
  startIdx: number;
  endIdx: number;
}

/**
 * The span a set of items occupies, or null when none of them is in a sprint.
 *
 * Unsprinted items (backlog) are ignored rather than widening the span to the whole
 * release: a stream whose work is entirely unscheduled has no position on a calendar,
 * and drawing it as a full-width bar would claim a plan that doesn't exist.
 */
export function spanOfItems(items: readonly WorkItem[], sprintIndexById: ReadonlyMap<string, number>): StreamSpan | null {
  let startIdx = Infinity;
  let endIdx = -Infinity;
  for (const it of items) {
    if (it.sprintId == null) continue;
    const i = sprintIndexById.get(it.sprintId);
    if (i === undefined) continue; // item points at a sprint this release no longer has
    if (i < startIdx) startIdx = i;
    if (i > endIdx) endIdx = i;
  }
  return endIdx < 0 ? null : { startIdx, endIdx };
}

/** Sprint id → its index in release order. Built once per render and passed down. */
export function sprintIndex(sprints: readonly Sprint[]): Map<string, number> {
  return new Map(sprints.map((sp, i) => [sp.id, i]));
}

/** The minimum a timeline needs to know about a sprint: its name and its real dates. */
export interface TimelineSprint {
  name: string;
  startISO: string;
  endISO: string;
}

/** One bar on the timeline. Presentation-free — the renderer decides colour and
 *  ordering; this says what the bar means. */
export interface TimelineRow {
  /** Stable key for React, and the stream id when the row came from one. */
  id: string;
  name: string;
  /** null = no sprinted work, so no bar. Rendered as an explicit "unscheduled" row
   *  rather than dropped, because a stream with reserved engineers and nothing on
   *  the calendar is exactly what a planner needs to see. */
  span: StreamSpan | null;
  /** Points-based completion, 0–100 — the filled portion of the bar. */
  pct: number;
  /** This stream's effective code freeze (its own override, or the release's), as a
   *  tick on its bar. */
  freezeISO: string;
  itemCount: number;
  totalPts: number;
  remainingPts: number;
  /** Drives the bar's tone. Kept as the same verdict the rest of the app shows, so a
   *  stream can't read amber here and green two screens away. */
  tone: 'ok' | 'risk' | 'neutral';
}

/** A timeline's horizontal extent, in the same ISO dates everything else uses. */
export interface TimelineWindow {
  startISO: string;
  endISO: string;
}

/** The release window a timeline is drawn against: the first sprint's start through
 *  the last sprint's end. Null when the release has no sprints — there is no axis to
 *  draw, and callers render an empty state rather than dividing by zero. */
export function timelineWindow(sprints: readonly TimelineSprint[]): TimelineWindow | null {
  if (sprints.length === 0) return null;
  const startISO = sprints.reduce((a, sp) => (sp.startISO < a ? sp.startISO : a), sprints[0].startISO);
  const endISO = sprints.reduce((a, sp) => (sp.endISO > a ? sp.endISO : a), sprints[0].endISO);
  return { startISO, endISO };
}

/**
 * Where a date falls across the window, as a percentage.
 *
 * Deliberately unclamped at the caller's discretion — see {@link clampPct}. A code
 * freeze set beyond the last sprint is a real condition worth seeing pinned at the
 * edge, but a raw value past 100 would draw outside the track, so renderers clamp
 * and mark rather than letting the number decide.
 */
export function pctOfDate(iso: string, window: TimelineWindow): number {
  const t0 = dOf(window.startISO).getTime();
  const t1 = dOf(window.endISO).getTime();
  // A single-day window (one one-day sprint) has no extent to divide by; everything
  // in it sits at the start.
  if (t1 <= t0) return 0;
  return ((dOf(iso).getTime() - t0) / (t1 - t0)) * 100;
}

/** Hold a percentage inside the track. */
export const clampPct = (n: number): number => (n < 0 ? 0 : n > 100 ? 100 : n);

/** A bar's horizontal placement, as left/width percentages of the track. */
export interface BarGeometry {
  leftPct: number;
  widthPct: number;
}

/**
 * Place a span's bar. The bar runs from the start of its first sprint to the end of
 * its last, so it covers the days the work is actually scheduled across rather than
 * the distance between two sprint midpoints.
 *
 * A minimum width keeps a single short sprint from rendering as an invisible sliver
 * on a long release — a bar too thin to see reads as "no work here", which is the one
 * thing it must not say.
 */
export function barGeometry(
  span: StreamSpan,
  sprints: readonly TimelineSprint[],
  window: TimelineWindow,
  minWidthPct = 1.5,
): BarGeometry {
  const first = sprints[span.startIdx];
  const last = sprints[span.endIdx];
  if (!first || !last) return { leftPct: 0, widthPct: 0 };
  const leftPct = clampPct(pctOfDate(first.startISO, window));
  const rightPct = clampPct(pctOfDate(last.endISO, window));
  const widthPct = Math.max(minWidthPct, rightPct - leftPct);
  // Keep a widened sliver inside the track rather than letting it overhang the end.
  return { leftPct: Math.min(leftPct, 100 - widthPct), widthPct };
}
