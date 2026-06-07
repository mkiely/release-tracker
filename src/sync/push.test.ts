import { describe, expect, it } from 'vitest';
import { buildPushChanges, buildPushPreview } from './push';
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
  status: 'In Progress',
  points: 5,
  externalId: 'EXT-1',
  assignedMemberId: null,
  build: null,
  dirtyFields: [],
  itemType: null,
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

describe('buildPushPreview', () => {
  it('returns empty when nothing is dirty', () => {
    expect(buildPushPreview([item({ dirtyFields: [] })], ['points', 'sprint'])).toHaveLength(0);
  });

  it('skips local items (externalId === null)', () => {
    const items = [item({ externalId: null, dirtyFields: ['points'] })];
    expect(buildPushPreview(items, ['points', 'sprint'])).toHaveLength(0);
  });

  it('reports points from synced baseline to local value', () => {
    const items = [item({ points: 13, dirtyFields: ['points'], syncedValues: { points: 5, sprintId: 'sp_1' } })];
    const [p] = buildPushPreview(items, ['points', 'sprint']);
    expect(p).toMatchObject({ key: 'EXT-1', externalId: 'EXT-1' });
    expect(p.diffs).toEqual([{ field: 'points', from: 5, to: 13 }]);
  });

  it('reports sprint change as local sprint ids (caller resolves names)', () => {
    const items = [item({ sprintId: 'sp_2', dirtyFields: ['sprint'], syncedValues: { points: 5, sprintId: 'sp_1' } })];
    const [p] = buildPushPreview(items, ['points', 'sprint']);
    expect(p.diffs).toEqual([{ field: 'sprint', from: 'sp_1', to: 'sp_2' }]);
  });

  it('uses null `from` when there is no synced baseline', () => {
    const items = [item({ points: 8, dirtyFields: ['points'], syncedValues: null })];
    const [p] = buildPushPreview(items, ['points', 'sprint']);
    expect(p.diffs).toEqual([{ field: 'points', from: null, to: 8 }]);
  });

  it('emits both fields when both are dirty', () => {
    const items = [item({ points: 8, sprintId: 'sp_2', dirtyFields: ['points', 'sprint'], syncedValues: { points: 3, sprintId: null } })];
    const [p] = buildPushPreview(items, ['points', 'sprint']);
    expect(p.diffs).toEqual([
      { field: 'points', from: 3, to: 8 },
      { field: 'sprint', from: null, to: 'sp_2' },
    ]);
  });

  it('omits a dirty field that is not writeable', () => {
    const items = [item({ points: 8, dirtyFields: ['points'], syncedValues: { points: 3, sprintId: 'sp_1' } })];
    expect(buildPushPreview(items, ['sprint'])).toHaveLength(0);
  });
});
