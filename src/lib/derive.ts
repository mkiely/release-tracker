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

export interface StreamHealth {
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
    items.reduce((a, i) => (pred(i) ? a + i.points : a), 0);
  const totalPts = pts(() => true);
  const donePts = pts((i) => i.status === 'Complete');
  const blockedPts = pts((i) => i.status === 'Blocked');
  const remainingPts = Math.max(0, totalPts - donePts);
  const pct = totalPts > 0 ? Math.round((donePts / totalPts) * 100) : 0;
  const pointsByStatus = STATUSES.map((k) => ({ k, v: pts((i) => i.status === k) })).filter((s) => s.v > 0);
  return { totalPts, donePts, remainingPts, blockedPts, pct, pointsByStatus };
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
