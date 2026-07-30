// The item table's columns, as data — the column half of the field/column
// descriptor registry (presentation-layer "layer 3"). One `ItemColumn` shape with
// two producers: the app's own columns are authored below, and a connector's
// vocabulary FieldSpecs are projected into the same shape, so a connector
// declaring a new field surfaces as a column with no per-field wiring.
//
// This mirrors lib/facets.ts, which already unified built-in and catalog-derived
// facets on the filter axis. Before this, built-in columns were positional JSX in
// two files (headers and rows) that had to agree by eye, with their widths in a
// third and their sort semantics in a fourth. Both the header row and ItemRow now
// iterate one ordered array, so they cannot disagree. Full design and the phases
// still open (hiding, ordering): docs/item-columns.md.

import type { ReactNode } from 'react';
import type { FieldSpec } from '../../sync/schema';
import type { SortCtx, SortKind, SortSpec } from '../../views/table/itemSort';
import type { Member, ReleaseCatalog, WorkItem, WorkStream } from '../../types';
import { isAttributeField } from '../../lib/connectorFields';
import { Avatar } from '../Avatar';
import { StatusPill } from '../Badges';
import { DirtyDot } from '../DirtyDot';
import { StreamChip } from '../StreamChip';
import { typeVars } from '../typeColor';
import { displayValue } from './registry';
import type { CellAlign, CellKind, ColWidth } from './cells';
import styles from './cells.module.css';

/** What a cell needs beyond the item itself. A view supplies only the accessors
 *  its table has columns for — which is also how `applies` decides whether the
 *  Sprint and Work Stream columns exist at all (see below). */
export interface ItemCellCtx {
  members: Member[];
  /** Work stream identity per item; absent in tables already grouped by stream. */
  workStream?: (item: WorkItem) => { id: string | null; name: string };
  /** Sprint name per item; absent in tables already scoped to one sprint. */
  sprintName?: (item: WorkItem) => string;
}

/** One column of the item table, canonical or connector-declared. */
export interface ItemColumn {
  /** Column identity: a built-in name, or `attr:<FieldSpec.key>`. Also the sort id. */
  key: string;
  /** Header text. */
  label: string;
  width: ColWidth;
  align?: CellAlign;
  /** Typography for a declarative cell; omit when `cell` renders its own. */
  kind?: CellKind;
  /** Text for a declarative cell. '' renders an empty (not-applicable) cell. */
  value?: (item: WorkItem, ctx: ItemCellCtx) => string;
  /** Custom cell, for columns that render a control rather than a value. */
  cell?: (item: WorkItem, ctx: ItemCellCtx) => ReactNode;
  /** How the column sorts — over the item's value, never the rendered cell. */
  sort?: SortSpec;
  /** Structural visibility: whether this table has the column at all. */
  applies?: (ctx: ItemCellCtx) => boolean;
  /** Measured width spec (fit-to-content), given the items in scope. */
  fit?: (items: WorkItem[]) => { values: string[]; fontFamily?: string; fontWeight?: string; chrome: number; min: number; max?: number };
}

// Chrome around each cell's text, in px — the fixed padding/marker/pill width the
// measured text has to sit inside. Sourced from cells.module.css and StatusPill.
const KEY_PADDING = 24; //  mono cell: 14 left + 10 right
const KEY_DIRTY = 11; //    dirty marker: gap (5) + dot (6)
const STATUS_CHROME = 44; // cell pad (18) + pill pad (13) + dot (5) + gap (5) + buffer (3)

// ── Built-in columns ───────────────────────────────────────────────────────
// The app's own columns. Five render custom cells (an identifier with its dirty
// marker, a type chip, an avatar, a status pill, a stream chip) because they show
// a treatment rather than a value; the rest declare a kind and a value.

/** Item key — fit to the full identifier, never truncated. */
export const KEY_COLUMN: ItemColumn = {
  key: 'key',
  label: 'Key',
  width: { base: 98, var: 'key', min: 72 },
  kind: 'mono',
  sort: { kind: 'text', valueOf: (i) => i.key },
  cell: (i) => (
    <>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.key}</span>
      {i.dirtyFields.length > 0 && <DirtyDot />}
    </>
  ),
  fit: (items) => ({
    values: [...items.map((i) => i.key), 'Key'],
    fontFamily: 'var(--rt-mono)',
    chrome: KEY_PADDING + (items.some((i) => i.dirtyFields.length > 0) ? KEY_DIRTY : 0),
    min: 72,
  }),
};

export const TYPE_COLUMN: ItemColumn = {
  key: 'type',
  label: 'Type',
  width: { base: 100, var: 'type', min: 50, resizable: true },
  sort: { kind: 'text', valueOf: (i) => i.itemType?.label },
  cell: (i) => {
    if (!i.itemType) return null;
    const tv = typeVars(i.itemType.label);
    return (
      <span className={styles.typeChip} style={{ borderColor: tv.dot, color: tv.text, background: tv.soft }}>
        {i.itemType.label}
      </span>
    );
  },
};

