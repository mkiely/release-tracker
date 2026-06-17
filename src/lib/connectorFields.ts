// Pure resolution between the connector's itemTypes catalog and the app's
// push/edit machinery. The store tracks dirt with LOCAL field names
// ('points' | 'sprint'); this module bridges those to the catalog by role/target,
// so push capability is derived from the catalog — not hardcoded field names.

import type { AttrValue, Status, WorkItem } from '../types';
import type { ConnectorItemType, FieldSpec } from '../sync/schema';

// Fields the app can locally edit on a synced item. When an item's type isn't in
// the catalog (legacy/unknown), we fall back to this set so editing still works.
const LEGACY_WRITEABLE = ['points', 'sprint'] as const;

// ── Canonical-field registry ───────────────────────────────────────────────
// The single source of truth for the app's well-known (non-vocabulary) fields:
// how to recognize each one in a connector's catalog, read its pushable value off
// an item, and copy an incoming value back onto an item. Every stage that used to
// hand-enumerate 'points'/'sprint'/'status' (writeability, dirty-tracking, the
// synced baseline, sync's dirty-preservation, and the push preview/payload) now
// derives from this list, so a field a connector marks writeable round-trips
// without being re-encoded at each stage. Vocabulary (attribute) fields keep
// flowing generically through the attributes bag, keyed by FieldSpec.key.

/** A value-bearing view of a work item's canonical fields. Both a local
 *  {@link WorkItem} and an incoming (mapped) snapshot satisfy this shape, so the
 *  registry's `read`/`apply` work uniformly over either. */
export interface CanonicalView {
  points: number;
  sprintId: string | null;
  workStreamId: string | null;
  assignedMemberId: string | null;
  status: Status;
  statusNative?: { id: string; label: string } | null;
  subject: string;
  description: string;
}

interface CanonicalField {
  /** Local dirty-field name (also the key under WorkItem.syncedValues). */
  field: string;
  /** Display label for the push preview. */
  label: string;
  /** Recognize the catalog field that backs this concept. */
  match: (f: FieldSpec) => boolean;
  /** The comparable + pushable value (refs read as local ids; status as native id). */
  read: (v: CanonicalView) => AttrValue;
  /** Copy an incoming value from `v` onto `item` (status writes both columns). */
  apply: (item: WorkItem, v: CanonicalView) => void;
}

/** The canonical fields, in push-preview display order. */
export const CANONICAL_FIELDS: readonly CanonicalField[] = [
  { field: 'subject', label: 'Subject', match: (f) => f.role === 'subject', read: (v) => v.subject, apply: (it, v) => { it.subject = v.subject; } },
  { field: 'description', label: 'Description', match: (f) => f.role === 'description', read: (v) => v.description, apply: (it, v) => { it.description = v.description; } },
  { field: 'points', label: 'Points', match: (f) => f.role === 'points', read: (v) => v.points, apply: (it, v) => { it.points = v.points; } },
  { field: 'sprint', label: 'Sprint', match: (f) => f.kind === 'ref' && f.target === 'sprint', read: (v) => v.sprintId, apply: (it, v) => { it.sprintId = v.sprintId; } },
  { field: 'workStream', label: 'Work stream', match: (f) => f.kind === 'ref' && f.target === 'workStream', read: (v) => v.workStreamId, apply: (it, v) => { it.workStreamId = v.workStreamId; } },
  { field: 'assignee', label: 'Assignee', match: (f) => f.kind === 'ref' && f.target === 'member', read: (v) => v.assignedMemberId, apply: (it, v) => { it.assignedMemberId = v.assignedMemberId; } },
  { field: 'status', label: 'Status', match: (f) => f.role === 'status' || f.enumRef === 'status', read: (v) => v.statusNative?.id ?? v.status, apply: (it, v) => { it.status = v.status; it.statusNative = v.statusNative; } },
] as const;

/** Local field name → registry entry, for O(1) lookup by dirty-field name. */
export const CANONICAL_BY_FIELD: ReadonlyMap<string, CanonicalField> = new Map(CANONICAL_FIELDS.map((c) => [c.field, c]));

// Local field names with canonical meaning — a vocabulary (attribute) field whose
// key shadows one of these is ambiguous and stays read-only.
const RESERVED_LOCAL: readonly string[] = CANONICAL_FIELDS.map((c) => c.field);

/** The synced baseline (WorkItem.syncedValues) for a view, given the item's
 *  writeable set: each writeable canonical field's value plus any writeable
 *  vocabulary value present in `attributes`. Centralizes baseline construction
 *  for sync (incoming snapshot) and the post-push baseline advance (local item). */
export function canonicalBaseline(
  view: CanonicalView,
  writeable: Set<string>,
  attributes: Record<string, AttrValue> | null | undefined,
): Record<string, AttrValue> {
  const b: Record<string, AttrValue> = {};
  for (const c of CANONICAL_FIELDS) if (writeable.has(c.field)) b[c.field] = c.read(view);
  for (const key of writeable) {
    if (CANONICAL_BY_FIELD.has(key)) continue;
    if (attributes && key in attributes) b[key] = attributes[key];
  }
  return b;
}

