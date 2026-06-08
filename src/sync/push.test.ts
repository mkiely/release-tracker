import { describe, expect, it } from 'vitest';
import { buildPushChanges, buildPushPreview } from './push';
import type { Sprint, WorkItem } from '../types';
import type { ConnectorItemType } from './schema';

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

// A type where only `sprint` is writeable (points is create-once). Used to verify
// per-type writeability. Items must carry a matching itemType.id to resolve it;
// otherwise the legacy fallback (points + sprint) applies.
const sprintOnlyType: ConnectorItemType = {
  id: 'sprint_only',
  label: 'Sprint-only',
  fields: [
    { key: 'sprint', kind: 'ref', target: 'sprint', writeable: true },
    { key: 'points', kind: 'number', role: 'points', writeable: false },
  ],
};

describe('buildPushChanges', () => {
  const sprints = [sprint('sp_1', 'JSPR-1'), sprint('sp_2', 'JSPR-2')];

  // `undefined` catalog → legacy fallback (points + sprint writeable).
  it('returns empty when no items are dirty', () => {
    expect(buildPushChanges([item({ dirtyFields: [] })], sprints, undefined)).toHaveLength(0);
  });

  it('returns empty for local items (externalId === null)', () => {
    expect(buildPushChanges([item({ externalId: null, dirtyFields: ['points'] })], sprints, undefined)).toHaveLength(0);
  });

  it('emits a change with points when dirty and writeable', () => {
    const changes = buildPushChanges([item({ points: 13, dirtyFields: ['points'] })], sprints, undefined);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ externalId: 'EXT-1', fields: { points: 13 } });
    expect(changes[0].fields.extSprintId).toBeUndefined();
  });

  it('emits a change with extSprintId when sprint is dirty and writeable', () => {
    const changes = buildPushChanges([item({ sprintId: 'sp_2', dirtyFields: ['sprint'] })], sprints, undefined);
    expect(changes).toHaveLength(1);
    expect(changes[0].fields.extSprintId).toBe('JSPR-2');
    expect(changes[0].fields.points).toBeUndefined();
  });

  it('maps backlog (sprintId null) to extSprintId null', () => {
    const changes = buildPushChanges([item({ sprintId: null, dirtyFields: ['sprint'] })], sprints, undefined);
    expect(changes[0].fields.extSprintId).toBeNull();
  });

  it('maps sprintId with no externalId (local sprint) to extSprintId null', () => {
    const localSprints = [sprint('sp_local', null)];
    const changes = buildPushChanges([item({ sprintId: 'sp_local', dirtyFields: ['sprint'] })], localSprints, undefined);
    expect(changes[0].fields.extSprintId).toBeNull();
  });

  it('emits both points and sprint when both are dirty', () => {
    const changes = buildPushChanges([item({ points: 8, sprintId: 'sp_1', dirtyFields: ['points', 'sprint'] })], sprints, undefined);
    expect(changes[0].fields.points).toBe(8);
    expect(changes[0].fields.extSprintId).toBe('JSPR-1');
  });

  it('skips a dirty field that is not writeable for the item type', () => {
    // sprint_only type makes points create-once; the item resolves to it by itemType.id.
    const items = [item({ points: 13, dirtyFields: ['points'], itemType: { id: 'sprint_only', label: 'X' } })];
    expect(buildPushChanges(items, sprints, [sprintOnlyType])).toHaveLength(0);
  });

  it('handles multiple items, including a mix of dirty and clean', () => {
    const items = [
      item({ id: 'it_1', externalId: 'EXT-1', points: 8, dirtyFields: ['points'] }),
      item({ id: 'it_2', externalId: 'EXT-2', dirtyFields: [] }),
      item({ id: 'it_3', externalId: 'EXT-3', sprintId: 'sp_2', dirtyFields: ['sprint'] }),
    ];
    const changes = buildPushChanges(items, sprints, undefined);
    expect(changes).toHaveLength(2);
    expect(changes.map((c) => c.externalId)).toEqual(['EXT-1', 'EXT-3']);
  });
});

describe('buildPushPreview', () => {
  it('returns empty when nothing is dirty', () => {
    expect(buildPushPreview([item({ dirtyFields: [] })], undefined)).toHaveLength(0);
  });

  it('skips local items (externalId === null)', () => {
    expect(buildPushPreview([item({ externalId: null, dirtyFields: ['points'] })], undefined)).toHaveLength(0);
  });

  it('reports points from synced baseline to local value', () => {
    const items = [item({ points: 13, dirtyFields: ['points'], syncedValues: { points: 5, sprintId: 'sp_1' } })];
    const [p] = buildPushPreview(items, undefined);
    expect(p).toMatchObject({ key: 'EXT-1', externalId: 'EXT-1' });
    expect(p.diffs).toEqual([{ field: 'points', from: 5, to: 13 }]);
  });

  it('reports sprint change as local sprint ids (caller resolves names)', () => {
    const items = [item({ sprintId: 'sp_2', dirtyFields: ['sprint'], syncedValues: { points: 5, sprintId: 'sp_1' } })];
    const [p] = buildPushPreview(items, undefined);
    expect(p.diffs).toEqual([{ field: 'sprint', from: 'sp_1', to: 'sp_2' }]);
  });

  it('uses null `from` when there is no synced baseline', () => {
    const items = [item({ points: 8, dirtyFields: ['points'], syncedValues: null })];
    const [p] = buildPushPreview(items, undefined);
    expect(p.diffs).toEqual([{ field: 'points', from: null, to: 8 }]);
  });

  it('emits both fields when both are dirty', () => {
    const items = [item({ points: 8, sprintId: 'sp_2', dirtyFields: ['points', 'sprint'], syncedValues: { points: 3, sprintId: null } })];
    const [p] = buildPushPreview(items, undefined);
    expect(p.diffs).toEqual([
      { field: 'points', from: 3, to: 8 },
      { field: 'sprint', from: null, to: 'sp_2' },
    ]);
  });

  it('omits a dirty field that is not writeable for the item type', () => {
    const items = [item({ points: 8, dirtyFields: ['points'], syncedValues: { points: 3, sprintId: 'sp_1' }, itemType: { id: 'sprint_only', label: 'X' } })];
    expect(buildPushPreview(items, [sprintOnlyType])).toHaveLength(0);
  });
});
