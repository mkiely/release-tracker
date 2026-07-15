// Declarable item-table columns derived from connector vocabulary — the column
// half of the field/column descriptor registry (presentation-layer "layer 3").
// One descriptor vocabulary serves data and view: the catalog's FieldSpecs are
// projected into table columns here, so a connector declaring a new vocabulary
// field surfaces it in the sprint/stream tables with no per-field wiring.

import type { FieldSpec } from '../../sync/schema';
import type { ReleaseCatalog, WorkItem, WorkStream } from '../../types';
import { isAttributeField } from '../../lib/connectorFields';
import { displayValue } from './registry';

/** One vocabulary-driven table column. */
export interface AttrColumn {
  /** FieldSpec.key — the column identity and the attributes-bag key. */
  key: string;
  /** Header text (the first declaring type's label). */
  label: string;
  /** Display string for one item's cell: '' when the item's type doesn't declare
   *  the field (column not applicable), an em dash when declared but unset. */
  cell: (item: WorkItem) => string;
}

/**
 * Project a release's catalog snapshot into table columns: the union of
 * vocabulary fields across its item types, in first-seen catalog order. Cell
 * values format through the spec declared by the item's *own* type (enum values
 * resolve to that type's option labels), so two types sharing a key with
 * different option sets each render correctly.
 */
export function attributeColumns(catalog: ReleaseCatalog | null | undefined): AttrColumn[] {
  const byKey = new Map<string, { label: string; byType: Map<string, FieldSpec> }>();
  for (const t of catalog?.itemTypes ?? []) {
    for (const f of t.fields) {
      if (!isAttributeField(f)) continue;
      let entry = byKey.get(f.key);
      if (!entry) {
        entry = { label: f.label ?? f.key, byType: new Map() };
        byKey.set(f.key, entry);
      }
      entry.byType.set(t.id, f);
    }
  }
  return [...byKey.entries()].map(([key, entry]) => ({
    key,
    label: entry.label,
    cell: (item) => {
      const spec = item.itemType?.id != null ? entry.byType.get(item.itemType.id) : undefined;
      if (!spec) return ''; // this item's type doesn't declare the field
      return displayValue(spec, item.attributes?.[key]);
    },
  }));
}

/** One vocabulary-driven work-stream column/tag. */
export interface StreamAttrColumn {
  key: string;
  label: string;
  /** Display string for one stream: an em dash when declared but unset. */
  cell: (ws: WorkStream) => string;
}

/**
 * Project a release's work-stream field catalog into columns/tags. Flat —
 * streams have no type dimension, so every declared vocabulary field applies
 * to every stream (defensively re-filtered through isAttributeField; the
 * conformance suite enforces the same shape service-side).
 */
export function streamAttributeColumns(catalog: ReleaseCatalog | null | undefined): StreamAttrColumn[] {
  return (catalog?.workStreamFields ?? []).filter(isAttributeField).map((f) => ({
    key: f.key,
    label: f.label ?? f.key,
    cell: (ws) => displayValue(f, ws.attributes?.[f.key]),
  }));
}
