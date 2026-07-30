import { describe, it, expect } from 'vitest';
import type { WorkItem } from '../../types';
import { anItem } from '../../test/factories';
import { sortItems, nextSort, type SortCtx } from './itemSort';
import { attributeColumns, itemColumns, type ItemColumn } from '../../components/fields/columns';
import type { ReleaseCatalog } from '../../types';

// The comparator only reads a few fields, but the item is complete — the old
// `as unknown as WorkItem` partial would have hidden a comparator that started
// reading a field the fixture never set.
const item = (p: Partial<WorkItem>): WorkItem => anItem({ key: 'X-0', ...p });

// The real column definitions — the specs under test are the ones the table renders.
const columnsFor = (catalog: ReleaseCatalog | null = null): ItemColumn[] =>
  itemColumns(catalog, { members: [], sprintName: () => '', workStream: () => ({ id: null, name: '' }) });

const ctxWith = (columns: readonly ItemColumn[]): SortCtx => ({
  memberName: (id) => (id ? `name-${id}` : ''),
  sprintOrder: (id) => (id === 's1' ? 0 : id === 's2' ? 1 : Number.MAX_SAFE_INTEGER),
  streamName: (id) => (id ? `ws-${id}` : ''),
  columns,
});

const ctx: SortCtx = ctxWith(columnsFor());

/** A catalog declaring one vocabulary field, projected into a real column. */
const vocabCtx = (key: string, spec: Partial<FieldSpecLike>): SortCtx => {
  const catalog: ReleaseCatalog = {
    statuses: [],
    workStreamFields: [],
    itemTypes: [{ id: 'bug', label: 'Bug', fields: [{ key, label: key, kind: 'string', ...spec } as never] }],
  };
  return ctxWith([...columnsFor(), ...attributeColumns(catalog)]);
};
type FieldSpecLike = { kind: string; options?: { value: string; label: string }[] };

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
  const withAttr = (key: string, attributes: Record<string, unknown>) =>
    item({ key, attributes: attributes as WorkItem['attributes'] });

  // The bug this replaced: sorting read the *rendered* cell, so a date column
  // formatted for humans ordered May, June, March.
  it('sorts a date column chronologically, not by its rendered text', () => {
    const ctxA = vocabCtx('due', { kind: 'date' });
    const items = [
      withAttr('A', { due: '2026-05-02' }),
      withAttr('B', { due: '2026-03-14' }),
      withAttr('C', { due: '2026-06-30' }),
    ];
    expect(keys(sortItems(items, { col: 'attr:due', dir: 'asc' }, ctxA))).toEqual(['B', 'A', 'C']);
    expect(keys(sortItems(items, { col: 'attr:due', dir: 'desc' }, ctxA))).toEqual(['C', 'A', 'B']);
  });

  it('orders full instants within the same day', () => {
    const ctxA = vocabCtx('seen', { kind: 'date' });
    const items = [
      withAttr('A', { seen: '2026-07-30T18:00:00Z' }),
      withAttr('B', { seen: '2026-07-30T09:15:00Z' }),
    ];
    expect(keys(sortItems(items, { col: 'attr:seen', dir: 'asc' }, ctxA))).toEqual(['B', 'A']);
  });

  it('sorts an enum column by catalog option order, not label text', () => {
    // Alphabetically 'Critical' < 'Low' < 'Medium'; the catalog's order is severity.
    const ctxA = vocabCtx('severity', {
      kind: 'enum',
      options: [
        { value: 'critical', label: 'Critical' },
        { value: 'medium', label: 'Medium' },
        { value: 'low', label: 'Low' },
      ],
    });
    const items = [withAttr('A', { severity: 'low' }), withAttr('B', { severity: 'critical' }), withAttr('C', { severity: 'medium' })];
    expect(keys(sortItems(items, { col: 'attr:severity', dir: 'asc' }, ctxA))).toEqual(['B', 'C', 'A']);
  });

  it('sorts a numeric vocabulary column numerically', () => {
    const ctxA = vocabCtx('rank', { kind: 'number' });
    const items = [withAttr('A', { rank: 9 }), withAttr('B', { rank: 10 })];
    expect(keys(sortItems(items, { col: 'attr:rank', dir: 'asc' }, ctxA))).toEqual(['A', 'B']);
  });

  it('keeps items with no value for the field last', () => {
    const ctxA = vocabCtx('severity', { kind: 'string' });
    const items = [withAttr('A', { severity: 'low' }), item({ key: 'B' }), withAttr('C', { severity: 'high' })];
    expect(keys(sortItems(items, { col: 'attr:severity', dir: 'asc' }, ctxA))).toEqual(['C', 'A', 'B']);
    expect(keys(sortItems(items, { col: 'attr:severity', dir: 'desc' }, ctxA))).toEqual(['A', 'C', 'B']);
  });

  it('will not sort by a column the table is not rendering', () => {
    const items = [withAttr('A', { severity: 'low' }), withAttr('B', { severity: 'high' })];
    expect(sortItems(items, { col: 'attr:severity', dir: 'asc' }, ctx)).toBe(items);
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
