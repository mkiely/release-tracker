// The demo releases' invented past: opening/closing readings for the sprints that
// have already elapsed by the time the seed is generated.
//
// Real data never gets this. A reading is only ever taken by observation
// (store/migrate.ts `stampSprintReadings`), because an item records no completion
// date and a past state rebuilt from today's would be a fabrication. The seed is
// the one place that is fine: there is no real past to misreport, and without one
// every history surface would open empty on the demo. Seeded data never meets a
// migration, so these must be the shape a real reading takes; they are built by
// the same `buildSprintReading`, fed a view of the items as the story says they
// stood on that day.
//
// The story the view tells is the seed's own simplification:
// - an item exists from its `createdISO` day;
// - it has always sat in the sprint it sits in now;
// - it was Not Started until its sprint began, and holds its current status from
//   the close of its sprint on (the seed's past items are already as finished as
//   they will ever be).
// Then the `SeedStory` names the exceptions, which are the moments the history
// screens exist to show: work that slipped from sprint to sprint, and work pulled
// in after a sprint was planned.

import type { Release, Sprint, Status, Team, WorkItem } from '../types';
import { buildSprintReading } from './sprintReadings';

export interface SeedStory {
  /** Subject → elapsed sprint indices the item also sat in, unfinished, before the
   *  one it is in now. Two or more consecutive indices is chronic carry-over. */
  slipped?: Record<string, number[]>;
  /** Subjects pulled into their current sprint after it began: absent from that
   *  sprint's opening, present at its close. */
  addedMidSprint?: string[];
}

type Phase = 'opening' | 'closing';

/** Opening and closing readings for every sprint elapsed by `today`, plus the
 *  opening of the one underway (its closing is left for the live stamp, which
 *  reads it from the real current state on first load). */
export function seedSprintHistory(
  release: Release,
  team: Team | undefined,
  items: WorkItem[],
  today: string,
  story: SeedStory = {},
): Sprint[] {
  const ownItems = items.filter((i) => i.releaseId === release.id);
  const position = new Map(release.sprints.map((sp, idx) => [sp.id, idx]));
  const added = new Set(story.addedMidSprint ?? []);

  /** The items as the story says they stood at `phase` of sprint `k`. */
  const viewAt = (k: number, phase: Phase): WorkItem[] => {
    const sp = release.sprints[k];
    const day = phase === 'opening' ? sp.startISO : sp.endISO;
    return ownItems.flatMap((i): WorkItem[] => {
      if (i.createdISO && i.createdISO.slice(0, 10) > day) return [];
      const home = i.sprintId ? position.get(i.sprintId) : undefined;
      // Slipped: while it sat in an earlier sprint it was there, and unfinished.
      const slips = story.slipped?.[i.subject] ?? [];
      if (slips.includes(k)) {
        const started = phase === 'closing' || slips.includes(k - 1);
        return [{ ...i, sprintId: sp.id, status: started ? 'In Progress' : 'Not Started' }];
      }
      // ...and it arrived in its current sprint already under way.
      if (home === k && phase === 'opening' && slips.length) return [{ ...i, status: 'In Progress' }];
      // Pulled in mid-sprint: before that it waited in the backlog.
      if (home === k && phase === 'opening' && added.has(i.subject)) return [{ ...i, sprintId: null, status: 'Not Started' }];
      return [{ ...i, status: statusAt(i.status, home, k, phase) }];
    });
  };

  return release.sprints.map((sp, k) => {
    if (sp.startISO > today) return sp;
    const opening = buildSprintReading(release, team, sp, viewAt(k, 'opening'), sp.startISO);
    if (sp.endISO >= today) return { ...sp, opening };
    return { ...sp, opening, closing: buildSprintReading(release, team, sp, viewAt(k, 'closing'), sp.endISO) };
  });
}

/** An item's status at `phase` of sprint `k`, given the sprint it lives in (`home`,
 *  undefined for the backlog): untouched until its own sprint, then as it is now. */
function statusAt(current: Status, home: number | undefined, k: number, phase: Phase): Status {
  if (home === undefined) return current === 'Complete' ? current : 'Not Started';
  if (home < k) return current;
  if (home === k && phase === 'closing') return current;
  return 'Not Started';
}
