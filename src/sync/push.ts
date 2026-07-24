// Pure helper: build the PushRequest changes array from locally-dirty synced items.
// Maps local ref ids → external ids (sprint/workStream/member; backlog/unassigned
// → null). Only includes dirty writeable fields — read-only fields are never
// pushed. Writeability and field identity are derived per item from the
// connector's itemTypes catalog via the canonical-field registry: canonical fields
// map to their named wire slots, writeable vocabulary keys ride in fields.attributes.

import type { CreateItemRequest } from '@release-tracker/sync-contract';
import type { AttrValue, Member, WorkItem, Sprint, WorkStream } from '../types';
import type { ConnectorItemType, FieldSpec, PushItemChange } from './schema';
import { CANONICAL_BY_FIELD, itemTypeFor, writeableAttributeFields, writeableLocalFieldsForItem } from '../lib/connectorFields';

/** The release entities a push resolves local ref ids against. */
export interface PushRefs {
  sprints: Sprint[];
  workStreams: WorkStream[];
  members: Member[];
}

/** A single writeable field changing in a pending push: its synced (old) and local (new) value. */
export interface PushFieldDiff {
  /** Local dirty-field name: a canonical field name (CANONICAL_FIELDS) or a vocabulary FieldSpec.key. */
  field: string;
  /** Display label (a canonical field's label, or the catalog field's label). */
  label: string;
  /** The vocabulary field's spec, for display formatting. Absent for canonical fields. */
  spec?: FieldSpec;
  /** Canonical fields read as their pushable value (refs as local ids, status as native id);
   *  vocabulary fields as their AttrValue. null `from` means no baseline. */
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
      const canon = CANONICAL_BY_FIELD.get(field);
      if (canon) {
        // Canonical fields read as their pushable value (refs as local ids, which
        // the caller resolves to display labels; status as its native id).
        diffs.push({ field, label: canon.label, from, to: canon.read(item) });
      } else {
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

/** Create-item request body minus `connector` (the caller supplies that) — the same
 *  shape the sync client's `createItem` accepts. Kept here (not imported from the
 *  client) so this pure module stays free of the client/fixtures layer. */
export type CreateItemBody = Omit<CreateItemRequest, 'connector'>;

/**
 * Derive a create request from a locally-queued (`pendingCreate`) work item — the
 * deferred counterpart to {@link buildPushChanges}. Mirrors what the create modal
 * used to send at save time, but read from the live item so edits made before the
 * push are reflected: creatable ref fields resolve to external ids, other creatable
 * fields (subject/description/points/status, plus vocabulary) go in `fields` keyed
 * by their FieldSpec.key. Pure. An item whose type isn't in the catalog yields an
 * empty request (nothing creatable is known).
 */
export function buildCreateRequest(
  item: WorkItem,
  refs: PushRefs,
  types: ConnectorItemType[] | undefined,
): CreateItemBody {
  const type = itemTypeFor(item.itemType?.id, types);
  const extBy = (entities: { id: string; externalId: string | null }[], localId: string | null) =>
    localId != null ? (entities.find((e) => e.id === localId)?.externalId ?? null) : null;

  let extWorkStreamId: string | null = null;
  let extSprintId: string | null = null;
  let extAssigneeId: string | null = null;
  const fields: Record<string, unknown> = {};

  for (const f of (type?.fields ?? []).filter((f) => f.creatable)) {
    if (f.kind === 'ref') {
      if (f.target === 'workStream') extWorkStreamId = extBy(refs.workStreams, item.workStreamId);
      else if (f.target === 'sprint') extSprintId = extBy(refs.sprints, item.sprintId);
      else if (f.target === 'member') extAssigneeId = extBy(refs.members, item.assignedMemberId);
      continue;
    }
    if (f.role === 'subject') fields[f.key] = item.subject;
    else if (f.role === 'description') fields[f.key] = item.description;
    else if (f.role === 'points') fields[f.key] = item.points;
    else if (f.role === 'status' || f.enumRef === 'status') fields[f.key] = item.status;
    else fields[f.key] = item.attributes?.[f.key] ?? null;
  }

  return { type: item.itemType?.id ?? '', extWorkStreamId, extSprintId, extAssigneeId, fields };
}

/**
 * Build the changes payload for a push. Pure: no side effects.
 *
 * @param items  All work items for the release.
 * @param refs   The release's sprints/workStreams/members, for local→external
 *               ref-id resolution.
 * @param types  The connector's itemTypes catalog; writeability is derived per item.
 */
export function buildPushChanges(
  items: WorkItem[],
  refs: PushRefs,
  types: ConnectorItemType[] | undefined,
): PushItemChange[] {
  const extById = (entities: { id: string; externalId: string | null }[]) => {
    const map = new Map<string, string | null>();
    for (const e of entities) map.set(e.id, e.externalId); // null if not yet synced
    return map;
  };
  const sprintExtById = extById(refs.sprints);
  const wsExtById = extById(refs.workStreams);
  const memberExtById = extById(refs.members);
  const resolveExt = (map: Map<string, string | null>, localId: string | null) =>
    localId != null ? (map.get(localId) ?? null) : null;

  const changes: PushItemChange[] = [];

  for (const item of items) {
    // Only push synced items (externalId !== null) that have pending dirty fields.
    if (!item.externalId || item.dirtyFields.length === 0) continue;

    const writeable = writeableLocalFieldsForItem(item, types);
    const fields: PushItemChange['fields'] = {};
    let attributes: Record<string, AttrValue> | undefined;

    for (const field of item.dirtyFields) {
      if (!writeable.has(field)) continue;
      switch (field) {
        case 'subject': fields.subject = item.subject; break;
        case 'description': fields.description = item.description; break;
        case 'points': fields.points = item.points; break;
        // Refs map to external ids; null means backlog / no stream / unassigned.
        case 'sprint': fields.extSprintId = resolveExt(sprintExtById, item.sprintId); break;
        case 'workStream': fields.extWorkStreamId = resolveExt(wsExtById, item.workStreamId); break;
        case 'assignee': fields.extAssigneeId = resolveExt(memberExtById, item.assignedMemberId); break;
        // Status is only expressible as a native vocabulary id; without one (no
        // vocabulary declared) the status change cannot be pushed and is skipped.
        case 'status': if (item.statusNative?.id) fields.statusId = item.statusNative.id; break;
        // Vocabulary value, keyed by FieldSpec.key.
        default: (attributes ??= {})[field] = item.attributes?.[field] ?? null;
      }
    }
    if (attributes) fields.attributes = attributes;

    if (Object.keys(fields).length > 0) {
      changes.push({ externalId: item.externalId, fields });
    }
  }

  return changes;
}
