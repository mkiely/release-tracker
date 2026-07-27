// Resolving an ExportScope to the set of work streams it selects. Pure, so the
// scope→streams rule is unit-testable independently of the menu that sets it.

import type { WorkStream } from '../types';
import type { ExportScope } from '../store/exportScope';

/**
 * The stream ids a scope selects, or `undefined` for "every stream".
 *
 * `undefined` is the no-filtering signal both consumers already understand —
 * `releaseToTSV(state, releaseId, visibleStreamIds?)` and `buildSnapshot`'s
 * `opts.visibleStreamIds` each treat null/undefined as the whole release.
 *
 * `filters` falls back to every stream when nothing is selected, so a stale
 * preference can never silently export an empty release.
 */
export function scopeStreamIds(
  scope: ExportScope,
  workStreams: readonly WorkStream[],
  facetVisibleIds: ReadonlySet<string> | undefined,
): ReadonlySet<string> | undefined {
  switch (scope) {
    case 'all-builds':
      return undefined;
    case 'filters':
      return facetVisibleIds;
    case 'current-build':
      return new Set(workStreams.filter((ws) => ws.build == null).map((ws) => ws.id));
  }
}

/** Human label for a scope. Used both in the Share menu and in the confirmation
 *  toasts, so the choice is stated before AND after the action. */
export function scopeLabel(scope: ExportScope, streamCount: number): string {
  const streams = `${streamCount} stream${streamCount === 1 ? '' : 's'}`;
  switch (scope) {
    case 'all-builds':
      return `all builds (${streams})`;
    case 'filters':
      return `current filters (${streams})`;
    case 'current-build':
      return `current build only (${streams})`;
  }
}

/** Short label for the menu option itself, without the count. */
export function scopeOptionLabel(scope: ExportScope): string {
  switch (scope) {
    case 'all-builds':
      return 'All builds';
    case 'filters':
      return 'Match current filters';
    case 'current-build':
      return 'Current build only';
  }
}

/** How many streams a scope selects — shown against each option in the Share menu
 *  so the consequence of the choice is visible before it's made. */
export function scopeStreamCount(
  scope: ExportScope,
  workStreams: readonly WorkStream[],
  facetVisibleIds: ReadonlySet<string> | undefined,
): number {
  const ids = scopeStreamIds(scope, workStreams, facetVisibleIds);
  return ids ? ids.size : workStreams.length;
}
