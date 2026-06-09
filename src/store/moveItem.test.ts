import { beforeEach, describe, expect, it } from 'vitest';
import { getActions, getState, useStore } from './store';
import type { WorkItem } from '../types';

const item = (over: Partial<WorkItem>): WorkItem => ({
  id: 'it_1', releaseId: 'rel_1', workStreamId: 'ws_1', sprintId: 'sp_1',
  key: 'EXT-1', subject: 'S', description: '', status: 'Not Started', points: 5,
  externalId: 'EXT-1', assignedMemberId: null, build: null, dirtyFields: [],
  syncedValues: { points: 5, sprint: 'sp_1' }, itemType: null,
  ...over,
});

const setItems = (...items: WorkItem[]) => useStore.setState({ items });
const got = (id = 'it_1') => getState().items.find((i) => i.id === id)!;

describe('moveItemToSprint', () => {
  beforeEach(() => setItems());

  it('is a no-op when the sprint is unchanged', () => {
    setItems(item({ sprintId: 'sp_1', dirtyFields: [] }));
    getActions().moveItemToSprint('it_1', 'sp_1');
    expect(got().sprintId).toBe('sp_1');
    expect(got().dirtyFields).toEqual([]);
  });

  it('moves a local item without marking it dirty', () => {
    setItems(item({ externalId: null, syncedValues: null, dirtyFields: [] }));
    getActions().moveItemToSprint('it_1', 'sp_2');
    expect(got().sprintId).toBe('sp_2');
    expect(got().dirtyFields).toEqual([]);
  });

  it('marks a synced item sprint-dirty when moved away from the baseline', () => {
    setItems(item({ sprintId: 'sp_1', syncedValues: { points: 5, sprint: 'sp_1' } }));
    getActions().moveItemToSprint('it_1', 'sp_2');
    expect(got().sprintId).toBe('sp_2');
    expect(got().dirtyFields).toContain('sprint');
  });

  it('clears the sprint dirty flag when moved back to the synced sprint', () => {
    setItems(item({ sprintId: 'sp_2', dirtyFields: ['sprint'], syncedValues: { points: 5, sprint: 'sp_1' } }));
    getActions().moveItemToSprint('it_1', 'sp_1');
    expect(got().sprintId).toBe('sp_1');
    expect(got().dirtyFields).not.toContain('sprint');
  });

  it('treats backlog (null) as a sprint value relative to the baseline', () => {
    setItems(item({ sprintId: 'sp_1', syncedValues: { points: 5, sprint: null } }));
    getActions().moveItemToSprint('it_1', null);
    expect(got().sprintId).toBeNull();
    expect(got().dirtyFields).not.toContain('sprint');
  });

  it('preserves an existing points dirty flag when toggling sprint', () => {
    setItems(item({ sprintId: 'sp_1', dirtyFields: ['points'], syncedValues: { points: 8, sprint: 'sp_1' } }));
    getActions().moveItemToSprint('it_1', 'sp_2');
    expect(got().dirtyFields).toEqual(['points', 'sprint']);
    getActions().moveItemToSprint('it_1', 'sp_1');
    expect(got().dirtyFields).toEqual(['points']);
  });

  it('does not mark a synced item dirty when it has no baseline', () => {
    setItems(item({ sprintId: 'sp_1', syncedValues: null }));
    getActions().moveItemToSprint('it_1', 'sp_2');
    expect(got().sprintId).toBe('sp_2');
    expect(got().dirtyFields).toEqual([]);
  });
});
