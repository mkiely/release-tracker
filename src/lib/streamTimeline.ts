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

/**
 * One unbroken run of sprints holding a stream's work, as indices into the
 * release's sprint list (inclusive both ends), plus what sits in it.
 *
 * A stream is a LIST of these, not a single range. The distinction is the whole
 * point of the view: a stream with work in sprints 1–2 and again in 5–8 is not
 * working through sprints 3–4, and drawing one bar from 1 to 8 asserts that it is.
 * Worse, a single stray item late in the release — one ticket parked near the code
 * freeze — stretched the old single-span bar across the entire calendar, which is
 * precisely the reading a timeline exists to prevent.
 */
export interface StreamSegment {
  startIdx: number;
  endIdx: number;
  /** Points scheduled in this run, and the completed share of them. Per-segment
   *  rather than per-stream so a finished early run and an untouched later one
   *  don't average into one misleading fill. */
  pts: number;
  donePts: number;
}

/** Completed share of a segment, 0–100. An unestimated run (no points at all) reads
 *  0 rather than dividing by zero — "nothing measured", which is what it is. */
export const segmentPct = (s: StreamSegment): number =>
  s.pts > 0 ? Math.round((s.donePts / s.pts) * 100) : 0;

/**
 * The runs of sprints a set of items occupies. Empty when none of them is in a
 * sprint.
 *
 * Unsprinted items (backlog) are ignored rather than widening a run to the whole
 * release: a stream whose work is entirely unscheduled has no position on a
 * calendar, and drawing it as a full-width bar would claim a plan that doesn't
 * exist. A sprint with items but no estimates still opens a run — there IS work
 * there, and its bar simply renders unfilled.
 */
export function segmentsOfItems(
  items: readonly WorkItem[],
  sprintIndexById: ReadonlyMap<string, number>,
): StreamSegment[] {
  // Points per occupied sprint index. A sprint is "occupied" by presence of an item,
  // never by its points — that is the null-points case above.
  const pts = new Map<number, { pts: number; donePts: number }>();
  for (const it of items) {
    if (it.sprintId == null) continue;
    const i = sprintIndexById.get(it.sprintId);
    if (i === undefined) continue; // item points at a sprint this release no longer has
    const cell = pts.get(i) ?? { pts: 0, donePts: 0 };
    cell.pts += it.points ?? 0;
    if (it.status === 'Complete') cell.donePts += it.points ?? 0;
    pts.set(i, cell);
  }

  const occupied = [...pts.keys()].sort((a, b) => a - b);
  const segments: StreamSegment[] = [];
  for (const i of occupied) {
    const last = segments[segments.length - 1];
    // Contiguous means "the very next sprint". A single empty sprint is a real gap:
    // it is a fortnight in which this stream is planned to do nothing, and the user
    // asked to see exactly that.
    if (last && i === last.endIdx + 1) {
      last.endIdx = i;
      last.pts += pts.get(i)!.pts;
      last.donePts += pts.get(i)!.donePts;
    } else {
      segments.push({ startIdx: i, endIdx: i, ...pts.get(i)! });
    }
  }
  return segments;
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
  /** One bar per unbroken run of sprints holding work; empty = nothing scheduled,
   *  which renders as an explicit "unscheduled" row rather than being dropped,
   *  because a stream with reserved engineers and nothing on the calendar is exactly
   *  what a planner needs to see. */
  segments: StreamSegment[];
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
 * Place a segment's bar. The bar runs from the start of its first sprint to the end
 * of its last, so it covers the days the work is actually scheduled across rather
 * than the distance between two sprint midpoints.
 *
 * A minimum width keeps a single short sprint from rendering as an invisible sliver
 * on a long release — a bar too thin to see reads as "no work here", which is the one
 * thing it must not say.
 */
export function barGeometry(
  segment: { startIdx: number; endIdx: number },
  sprints: readonly TimelineSprint[],
  window: TimelineWindow,
  minWidthPct = 1.5,
): BarGeometry {
  const first = sprints[segment.startIdx];
  const last = sprints[segment.endIdx];
  if (!first || !last) return { leftPct: 0, widthPct: 0 };
  const leftPct = clampPct(pctOfDate(first.startISO, window));
  const rightPct = clampPct(pctOfDate(last.endISO, window));
  const widthPct = Math.max(minWidthPct, rightPct - leftPct);
  // Keep a widened sliver inside the track rather than letting it overhang the end.
  return { leftPct: Math.min(leftPct, 100 - widthPct), widthPct };
}
