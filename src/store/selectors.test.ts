import { describe, expect, it } from 'vitest';
import { selBacklogItems, selDirtyCount, selItem, selItemsFor, selItemsForStream, selRelease, selTeam, selUnassignedItems } from './store';
import { SCHEMA_VERSION } from '../types';
import type { AppState, Release, Team, WorkItem } from '../types';

const team = (id: string): Team => ({
  id, name: `Team ${id}`, velocity: 20, externalId: null,
  members: [{ id: `m_${id}`, name: 'Alice', externalId: null, nonContributing: false }],
});

const release = (id: string): Release => ({
  id, name: `Release ${id}`, startISO: '2026-04-13', teamId: 't1',
  workStreams: [{ id: 'ws1', name: 'API', externalId: null, engineersRequired: null, build: null, externalUrl: null, planningMuted: false }],
  events: [], sprints: [], externalId: null, connector: null, sync: null, sprintLengthDays: 14,
});

const item = (id: string, releaseId: string, wsId = 'ws1', dirty: string[] = []): WorkItem => ({
  id, releaseId, workStreamId: wsId, sprintId: null,
  key: `K-${id}`, subject: 'S', description: '', status: 'Not Started',
  points: 1, externalId: null, assignedMemberId: null, build: null, externalUrl: null, dirtyFields: dirty, itemType: null,
});

const state = (...overrides: Partial<AppState>[]): AppState =>
  Object.assign(
    { version: SCHEMA_VERSION, teams: [team('t1'), team('t2')], releases: [release('r1'), release('r2')], items: [], meta: { lastSyncISO: null } },
    ...overrides,
  );

describe('selTeam', () => {
  it('returns the matching team', () => {
    expect(selTeam(state(), 't1')?.id).toBe('t1');
    expect(selTeam(state(), 't2')?.id).toBe('t2');
  });

  it('returns undefined for an unknown id', () => {
    expect(selTeam(state(), 'nope')).toBeUndefined();
  });

  it('returns undefined for undefined id', () => {
    expect(selTeam(state(), undefined)).toBeUndefined();
  });
});

describe('selRelease', () => {
  it('returns the matching release', () => {
    expect(selRelease(state(), 'r1')?.id).toBe('r1');
  });

  it('returns undefined for an unknown id', () => {
    expect(selRelease(state(), 'nope')).toBeUndefined();
  });

  it('returns undefined for undefined id', () => {
    expect(selRelease(state(), undefined)).toBeUndefined();
  });
});

describe('selItemsFor', () => {
  it('returns only items belonging to the given release', () => {
    const items = [item('i1', 'r1'), item('i2', 'r1'), item('i3', 'r2')];
    const result = selItemsFor(state({ items }), 'r1');
    expect(result).toHaveLength(2);
    expect(result.every((i) => i.releaseId === 'r1')).toBe(true);
  });

  it('returns empty for a release with no items', () => {
    expect(selItemsFor(state({ items: [] }), 'r1')).toHaveLength(0);
  });
});

describe('selItemsForStream', () => {
  it('returns items filtered by both release and work stream', () => {
    const items = [item('i1', 'r1', 'ws1'), item('i2', 'r1', 'ws2'), item('i3', 'r2', 'ws1')];
    const result = selItemsForStream(state({ items }), 'r1', 'ws1');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('i1');
  });

  it('returns empty when no items match both filters', () => {
    const items = [item('i1', 'r1', 'ws1')];
    expect(selItemsForStream(state({ items }), 'r1', 'ws_none')).toHaveLength(0);
    expect(selItemsForStream(state({ items }), 'r_none', 'ws1')).toHaveLength(0);
  });
});

describe('selUnassignedItems', () => {
  // Unassigned = native to this release's build (build === null) AND no work stream.
  it('returns only native items without a work stream', () => {
    const items = [
      { ...item('i1', 'r1'), workStreamId: null },                       // native, no stream — unassigned
      item('i2', 'r1', 'ws1'),                                          // native, in a stream — not unassigned
      { ...item('i3', 'r1'), workStreamId: null, build: '263' },        // carried-in, no stream — not unassigned
      { ...item('i4', 'r2'), workStreamId: null },                      // other release
    ];
    const result = selUnassignedItems(state({ items }), 'r1');
    expect(result.map((i) => i.id)).toEqual(['i1']);
  });

  it('returns empty when every native item has a stream', () => {
    const items = [item('i1', 'r1', 'ws1'), { ...item('i2', 'r1'), workStreamId: null, build: '263.1' }];
    expect(selUnassignedItems(state({ items }), 'r1')).toHaveLength(0);
  });
});

describe('selBacklogItems', () => {
  // Backlog = every incomplete item in the release, regardless of build/stream.
  it('returns incomplete items across streams, no-stream, and carried-in builds', () => {
    const items = [
      item('i1', 'r1', 'ws1'),                                          // in a stream
      { ...item('i2', 'r1'), workStreamId: null },                      // no stream
      { ...item('i3', 'r1'), workStreamId: null, build: '263' },        // carried-in, no stream
      { ...item('i4', 'r1'), status: 'Complete' as const },             // complete — excluded
      item('i5', 'r2'),                                                 // other release
    ];
    const result = selBacklogItems(state({ items }), 'r1');
    expect(result.map((i) => i.id)).toEqual(['i1', 'i2', 'i3']);
  });

  it('returns empty when all items are complete', () => {
    const items = [{ ...item('i1', 'r1'), status: 'Complete' as const }];
    expect(selBacklogItems(state({ items }), 'r1')).toHaveLength(0);
  });
});

describe('selItem', () => {
  it('returns the item with the given id', () => {
    const items = [item('i1', 'r1'), item('i2', 'r1')];
    expect(selItem(state({ items }), 'i2')?.id).toBe('i2');
  });

  it('returns undefined for an unknown id', () => {
    expect(selItem(state({ items: [] }), 'nope')).toBeUndefined();
  });
});

describe('selDirtyCount', () => {
  // selDirtyCount only counts synced items (externalId !== null) with dirty fields —
  // these are the only ones eligible for push-back to the external system.
  const syncedDirty = (id: string, releaseId: string, dirty: string[]): WorkItem => ({
    ...item(id, releaseId, 'ws1', dirty), externalId: `EXT-${id}`,
  });

  it('counts synced items with at least one dirty field for the given release', () => {
    const items = [
      syncedDirty('i1', 'r1', ['points']),
      syncedDirty('i2', 'r1', ['sprint', 'points']),
      item('i3', 'r1', 'ws1', []),          // clean — not counted
      syncedDirty('i4', 'r2', ['points']),   // different release — not counted
      item('i5', 'r1', 'ws1', ['points']),   // local (no externalId) — not counted
    ];
    expect(selDirtyCount(state({ items }), 'r1')).toBe(2);
  });

  it('returns 0 when no items are dirty', () => {
    const items = [item('i1', 'r1'), item('i2', 'r1')];
    expect(selDirtyCount(state({ items }), 'r1')).toBe(0);
  });

  it('returns 0 for a release with no items', () => {
    expect(selDirtyCount(state({ items: [] }), 'r1')).toBe(0);
  });
});
