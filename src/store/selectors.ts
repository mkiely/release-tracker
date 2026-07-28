// Lookups over an AppState snapshot. Pure, so the same function works inside a
// `useStore(...)` selector (reactive) and against a plain snapshot (tests, async
// flows) alike — there is no separate "read the store outside React" path.

import type { AppState, Release, Team, WorkItem } from '../types';

/** The team with this id, or undefined. */
export const selTeam = (s: AppState, id: string | undefined): Team | undefined =>
  s.teams.find((t) => t.id === id);

/** The release with this id, or undefined. */
export const selRelease = (s: AppState, id: string | undefined): Release | undefined =>
  s.releases.find((r) => r.id === id);

/** Every work item belonging to a release. */
export const selItemsFor = (s: AppState, releaseId: string): WorkItem[] =>
  s.items.filter((i) => i.releaseId === releaseId);

/** Every work item assigned to one work stream within a release. */
export const selItemsForStream = (s: AppState, releaseId: string, wsId: string): WorkItem[] =>
  s.items.filter((i) => i.releaseId === releaseId && i.workStreamId === wsId);

/** Unassigned = on this release's build (build === null, i.e. not carried in
 *  from a prior build) but not yet organized into a work stream. Carried-in
 *  items without a stream are NOT unassigned — they surface via the backlog. */
export const selUnassignedItems = (s: AppState, releaseId: string): WorkItem[] =>
  s.items.filter((i) => i.releaseId === releaseId && i.workStreamId === null && i.build === null);

/** Backlog = every incomplete item in the release (the team's remaining work),
 *  regardless of build or work-stream assignment. */
export const selBacklogItems = (s: AppState, releaseId: string): WorkItem[] =>
  s.items.filter((i) => i.releaseId === releaseId && i.status !== 'Complete');

/** The work item with this id, or undefined. */
export const selItem = (s: AppState, id: string): WorkItem | undefined =>
  s.items.find((i) => i.id === id);

/** Count of items in the push queue for a release: dirty synced items (edits) plus
 *  locally-queued creates (`pendingCreate`). Drives the Push button's count/visibility. */
export const selDirtyCount = (s: AppState, releaseId: string): number =>
  s.items.filter(
    (i) => i.releaseId === releaseId && ((i.externalId !== null && i.dirtyFields.length > 0) || i.pendingCreate),
  ).length;
