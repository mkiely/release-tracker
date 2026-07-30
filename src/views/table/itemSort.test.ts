import { describe, it, expect } from 'vitest';
import type { WorkItem } from '../../types';
import { anItem } from '../../test/factories';
import { sortItems, nextSort, type SortCtx } from './itemSort';
import type { AttrColumn } from '../../components/fields/columns';

// The comparator only reads a few fields, but the item is complete — the old
// `as unknown as WorkItem` partial would have hidden a comparator that started
// reading a field the fixture never set.
const item = (p: Partial<WorkItem>): WorkItem => anItem({ key: 'X-0', ...p });

const ctx: SortCtx = {
  memberName: (id) => (id ? `name-${id}` : ''),
  sprintOrder: (id) => (id === 's1' ? 0 : id === 's2' ? 1 : Number.MAX_SAFE_INTEGER),
  streamName: (id) => (id ? `ws-${id}` : ''),
};

/** A vocabulary column carrying its own sort spec, as attributeColumns builds it. */
const attrCol = (key: string, sort: AttrColumn['sort']): AttrColumn => ({
  key,
  label: key,
  cell: (i) => String(i.attributes?.[key] ?? ''),
  sort,
});

const keys = (items: WorkItem[]) => items.map((i) => i.key);

describe('sortItems', () => {
  it('returns the input untouched when sort is null', () => {
    const items = [item({ key: 'B' }), item({ key: 'A' })];
    expect(sortItems(items, null, ctx)).toBe(items);
  });

  it('sorts points numerically, not lexically', () => {
    const items = [item({ key: 'A', points: 9 }), item({ key: 'B', points: 10 })];
    expect(keys(sortItems(items, { col: 'pts', dir: 'asc' }, ctx))).toEqual(['A', 'B']);
    expect(keys(sortItems(items, { col: 'pts', dir: 'desc' }, ctx))).toEqual(['B', 'A']);
  });

  it('keeps items with no value last in BOTH directions', () => {
    const items = [
      item({ key: 'A', points: 9 }),
      item({ key: 'B', points: 10 }),
      item({ key: 'C', points: null }),
    ];
    // Reversing re-orders the estimated items; the unestimated one doesn't lead.
    expect(keys(sortItems(items, { col: 'pts', dir: 'asc' }, ctx))).toEqual(['A', 'B', 'C']);
    expect(keys(sortItems(items, { col: 'pts', dir: 'desc' }, ctx))).toEqual(['B', 'A', 'C']);
  });

  it('applies blanks-last to text columns too', () => {
    const items = [
      item({ key: 'A', build: 'Orion 1.5' }),
      item({ key: 'B', build: null }),
      item({ key: 'C', build: 'Orion 1.4' }),
    ];
    expect(keys(sortItems(items, { col: 'build', dir: 'asc' }, ctx))).toEqual(['C', 'A', 'B']);
    expect(keys(sortItems(items, { col: 'build', dir: 'desc' }, ctx))).toEqual(['A', 'C', 'B']);
  });

  it('returns the input untouched for an unknown column', () => {
    const items = [item({ key: 'B' }), item({ key: 'A' })];
    expect(sortItems(items, { col: 'nope', dir: 'asc' }, ctx)).toBe(items);
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

describe('sortItems — vocabulary columns', () => {
  const withAttr = (key: string, value: unknown, attributes: Record<string, unknown> = { severity: value }) =>
    item({ key, attributes: attributes as WorkItem['attributes'] });

  // The bug this replaced: sorting read the *rendered* cell, so a date column
  // formatted for humans ordered May, June, March.
  it('sorts a date column chronologically, not by its rendered text', () => {
    const col = attrCol('due', { kind: 'date', valueOf: (i) => i.attributes?.due ?? null });
    const items = [
      withAttr('A', null, { due: '2026-05-02' }),
      withAttr('B', null, { due: '2026-03-14' }),
      withAttr('C', null, { due: '2026-06-30' }),
    ];
    const ctxA: SortCtx = { ...ctx, attrColumns: [col] };
    expect(keys(sortItems(items, { col: 'attr:due', dir: 'asc' }, ctxA))).toEqual(['B', 'A', 'C']);
    expect(keys(sortItems(items, { col: 'attr:due', dir: 'desc' }, ctxA))).toEqual(['C', 'A', 'B']);
  });

  it('orders full instants within the same day', () => {
    const col = attrCol('seen', { kind: 'date', valueOf: (i) => i.attributes?.seen ?? null });
    const items = [
      withAttr('A', null, { seen: '2026-07-30T18:00:00Z' }),
      withAttr('B', null, { seen: '2026-07-30T09:15:00Z' }),
    ];
    expect(keys(sortItems(items, { col: 'attr:seen', dir: 'asc' }, { ...ctx, attrColumns: [col] }))).toEqual(['B', 'A']);
  });

  it('sorts an enum column by catalog option order, not label text', () => {
    // Alphabetically 'Critical' < 'Low' < 'Medium'; the catalog's order is severity.
    const col = attrCol('severity', {
      kind: 'order',
      order: { critical: 0, medium: 1, low: 2 },
      valueOf: (i) => i.attributes?.severity ?? null,
    });
    const items = [withAttr('A', 'low'), withAttr('B', 'critical'), withAttr('C', 'medium')];
    expect(keys(sortItems(items, { col: 'attr:severity', dir: 'asc' }, { ...ctx, attrColumns: [col] }))).toEqual(['B', 'C', 'A']);
  });

  it('sorts a numeric vocabulary column numerically', () => {
    const col = attrCol('rank', { kind: 'number', valueOf: (i) => i.attributes?.rank ?? null });
    const items = [withAttr('A', null, { rank: 9 }), withAttr('B', null, { rank: 10 })];
    expect(keys(sortItems(items, { col: 'attr:rank', dir: 'asc' }, { ...ctx, attrColumns: [col] }))).toEqual(['A', 'B']);
  });

  it('keeps items whose type does not declare the field last', () => {
    const col = attrCol('severity', { kind: 'text', valueOf: (i) => i.attributes?.severity ?? null });
    const items = [withAttr('A', 'low'), item({ key: 'B' }), withAttr('C', 'high')];
    const ctxA: SortCtx = { ...ctx, attrColumns: [col] };
    expect(keys(sortItems(items, { col: 'attr:severity', dir: 'asc' }, ctxA))).toEqual(['C', 'A', 'B']);
    expect(keys(sortItems(items, { col: 'attr:severity', dir: 'desc' }, ctxA))).toEqual(['A', 'C', 'B']);
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
