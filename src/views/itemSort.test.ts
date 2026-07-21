import { describe, it, expect } from 'vitest';
import type { WorkItem } from '../types';
import { sortItems, nextSort, type SortCtx } from './itemSort';

// Minimal partials — the comparator only reads the fields set here.
function item(p: Partial<WorkItem>): WorkItem {
  return { key: 'X-0', status: 'Not Started', ...p } as unknown as WorkItem;
}

const ctx: SortCtx = {
  memberName: (id) => (id ? `name-${id}` : ''),
  sprintOrder: (id) => (id === 's1' ? 0 : id === 's2' ? 1 : Number.MAX_SAFE_INTEGER),
  streamName: (id) => (id ? `ws-${id}` : ''),
  attrCell: (it, key) => String(it.attributes?.[key] ?? ''),
};

const keys = (items: WorkItem[]) => items.map((i) => i.key);

describe('sortItems', () => {
  it('returns the input untouched when sort is null', () => {
    const items = [item({ key: 'B' }), item({ key: 'A' })];
    expect(sortItems(items, null, ctx)).toBe(items);
  });

  it('sorts points numerically, not lexically; null points sort lowest asc', () => {
    const items = [
      item({ key: 'A', points: 9 }),
      item({ key: 'B', points: 10 }),
      item({ key: 'C', points: null as unknown as number }),
    ];
    expect(keys(sortItems(items, { col: 'pts', dir: 'asc' }, ctx))).toEqual(['C', 'A', 'B']);
    expect(keys(sortItems(items, { col: 'pts', dir: 'desc' }, ctx))).toEqual(['B', 'A', 'C']);
  });

  it('sorts status in reading order, not alphabetically', () => {
    const items = [
      item({ key: 'A', status: 'Complete' }),
      item({ key: 'B', status: 'Not Started' }),
      item({ key: 'C', status: 'Blocked' }),
    ];
    expect(keys(sortItems(items, { col: 'status', dir: 'asc' }, ctx))).toEqual(['B', 'C', 'A']);
  });

  it('breaks ties on key, stably and independent of direction', () => {
    const items = [
      item({ key: 'X-2', points: 5 }),
      item({ key: 'X-10', points: 5 }),
      item({ key: 'X-1', points: 5 }),
    ];
    // numeric-aware key collation, same order regardless of dir
    expect(keys(sortItems(items, { col: 'pts', dir: 'asc' }, ctx))).toEqual(['X-1', 'X-2', 'X-10']);
    expect(keys(sortItems(items, { col: 'pts', dir: 'desc' }, ctx))).toEqual(['X-1', 'X-2', 'X-10']);
  });

  it('resolves display columns through the context', () => {
    const items = [
      item({ key: 'A', sprintId: 's2' }),
      item({ key: 'B', sprintId: null }),
      item({ key: 'C', sprintId: 's1' }),
    ];
    // sprint order: s1(0), s2(1), null(last)
    expect(keys(sortItems(items, { col: 'sprint', dir: 'asc' }, ctx))).toEqual(['C', 'A', 'B']);
  });
});

describe('nextSort', () => {
  it('cycles unsorted → asc → desc → unsorted for the same column', () => {
    expect(nextSort(null, 'pts')).toEqual({ col: 'pts', dir: 'asc' });
    expect(nextSort({ col: 'pts', dir: 'asc' }, 'pts')).toEqual({ col: 'pts', dir: 'desc' });
    expect(nextSort({ col: 'pts', dir: 'desc' }, 'pts')).toBeNull();
  });

  it('switching to a different column starts at asc', () => {
    expect(nextSort({ col: 'pts', dir: 'desc' }, 'title')).toEqual({ col: 'title', dir: 'asc' });
  });
});
