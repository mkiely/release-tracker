// Pure helper: build the PushRequest changes array from locally-dirty synced items.
// Maps local sprintId → external sprint id (backlog → null). Only includes
// dirty writeable fields — read-only fields are never pushed. Writeability is
// derived per item from the connector's itemTypes catalog: 'points'/'sprint' map
// to their named wire fields, writeable vocabulary keys ride in fields.attributes.

import type { AttrValue, WorkItem, Sprint } from '../types';
import type { ConnectorItemType, FieldSpec, PushItemChange } from './schema';
import { itemTypeFor, writeableAttributeFields, writeableLocalFieldsForItem } from '../lib/connectorFields';

/** A single writeable field changing in a pending push: its synced (old) and local (new) value. */
export interface PushFieldDiff {
  /** Local dirty-field name: 'points' | 'sprint' | a vocabulary FieldSpec.key. */
  field: string;
  /** Display label ('Points', 'Sprint', or the catalog field's label). */
  label: string;
  /** The vocabulary field's spec, for display formatting. Absent for points/sprint. */
  spec?: FieldSpec;
  /** points: number | null; sprint: sprintId (local id) | null (backlog); attrs: AttrValue. null `from` means no baseline. */
  from: AttrValue;
  to: AttrValue;
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
export function buildPushPreview(items: WorkItem[], types: ConnectorItemType[] | undefined): PushItemPreview[] {
  const previews: PushItemPreview[] = [];

  for (const item of items) {
    if (!item.externalId || item.dirtyFields.length === 0) continue;

    const writeable = writeableLocalFieldsForItem(item, types);
    const attrSpecs = new Map(writeableAttributeFields(itemTypeFor(item.itemType?.id, types)).map((f) => [f.key, f]));
    const base = item.syncedValues ?? null;
    const diffs: PushFieldDiff[] = [];

    for (const field of item.dirtyFields) {
      if (!writeable.has(field)) continue;
      const from = base && field in base ? base[field] : null;
      if (field === 'points') diffs.push({ field, label: 'Points', from, to: item.points });
      else if (field === 'sprint') diffs.push({ field, label: 'Sprint', from, to: item.sprintId });
      else {
        const spec = attrSpecs.get(field);
        diffs.push({ field, label: spec?.label ?? field, spec, from, to: item.attributes?.[field] ?? null });
      }
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
 * @param items    All work items for the release.
 * @param sprints  The release's sprints (for sprintId → externalId mapping).
 * @param types    The connector's itemTypes catalog; writeability is derived per item.
 */
export function buildPushChanges(
  items: WorkItem[],
  sprints: Sprint[],
  types: ConnectorItemType[] | undefined,
): PushItemChange[] {
  const sprintExtById = new Map<string, string | null>();
  for (const s of sprints) {
    sprintExtById.set(s.id, s.externalId); // null if sprint has no externalId
  }

  const changes: PushItemChange[] = [];

  for (const item of items) {
    // Only push synced items (externalId !== null) that have pending dirty fields.
    if (!item.externalId || item.dirtyFields.length === 0) continue;

    const writeable = writeableLocalFieldsForItem(item, types);
    const fields: PushItemChange['fields'] = {};
    let attributes: Record<string, AttrValue> | undefined;

    for (const field of item.dirtyFields) {
      if (!writeable.has(field)) continue;
      if (field === 'points') {
        fields.points = item.points;
      } else if (field === 'sprint') {
        // Map to external sprint id; null means backlog.
        fields.extSprintId = item.sprintId != null ? (sprintExtById.get(item.sprintId) ?? null) : null;
      } else {
        (attributes ??= {})[field] = item.attributes?.[field] ?? null;
      }
    }
    if (attributes) fields.attributes = attributes;

    if (Object.keys(fields).length > 0) {
      changes.push({ externalId: item.externalId, fields });
    }
  }

  return changes;
}
