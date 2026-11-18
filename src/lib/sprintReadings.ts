// Building one point-in-time reading of a sprint — see Sprint.opening/closing in
// types.ts for what the two readings mean and why they are only ever observed.
//
// This file knows how to describe a sprint on a given day from a set of items. It
// does not decide WHEN a reading is taken; that is the stamp's job
// (store/migrate.ts `stampSprintReadings`). Keeping them apart is what lets the
// seed describe its invented past through the very same builder, so a seeded
// reading can never drift from the shape a real one takes.

import type { Release, Sprint, SprintReading, SprintReadingStream, Team, WorkItem } from '../types';

/** True while `today` falls inside the sprint's inclusive range. ISO dates compare lexically. */
export const isUnderway = (sp: Sprint, today: string): boolean => sp.startISO <= today && today <= sp.endISO;

/** Describe `sprint` as it stands in `items` (the release's items) on `dateISO`. */
export function buildSprintReading(
  release: Release,
  team: Team | undefined,
  sprint: Sprint,
  items: WorkItem[],
  dateISO: string,
): SprintReading {
  const streams: SprintReadingStream[] = release.workStreams.map((ws) => ({
    ...scopeOf(items.filter((i) => i.workStreamId === ws.id)),
    workStreamId: ws.id,
    engineersRequired: ws.engineersRequired,
  }));
  // An item whose stream no longer exists counts as unstreamed, matching how the
  // screens group it — otherwise its points would vanish from every total.
  const known = new Set(release.workStreams.map((ws) => ws.id));
  const unstreamed = items.filter((i) => i.workStreamId === null || !known.has(i.workStreamId));
  if (unstreamed.length) streams.push({ ...scopeOf(unstreamed), workStreamId: null, engineersRequired: null });

  return {
    dateISO,
    contributingCount: team ? team.members.filter((m) => !m.nonContributing).length : 0,
    items: items
      .filter((i) => i.sprintId === sprint.id)
      .map((i) => ({ id: i.id, key: i.key, points: i.points, workStreamId: i.workStreamId, status: i.status })),
    streams,
  };
}

function scopeOf(items: WorkItem[]): { scopePts: number; remainingPts: number } {
  let scopePts = 0;
  let remainingPts = 0;
  for (const i of items) {
    const p = i.points ?? 0;
    scopePts += p;
    if (i.status !== 'Complete') remainingPts += p;
  }
  return { scopePts, remainingPts };
}

/** Same content, whatever day each was taken. The stamp uses this to leave a
 *  reading alone (and the state reference unchanged) when nothing has moved. */
export function sameReading(a: SprintReading, b: SprintReading): boolean {
  return JSON.stringify({ ...a, dateISO: '' }) === JSON.stringify({ ...b, dateISO: '' });
}