export const PTS_COLUMN: ItemColumn = {
  key: 'pts',
  label: 'Pts',
  width: { base: 40, var: 'pts', min: 30, resizable: true },
  kind: 'number',
  align: 'end',
  sort: { kind: 'number', valueOf: (i) => i.points },
  // 0 reads as no estimate here, matching the pre-registry cell.
  value: (i) => (i.points ? String(i.points) : ''),
};

/** Assignee — an avatar, so the column is sized for the glyph, not a name. */
export const ASSIGNEE_COLUMN: ItemColumn = {
  key: 'assignee',
  label: 'Assignee',
  width: { base: 65 },
  align: 'center',
  sort: { kind: 'text', valueOf: (i, ctx) => ctx.memberName(i.assignedMemberId) },
  cell: (i, ctx) => {
    const member = i.assignedMemberId ? ctx.members.find((m) => m.id === i.assignedMemberId) : undefined;
    return member ? <Avatar member={member} /> : null;
  },
};

/** Status — fit to the widest native label, capped so a verbose connector
 *  vocabulary can't dominate the row. */
export const STATUS_COLUMN: ItemColumn = {
  key: 'status',
  label: 'Status',
  width: { base: 200, var: 'status', min: 96 },
  sort: { kind: 'order', order: { 'Not Started': 0, 'In Progress': 1, 'Under Review': 2, Blocked: 3, Complete: 4 }, valueOf: (i) => i.status },
  cell: (i) => <StatusPill status={i.status} sm label={i.statusNative?.label} />,
  fit: (items) => ({
    values: [...new Set(items.map((i) => i.statusNative?.label ?? i.status)), 'Status'],
    fontWeight: 'var(--rt-fw-semibold)',
    chrome: STATUS_CHROME,
    min: 96,
    max: 200,
  }),
};

export const BUILD_COLUMN: ItemColumn = {
  key: 'build',
  label: 'Build',
  width: { base: 120, var: 'build', min: 50, resizable: true },
  kind: 'text',
  sort: { kind: 'text', valueOf: (i) => i.build },
  value: (i) => i.build ?? '—',
};

/** Sprint — only where the table isn't already scoped to one sprint. */
export const SPRINT_COLUMN: ItemColumn = {
  key: 'sprint',
  label: 'Sprint',
  width: { base: 130, var: 'sprint', min: 60, resizable: true },
  kind: 'text',
  applies: (ctx) => ctx.sprintName !== undefined,
  // Null sprint reads as absent rather than as a large position, so backlog items
  // land with the other blanks instead of leading a descending sort.
  sort: { kind: 'number', valueOf: (i, ctx) => (i.sprintId == null ? null : ctx.sprintOrder(i.sprintId)) },
  value: (i, ctx) => ctx.sprintName?.(i) ?? '',
};

/** Work stream — only where the table isn't already grouped by stream. */
export const WORK_STREAM_COLUMN: ItemColumn = {
  key: 'workstream',
  label: 'Work Stream',
  width: { base: 130, var: 'workstream', min: 60, resizable: true },
  applies: (ctx) => ctx.workStream !== undefined,
  sort: { kind: 'text', valueOf: (i, ctx) => ctx.streamName(i.workStreamId) },
  cell: (i, ctx) => {
    const ws = ctx.workStream?.(i);
    return ws ? <StreamChip workStreamId={ws.id} label={ws.name} /> : null;
  },
};

export const TITLE_COLUMN: ItemColumn = {
  key: 'title',
  label: 'Title',
  width: { base: 0, flex: true },
  kind: 'title',
  sort: { kind: 'text', valueOf: (i) => i.subject },
  value: (i) => i.subject,
};

/** The built-ins in table order. Vocabulary columns splice in after Build — see
 *  {@link itemColumns} — which is where they've always rendered. */
const BUILT_IN_ITEM_COLUMNS: readonly ItemColumn[] = [
  KEY_COLUMN, TYPE_COLUMN, PTS_COLUMN, ASSIGNEE_COLUMN, STATUS_COLUMN, BUILD_COLUMN,
];

/**
 * The ordered columns for one item table: built-ins, the release's vocabulary
 * columns, then the two optional position columns and the title. Columns whose
 * `applies` the context rules out are dropped here, so callers render what they
 * get without re-deciding.
 */
export function itemColumns(catalog: ReleaseCatalog | null | undefined, ctx: ItemCellCtx): ItemColumn[] {
  return [
    ...BUILT_IN_ITEM_COLUMNS,
    ...attributeColumns(catalog),
    SPRINT_COLUMN,
    WORK_STREAM_COLUMN,
    TITLE_COLUMN,
  ].filter((c) => c.applies?.(ctx) ?? true);
}

/** The fit-to-content specs for the columns that declare one, ready for
 *  `useFitColumns`. Derived from the same defs the table renders, so a column's
 *  measured width can't drift from the column itself. */