/** Resolve an item's catalog type by its connector type id. */
export function itemTypeFor(
  typeId: string | null | undefined,
  types: ConnectorItemType[] | undefined,
): ConnectorItemType | undefined {
  if (!typeId || !types) return undefined;
  return types.find((t) => t.id === typeId);
}

/** The local writeable field names a type permits: each {@link CANONICAL_FIELDS}
 *  entry whose backing catalog field is writeable (e.g. 'points', 'sprint',
 *  'status', 'subject', 'description', 'assignee', 'workStream'), plus any
 *  writeable vocabulary field's key. Vocabulary keys that collide with a reserved
 *  canonical name are skipped — a connector field literally keyed e.g.
 *  'description' without a role is ambiguous, so it stays read-only. Unknown type
 *  → legacy {points, sprint}. */
export function writeableLocalFields(type: ConnectorItemType | undefined): Set<string> {
  if (!type) return new Set(LEGACY_WRITEABLE);
  const out = new Set<string>();
  for (const f of type.fields) {
    if (!f.writeable) continue;
    const canon = CANONICAL_FIELDS.find((c) => c.match(f));
    if (canon) out.add(canon.field);
    else if (isAttributeField(f) && !RESERVED_LOCAL.includes(f.key)) out.add(f.key);
  }
  return out;
}

/** The writeable vocabulary fields of a type — the attribute subset of
 *  {@link writeableLocalFields}, as full specs for rendering/serializing.
 *  Applies the same reserved-name guard (a vocabulary key shadowing a canonical
 *  local name stays read-only). */
export function writeableAttributeFields(type: ConnectorItemType | undefined): FieldSpec[] {
  return attributeFields(type).filter(
    (f) => f.writeable === true && !RESERVED_LOCAL.includes(f.key),
  );
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
 *  legacy fallback (points/sprint) for unknown types. Drives detail-modal locks.
 *  The concept names are exactly the {@link CANONICAL_FIELDS} field names. */
export type EditConcept = 'subject' | 'description' | 'workStream' | 'sprint' | 'assignee' | 'status' | 'points';

export function conceptWriteable(type: ConnectorItemType | undefined, concept: EditConcept): boolean {
  if (!type) return concept === 'points' || concept === 'sprint';
  const canon = CANONICAL_BY_FIELD.get(concept);
  return canon != null && type.fields.some((f) => f.writeable === true && canon.match(f));
}

// ── Capability handshake ──────────────────────────────────────────────────
// The bind-time check that a connector's catalog actually covers the semantic
// concepts the app's derivations depend on. Computed app-side from the catalog
// (the same one the service serves and the release snapshots) rather than over
// the wire — the data is already in hand and the check works offline.

/** A semantic concept the catalog fails to cover, with its user-facing impact. */
export interface MissingCapability {
  concept: 'points' | 'sprint' | 'assignee' | 'status';
  /** Short user-facing consequence, e.g. "capacity math shows 0". */
  impact: string;
}

const CAPABILITY_PROBES: { concept: MissingCapability['concept']; match: (f: FieldSpec) => boolean; impact: string }[] = [
  { concept: 'points', match: (f) => f.role === 'points', impact: 'no story points — capacity and velocity show 0' },
  { concept: 'sprint', match: (f) => f.kind === 'ref' && f.target === 'sprint', impact: 'no sprint field — items cannot be scheduled or moved' },
  { concept: 'assignee', match: (f) => f.kind === 'ref' && f.target === 'member', impact: 'no assignee field — workload by member unavailable' },
  { concept: 'status', match: (f) => f.role === 'status' || f.enumRef === 'status', impact: 'status is read-only — workflow changes happen in the backend' },
];

/** Concepts no item type covers. Empty for an absent/empty catalog (capability
 *  unknown — legacy connectors that declare nothing get no warnings). */
export function missingCapabilities(types: ConnectorItemType[] | undefined): MissingCapability[] {
  if (!types || types.length === 0) return [];
  const fields = types.flatMap((t) => t.fields);
  return CAPABILITY_PROBES
    .filter((p) => !fields.some(p.match))
    .map(({ concept, impact }) => ({ concept, impact }));
}

/** One-line positive capability summary for the bind-time form ("what you get"):
 *  creatable types, pushable fields, workflow-state count. Null when the
 *  connector declares no catalog. */
export function capabilitySummary(meta: { itemTypes?: ConnectorItemType[]; statuses?: unknown[] } | undefined): string | null {
  const types = meta?.itemTypes;
  if (!types || types.length === 0) return null;
  const parts: string[] = [];
  const creatable = types.filter((t) => t.fields.some((f) => f.creatable === true));
  if (creatable.length > 0) parts.push(`creates ${creatable.map((t) => t.label).join(', ')}`);
  const pushable = new Set<string>();
  for (const t of types) {
    for (const key of writeableLocalFields(t)) {
      const canon = CANONICAL_BY_FIELD.get(key);
      pushable.add(canon ? canon.label.toLowerCase() : (attributeFields(t).find((f) => f.key === key)?.label ?? key));
    }
  }
  if (pushable.size > 0) parts.push(`pushes ${[...pushable].join(', ')}`);
  const states = meta?.statuses?.length ?? 0;
  if (states > 0) parts.push(`${states} workflow states`);
  return parts.length > 0 ? parts.join(' · ') : null;
}
