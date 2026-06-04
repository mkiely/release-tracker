import { describe, expect, it } from 'vitest';
import { buildPushChanges } from './push';
import type { Sprint, WorkItem } from '../types';

const sprint = (id: string, externalId: string | null): Sprint => ({
  id,
  name: 'S',
  startISO: '2026-04-13',
  endISO: '2026-04-26',
  daysOff: 0,
  externalId,
});

const item = (over: Partial<WorkItem>): WorkItem => ({
  id: 'it_1',
  releaseId: 'rel_1',
  workStreamId: 'ws_1',
  sprintId: 'sp_1',
  key: 'EXT-1',
  subject: 'Test item',
  description: '',
  status: 'Active',
  points: 5,
  externalId: 'EXT-1',
  assignedMemberId: null,
  build: null,
  dirtyFields: [],
  ...over,
});

describe('buildPushChanges', () => {
  const sprints = [
    sprint('sp_1', 'JSPR-1'),
    sprint('sp_2', 'JSPR-2'),
  ];

  it('returns empty when no items are dirty', () => {
    const items = [item({ dirtyFields: [] })];
    expect(buildPushChanges(items, sprints, ['points', 'sprint'])).toHaveLength(0);
  });

  it('returns empty for local items (externalId === null)', () => {
    const items = [item({ externalId: null, dirtyFields: ['points'] })];
    expect(buildPushChanges(items, sprints, ['points', 'sprint'])).toHaveLength(0);
  });

  it('emits a change with points when dirty and writeable', () => {
    const items = [item({ points: 13, dirtyFields: ['points'] })];
    const changes = buildPushChanges(items, sprints, ['points', 'sprint']);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ externalId: 'EXT-1', fields: { points: 13 } });
    expect(changes[0].fields.extSprintId).toBeUndefined();
  });

  it('emits a change with extSprintId when sprint is dirty and writeable', () => {
    const items = [item({ sprintId: 'sp_2', dirtyFields: ['sprint'] })];
    const changes = buildPushChanges(items, sprints, ['points', 'sprint']);
    expect(changes).toHaveLength(1);
    expect(changes[0].fields.extSprintId).toBe('JSPR-2');
    expect(changes[0].fields.points).toBeUndefined();
  });

  it('maps backlog (sprintId null) to extSprintId null', () => {
    const items = [item({ sprintId: null, dirtyFields: ['sprint'] })];
    const changes = buildPushChanges(items, sprints, ['points', 'sprint']);
    expect(changes[0].fields.extSprintId).toBeNull();
  });

  it('maps sprintId with no externalId (local sprint) to extSprintId null', () => {
    const localSprints = [sprint('sp_local', null)];
    const items = [item({ sprintId: 'sp_local', dirtyFields: ['sprint'] })];
    const changes = buildPushChanges(items, localSprints, ['points', 'sprint']);
    expect(changes[0].fields.extSprintId).toBeNull();
  });

  it('emits both points and sprint when both are dirty', () => {
    const items = [item({ points: 8, sprintId: 'sp_1', dirtyFields: ['points', 'sprint'] })];
    const changes = buildPushChanges(items, sprints, ['points', 'sprint']);
    expect(changes[0].fields.points).toBe(8);
    expect(changes[0].fields.extSprintId).toBe('JSPR-1');
  });

  it('skips a dirty field that is not in the writeable set', () => {
    const items = [item({ points: 13, dirtyFields: ['points'] })];
    // writeable only includes 'sprint', not 'points'
    const changes = buildPushChanges(items, sprints, ['sprint']);
    expect(changes).toHaveLength(0);
  });

  it('only emits one change per item even if multiple fields are dirty', () => {
    const items = [item({ points: 8, sprintId: 'sp_2', dirtyFields: ['points', 'sprint'] })];
    const changes = buildPushChanges(items, sprints, ['points', 'sprint']);
    expect(changes).toHaveLength(1);
  });

  it('handles multiple items, including a mix of dirty and clean', () => {
    const items = [
      item({ id: 'it_1', externalId: 'EXT-1', points: 8, dirtyFields: ['points'] }),
      item({ id: 'it_2', externalId: 'EXT-2', dirtyFields: [] }),
      item({ id: 'it_3', externalId: 'EXT-3', sprintId: 'sp_2', dirtyFields: ['sprint'] }),
    ];
    const changes = buildPushChanges(items, sprints, ['points', 'sprint']);
    expect(changes).toHaveLength(2);
    expect(changes.map((c) => c.externalId)).toEqual(['EXT-1', 'EXT-3']);
  });
});
