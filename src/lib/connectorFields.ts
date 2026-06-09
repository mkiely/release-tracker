// Pure resolution between the connector's itemTypes catalog and the app's
// push/edit machinery. The store tracks dirt with LOCAL field names
// ('points' | 'sprint'); this module bridges those to the catalog by role/target,
// so push capability is derived from the catalog — not hardcoded field names.

import type { WorkItem } from '../types';
import type { ConnectorItemType, FieldSpec } from '../sync/schema';

// Fields the app can locally edit on a synced item. When an item's type isn't in
// the catalog (legacy/unknown), we fall back to this set so editing still works.
const LEGACY_WRITEABLE = ['points', 'sprint'] as const;

/** Resolve an item's catalog type by its connector type id. */
export function itemTypeFor(
  typeId: string | null | undefined,
  types: ConnectorItemType[] | undefined,
): ConnectorItemType | undefined {
  if (!typeId || !types) return undefined;
  return types.find((t) => t.id === typeId);
}

/** The local writeable fields ('points'/'sprint') a type permits, by scanning its
 *  catalog fields for writeable role=points / ref→sprint. Unknown type → legacy. */
export function writeableLocalFields(type: ConnectorItemType | undefined): Set<string> {
  if (!type) return new Set(LEGACY_WRITEABLE);
  const out = new Set<string>();
  for (const f of type.fields) {
    if (!f.writeable) continue;
    if (f.role === 'points') out.add('points');
    if (f.kind === 'ref' && f.target === 'sprint') out.add('sprint');
  }
  return out;
}

/** Writeable local fields for a specific item (resolves its type, then derives). */
export function writeableLocalFieldsForItem(item: WorkItem, types: ConnectorItemType[] | undefined): Set<string> {
  return writeableLocalFields(itemTypeFor(item.itemType?.id, types));
}

/** Union of writeable local fields across all types — used where a per-item type
 *  isn't resolved (e.g. sync's dirty-preservation pass). */
export function allWriteableLocalFields(types: ConnectorItemType[] | undefined): Set<string> {
  if (!types || types.length === 0) return new Set(LEGACY_WRITEABLE);
  const out = new Set<string>();
  for (const t of types) for (const f of writeableLocalFields(t)) out.add(f);
  return out;
}

/** Whether a catalog field is connector *vocabulary* (an attribute) rather than a
 *  canonical concept: no semantic role, not a ref, not an app-canonical enum. Its
 *  values travel in the attributes bag, keyed by FieldSpec.key. */
export function isAttributeField(f: FieldSpec): boolean {
  return f.role == null && f.kind !== 'ref' && f.enumRef == null;
}

/** The vocabulary (attribute) fields a type declares, in catalog order. */
export function attributeFields(type: ConnectorItemType | undefined): FieldSpec[] {
  return (type?.fields ?? []).filter(isAttributeField);
}

/** Whether a well-known editable concept is writeable for an item's type, with the
 *  legacy fallback (points/sprint) for unknown types. Drives detail-modal locks. */
export type EditConcept = 'subject' | 'description' | 'workStream' | 'sprint' | 'assignee' | 'status' | 'points';

// Maps each editable concept to the catalog field that represents it.
const CONCEPT_MATCH: Record<EditConcept, (f: FieldSpec) => boolean> = {
  points: (f) => f.role === 'points',
  subject: (f) => f.role === 'subject',
  description: (f) => f.role === 'description',
  status: (f) => f.role === 'status' || f.enumRef === 'status',
  workStream: (f) => f.kind === 'ref' && f.target === 'workStream',
  sprint: (f) => f.kind === 'ref' && f.target === 'sprint',
  assignee: (f) => f.kind === 'ref' && f.target === 'member',
};

export function conceptWriteable(type: ConnectorItemType | undefined, concept: EditConcept): boolean {
  if (!type) return concept === 'points' || concept === 'sprint';
  const match = CONCEPT_MATCH[concept];
  return type.fields.some((f) => f.writeable === true && match(f));
}
