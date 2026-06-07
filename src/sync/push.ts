// Pure helper: build the PushRequest changes array from locally-dirty synced items.
// Maps local sprintId → external sprint id (backlog → null). Only includes
// dirty writeable fields — read-only fields are never pushed.

import type { WorkItem, Sprint } from '../types';
import type { PushItemChange } from './schema';

/** A single writeable field changing in a pending push: its synced (old) and local (new) value. */
export interface PushFieldDiff {
  field: 'points' | 'sprint';
  /** points: number | null; sprint: sprintId (local id) | null (backlog). null `from` means no baseline. */
  from: number | string | null;
  to: number | string | null;
}

/** One item's pending push: which writeable fields are changing and by how much. */
export interface PushItemPreview {
  itemId: string;
  externalId: string;
  key: string;
  subject: string;
  diffs: PushFieldDiff[];
}

/**
 * Build a human-readable preview of what a push will send: per-item, the
 * writeable fields that are dirty with their synced (old) → local (new) values.
 * Pure. Mirrors buildPushChanges' filtering so the preview matches the payload.
 * Sprint ids are returned raw (local ids); the caller resolves them to names.
 */
export function buildPushPreview(items: WorkItem[], writeable: string[]): PushItemPreview[] {
  const previews: PushItemPreview[] = [];

  for (const item of items) {
    if (!item.externalId || item.dirtyFields.length === 0) continue;

    const base = item.syncedValues ?? null;
    const diffs: PushFieldDiff[] = [];

    if (writeable.includes('points') && item.dirtyFields.includes('points')) {
      diffs.push({ field: 'points', from: base ? base.points : null, to: item.points });
    }
    if (writeable.includes('sprint') && item.dirtyFields.includes('sprint')) {
      diffs.push({ field: 'sprint', from: base ? base.sprintId : null, to: item.sprintId });
    }

    if (diffs.length) {
      previews.push({ itemId: item.id, externalId: item.externalId, key: item.key, subject: item.subject, diffs });
    }
  }

  return previews;
}

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