export function fitSpecs(columns: readonly ItemColumn[], items: WorkItem[]) {
  return columns.flatMap((c) => {
    if (!c.fit || !c.width.var) return [];
    return [{ cssVar: `--rt-col-${c.width.var}`, ...c.fit(items) }];
  });
}

/** Default and minimum widths for the resizable columns, keyed by their CSS var
 *  suffix — the single source `useColumnWidths` and `ResizeHandle` read, instead
 *  of a second hand-maintained copy of every column's width. */
export function resizableWidths(): { defaults: Record<string, number>; mins: Record<string, number> } {
  const defaults: Record<string, number> = {};
  const mins: Record<string, number> = {};
  for (const c of [...BUILT_IN_ITEM_COLUMNS, SPRINT_COLUMN, WORK_STREAM_COLUMN, ATTR_WIDTH]) {
    if (!c.width.resizable || !c.width.var) continue;
    defaults[c.width.var] = c.width.base;
    if (c.width.min != null) mins[c.width.var] = c.width.min;
  }
  return { defaults, mins };
}

// ── Catalog-derived columns ────────────────────────────────────────────────

/** Whether a spec projects into a table column: connector vocabulary the catalog
 *  hasn't marked `detailOnly`. Suppression is per *spec*, not per key — a type
 *  that marks a shared key detailOnly renders blank cells in a column another
 *  type still declares, which is the same "not applicable here" the projection
 *  already uses for a key a type doesn't declare at all. Detail rendering and
 *  facets read the catalog directly and are unaffected. */
const isColumnField = (f: FieldSpec): boolean => isAttributeField(f) && f.detailOnly !== true;

/** Every vocabulary column shares one width (and one resize handle), so a release
 *  with six connector fields doesn't need six drags to read comfortably. */
const ATTR_WIDTH: Pick<ItemColumn, 'width'> = { width: { base: 104, var: 'attr', min: 50, resizable: true } };

/** The comparator a field's data kind implies. Dates order chronologically and
 *  enums by their declared catalog order; everything else collates as text. */
function sortKindOf(kind: FieldSpec['kind']): SortKind {
  switch (kind) {
    case 'number': return 'number';
    case 'date': return 'date';
    case 'enum': return 'order';
    default: return 'text';
  }
}

/** Rank map for an enum column: the option's position in the catalog. A
 *  connector lists options in a meaningful order (P0, P1, P2 — or Small, Medium,
 *  Large), which alphabetical sorting of the labels would scramble. */
function enumOrder(specs: Iterable<FieldSpec>): Record<string, number> {
  const order: Record<string, number> = {};
  for (const spec of specs) {
    for (const opt of spec.options ?? []) {
      if (!(opt.value in order)) order[opt.value] = Object.keys(order).length;
    }
  }
  return order;
}

/**
 * Project a release's catalog snapshot into columns: the union of columnar
 * vocabulary fields across its item types, in first-seen catalog order
 * (`detailOnly` specs are detail-and-facet only, never columns). Cell values
 * format through the spec declared by the item's *own* type (enum values resolve
 * to that type's option labels), so two types sharing a key with different option
 * sets each render correctly.
 */
export function attributeColumns(catalog: ReleaseCatalog | null | undefined): ItemColumn[] {
  const byKey = new Map<string, { label: string; byType: Map<string, FieldSpec> }>();
  for (const t of catalog?.itemTypes ?? []) {
    for (const f of t.fields) {
      if (!isColumnField(f)) continue;
      let entry = byKey.get(f.key);
      if (!entry) {
        entry = { label: f.label ?? f.key, byType: new Map() };
        byKey.set(f.key, entry);
      }
      entry.byType.set(t.id, f);
    }
  }
  return [...byKey.entries()].map(([key, entry]) => {
    // Kind comes from the first declaring type: two types sharing a key may offer
    // different option *sets*, but a key that changed data kind between types
    // couldn't render as one column at all.
    const kind = sortKindOf([...entry.byType.values()][0].kind);
    return {
      key: `attr:${key}`,
      label: entry.label,
      ...ATTR_WIDTH,
      kind: 'text' as const,
      value: (item: WorkItem) => {
        const spec = item.itemType?.id != null ? entry.byType.get(item.itemType.id) : undefined;
        if (!spec) return ''; // this item's type doesn't declare the field
        return displayValue(spec, item.attributes?.[key]);
      },
      sort: {
        kind,
        ...(kind === 'order' && { order: enumOrder(entry.byType.values()) }),
        valueOf: (item: WorkItem) => item.attributes?.[key] ?? null,
      },
    };
  });
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
 * to every stream (defensively re-filtered through isColumnField; the
 * conformance suite enforces the same shape service-side).
 */
export function streamAttributeColumns(catalog: ReleaseCatalog | null | undefined): StreamAttrColumn[] {
  return (catalog?.workStreamFields ?? []).filter(isColumnField).map((f) => ({
    key: f.key,
    label: f.label ?? f.key,
    cell: (ws) => displayValue(f, ws.attributes?.[f.key]),
  }));
}

/** Re-exported so callers building a SortCtx don't need a second import. */
export type { SortCtx };
