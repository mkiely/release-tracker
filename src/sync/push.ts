// Pure helper: build the PushRequest changes array from locally-dirty synced items.
// Maps local sprintId → external sprint id (backlog → null). Only includes
// dirty writeable fields — read-only fields are never pushed.

import type { WorkItem, Sprint } from '../types';
import type { PushItemChange } from './schema';

/**
 * Build the changes payload for a push. Pure: no side effects.
 *
 * @param items      All work items for the release.
 * @param sprints    The release's sprints (for sprintId → externalId mapping).
 * @param writeable  The field keys the connector advertises as writeable (e.g. ['points','sprint']).
 */
export function buildPushChanges(
  items: WorkItem[],
  sprints: Sprint[],
  writeable: string[],
): PushItemChange[] {
  const sprintExtById = new Map<string, string | null>();
  for (const s of sprints) {
    sprintExtById.set(s.id, s.externalId); // null if sprint has no externalId
  }

  const changes: PushItemChange[] = [];

  for (const item of items) {
    // Only push synced items (externalId !== null) that have pending dirty fields.
    if (!item.externalId || item.dirtyFields.length === 0) continue;

    const fields: PushItemChange['fields'] = {};
    let hasDirtyWriteable = false;

    if (writeable.includes('points') && item.dirtyFields.includes('points')) {
      fields.points = item.points;
      hasDirtyWriteable = true;
    }

    if (writeable.includes('sprint') && item.dirtyFields.includes('sprint')) {
      // Map to external sprint id; null means backlog.
      const extSprintId = item.sprintId != null ? (sprintExtById.get(item.sprintId) ?? null) : null;
      fields.extSprintId = extSprintId;
      hasDirtyWriteable = true;
    }

    if (hasDirtyWriteable) {
      changes.push({ externalId: item.externalId, fields });
    }
  }

  return changes;
}
