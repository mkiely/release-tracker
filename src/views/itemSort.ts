// Column sorting for the item-list tables (backlog / unassigned). Pure so it can
// be unit-tested; the view owns the ephemeral sort state and the display context.

import type { WorkItem } from '../types';

export type SortDir = 'asc' | 'desc';
export interface ItemSort {
  /** Column id: a built-in ('key','type','pts','assignee','status','build',
   *  'sprint','workstream','title') or a vocabulary column ('attr:<fieldKey>'). */
  col: string;
  dir: SortDir;
}

/** Display-derived lookups the comparator can't get from the item alone. */
export interface SortCtx {
  memberName: (id: string | null) => string;
  /** Sprint's position in release order; unassigned sorts last. */
  sprintOrder: (id: string | null) => number;
  streamName: (id: string | null) => string;
  /** Formatted cell text for a vocabulary column, matching what the table shows. */
  attrCell: (item: WorkItem, key: string) => string;
}

// Chip/status reading order — a meaningful sort, not alphabetical.
const STATUS_ORDER: Record<string, number> = {
  'Not Started': 0,
  'In Progress': 1,
  'Under Review': 2,
  'Blocked': 3,
  'Complete': 4,
};

function sortValue(item: WorkItem, col: string, ctx: SortCtx): string | number {
  switch (col) {
    case 'key': return item.key ?? '';
    case 'type': return item.itemType?.label ?? '';
    case 'pts': return item.points ?? Number.NEGATIVE_INFINITY;
    case 'assignee': return ctx.memberName(item.assignedMemberId);
    case 'status': return STATUS_ORDER[item.status] ?? -1;
    case 'build': return item.build ?? '';
    case 'sprint': return ctx.sprintOrder(item.sprintId);
    case 'workstream': return ctx.streamName(item.workStreamId);
    case 'title': return item.subject ?? '';
    default:
      if (col.startsWith('attr:')) return ctx.attrCell(item, col.slice(5));
      return '';
  }
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Returns a new, stably-sorted array; the input is left untouched. `sort` null =
 *  identity (original order preserved). Ties break on the item key. */
export function sortItems(items: WorkItem[], sort: ItemSort | null, ctx: SortCtx): WorkItem[] {
  if (!sort) return items;
  const sign = sort.dir === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => {
    const av = sortValue(a, sort.col, ctx);
    const bv = sortValue(b, sort.col, ctx);
    let cmp: number;
    if (typeof av === 'number' && typeof bv === 'number') {
      cmp = av === bv ? 0 : av < bv ? -1 : 1;
    } else {
      cmp = collator.compare(String(av), String(bv));
    }
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
