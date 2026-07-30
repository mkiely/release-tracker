// Column sorting for the item tables (backlog / unassigned, sprint, work stream).
// Pure so it can be unit-tested; the view owns the ephemeral sort state and the
// display context.
//
// Every column sorts through a {@link SortSpec}: a comparator `kind` plus a
// `valueOf` that reads the item's *data*. Vocabulary columns used to sort by the
// string their cell rendered, which made a formatted date column sort May, June,
// March — a display concern deciding order. Specs read values instead, so how a
// cell is formatted and how a column sorts are independent.
//
// The canonical specs below are the seed of the column descriptor array in
// docs/item-columns.md; Phase 2 moves them onto the ColumnDef itself.

import type { WorkItem } from '../../types';
import type { AttrColumn } from '../../components/fields/columns';

export type SortDir = 'asc' | 'desc';
export interface ItemSort {
  /** Column id: a built-in ('key','type','pts','assignee','status','build',
   *  'sprint','workstream','title') or a vocabulary column ('attr:<fieldKey>'). */
  col: string;
  dir: SortDir;
}

/** How a column's values compare.
 *  - `text`   — natural-language collation (numeric-aware, case-insensitive)
 *  - `number` — numeric
 *  - `date`   — chronological, over any ISO-8601 shape (bare date or instant)
 *  - `order`  — a declared ranking (status reading order, enum catalog order) */
export type SortKind = 'text' | 'number' | 'date' | 'order';

export interface SortSpec {
  kind: SortKind;
  /** For `order`: value → rank. Values absent from the map sort after ranked ones. */
  order?: Readonly<Record<string, number>>;
  /** The item's underlying value for this column. Null/undefined/'' means absent. */
  valueOf: (item: WorkItem, ctx: SortCtx) => unknown;
}

/** Display-derived lookups a spec can't get from the item alone. */
export interface SortCtx {
  memberName: (id: string | null) => string;
  /** Sprint's position in release order; unassigned sorts last. */
  sprintOrder: (id: string | null) => number;
  streamName: (id: string | null) => string;
  /** The release's vocabulary columns, which carry their own specs. */
  attrColumns?: readonly AttrColumn[];
}

// Chip/status reading order — a meaningful sort, not alphabetical.
const STATUS_ORDER: Readonly<Record<string, number>> = {
  'Not Started': 0,
  'In Progress': 1,
  'Under Review': 2,
  'Blocked': 3,
  'Complete': 4,
};

/** The built-in columns' sort specs, keyed by column id. */
export const CANONICAL_SORTS: Readonly<Record<string, SortSpec>> = {
  key: { kind: 'text', valueOf: (i) => i.key },
  type: { kind: 'text', valueOf: (i) => i.itemType?.label },
  pts: { kind: 'number', valueOf: (i) => i.points },
  assignee: { kind: 'text', valueOf: (i, ctx) => ctx.memberName(i.assignedMemberId) },
  status: { kind: 'order', order: STATUS_ORDER, valueOf: (i) => i.status },
  build: { kind: 'text', valueOf: (i) => i.build },
  // Null sprint reads as absent rather than as a large position, so backlog items
  // land with the other blanks instead of leading a descending sort.
  sprint: { kind: 'number', valueOf: (i, ctx) => (i.sprintId == null ? null : ctx.sprintOrder(i.sprintId)) },
  workstream: { kind: 'text', valueOf: (i, ctx) => ctx.streamName(i.workStreamId) },
  title: { kind: 'text', valueOf: (i) => i.subject },
};

/** The spec for a column id: a built-in, or the vocabulary column's own. */
function specFor(col: string, ctx: SortCtx): SortSpec | undefined {
  const canonical = CANONICAL_SORTS[col];
  if (canonical) return canonical;
  return ctx.attrColumns?.find((c) => `attr:${c.key}` === col)?.sort;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

const isAbsent = (v: unknown): boolean => v == null || v === '';

/** Compare two present values under a spec. Absent values never reach here. */
function compare(spec: SortSpec, a: unknown, b: unknown): number {
  switch (spec.kind) {
    case 'number': {
      const an = Number(a);
      const bn = Number(b);
      if (Number.isNaN(an) || Number.isNaN(bn)) return collator.compare(String(a), String(b));
      return an === bn ? 0 : an < bn ? -1 : 1;
    }
    case 'date': {
      const at = Date.parse(String(a));
      const bt = Date.parse(String(b));
      // An unparseable date can't be ordered against a real one; fall back to text
      // rather than letting NaN silently compare equal to everything.
      if (Number.isNaN(at) || Number.isNaN(bt)) return collator.compare(String(a), String(b));
      return at === bt ? 0 : at < bt ? -1 : 1;
    }
    case 'order': {
      const ar = spec.order?.[String(a)] ?? Number.MAX_SAFE_INTEGER;
      const br = spec.order?.[String(b)] ?? Number.MAX_SAFE_INTEGER;
      return ar === br ? 0 : ar < br ? -1 : 1;
    }
    default:
      return collator.compare(String(a), String(b));
  }
}

/** Returns a new, stably-sorted array; the input is left untouched. `sort` null =
 *  identity (original order preserved). Ties break on the item key.
 *
 *  Items with no value for the sorted column sort **last in both directions** —
 *  reversing the direction re-orders the items that have values, rather than
 *  dredging a block of blanks to the top. */
export function sortItems(items: WorkItem[], sort: ItemSort | null, ctx: SortCtx): WorkItem[] {
  if (!sort) return items;
  const spec = specFor(sort.col, ctx);
  if (!spec) return items;
  const sign = sort.dir === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => {
    const av = spec.valueOf(a, ctx);
    const bv = spec.valueOf(b, ctx);
    const aEmpty = isAbsent(av);
    const bEmpty = isAbsent(bv);
    if (aEmpty || bEmpty) {
      if (aEmpty && bEmpty) return collator.compare(a.key, b.key);
      return aEmpty ? 1 : -1; // unsigned: blanks stay last whichever way we sort
    }
    const cmp = compare(spec, av, bv);
    if (cmp === 0) return collator.compare(a.key, b.key); // stable, dir-independent tiebreak
    return cmp * sign;
  });
}

/** Header-click cycle: unsorted → asc → desc → unsorted. Switching column starts asc. */
export function nextSort(cur: ItemSort | null, col: string): ItemSort | null {
  if (!cur || cur.col !== col) return { col, dir: 'asc' };
  if (cur.dir === 'asc') return { col, dir: 'desc' };
  return null;
}
