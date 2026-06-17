import { describe, expect, it } from 'vitest';
import { buildPushChanges, buildPushPreview, type PushRefs } from './push';
import type { Member, Sprint, WorkItem, WorkStream } from '../types';
import type { ConnectorItemType } from './schema';

const sprint = (id: string, externalId: string | null): Sprint => ({
  id,
  name: 'S',
  startISO: '2026-04-13',
  endISO: '2026-04-26',
  daysOff: 0,
  externalId,
});

const stream = (id: string, externalId: string | null): WorkStream => ({ id, name: 'WS', externalId, engineersRequired: null, build: null });
const member = (id: string, externalId: string | null): Member => ({ id, name: 'M', externalId, nonContributing: false });

/** Wrap loose ref arrays in the PushRefs shape buildPushChanges expects. */
const pushRefs = (sprints: Sprint[] = [], workStreams: WorkStream[] = [], members: Member[] = []): PushRefs => ({ sprints, workStreams, members });

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

// A type with vocabulary fields: severity is writeable, foundIn is read-only.
const bugType: ConnectorItemType = {
  id: 'bug',
  label: 'Bug',
  fields: [
    { key: 'points', kind: 'number', role: 'points', writeable: true },
    { key: 'severity', label: 'Severity', kind: 'enum', writeable: true, options: [{ value: 'low', label: 'Low' }, { value: 'critical', label: 'Critical' }] },
    { key: 'foundIn', label: 'Found in', kind: 'string', writeable: false },
  ],
};

// A type whose status is writeable (enumRef: 'status' → local field 'status').
const statusType: ConnectorItemType = {
  id: 'flow',
  label: 'Flow',
  fields: [
    { key: 'status', kind: 'enum', enumRef: 'status', writeable: true },
  ],
};

// A type that declares the remaining canonical fields writeable: subject,
// description (roles), and the workStream/member refs. Exercises that any field a
// connector marks writeable round-trips to its named wire slot.
const richType: ConnectorItemType = {
  id: 'rich',
  label: 'Rich',
  fields: [
    { key: 'summary', kind: 'string', role: 'subject', writeable: true },
    { key: 'body', kind: 'string', role: 'description', writeable: true },
    { key: 'epic', kind: 'ref', target: 'workStream', writeable: true },
    { key: 'assignee', kind: 'ref', target: 'member', writeable: true },
  ],
};

describe('buildPushChanges', () => {
  const sprints = [sprint('sp_1', 'JSPR-1'), sprint('sp_2', 'JSPR-2')];

  // `undefined` catalog → legacy fallback (points + sprint writeable).
  it('returns empty when no items are dirty', () => {
    expect(buildPushChanges([item({ dirtyFields: [] })], pushRefs(sprints), undefined)).toHaveLength(0);
  });

  it('returns empty for local items (externalId === null)', () => {
    expect(buildPushChanges([item({ externalId: null, dirtyFields: ['points'] })], pushRefs(sprints), undefined)).toHaveLength(0);
  });

  it('emits a change with points when dirty and writeable', () => {
    const changes = buildPushChanges([item({ points: 13, dirtyFields: ['points'] })], pushRefs(sprints), undefined);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ externalId: 'EXT-1', fields: { points: 13 } });
    expect(changes[0].fields.extSprintId).toBeUndefined();
  });

  it('emits a change with extSprintId when sprint is dirty and writeable', () => {
    const changes = buildPushChanges([item({ sprintId: 'sp_2', dirtyFields: ['sprint'] })], pushRefs(sprints), undefined);
    expect(changes).toHaveLength(1);
    expect(changes[0].fields.extSprintId).toBe('JSPR-2');
    expect(changes[0].fields.points).toBeUndefined();
  });

  it('maps backlog (sprintId null) to extSprintId null', () => {
    const changes = buildPushChanges([item({ sprintId: null, dirtyFields: ['sprint'] })], pushRefs(sprints), undefined);
    expect(changes[0].fields.extSprintId).toBeNull();
  });

  it('maps sprintId with no externalId (local sprint) to extSprintId null', () => {
    const localSprints = [sprint('sp_local', null)];
    const changes = buildPushChanges([item({ sprintId: 'sp_local', dirtyFields: ['sprint'] })], pushRefs(localSprints), undefined);
    expect(changes[0].fields.extSprintId).toBeNull();
  });

  it('emits both points and sprint when both are dirty', () => {
    const changes = buildPushChanges([item({ points: 8, sprintId: 'sp_1', dirtyFields: ['points', 'sprint'] })], pushRefs(sprints), undefined);
    expect(changes[0].fields.points).toBe(8);
    expect(changes[0].fields.extSprintId).toBe('JSPR-1');
  });

  it('skips a dirty field that is not writeable for the item type', () => {
    // sprint_only type makes points create-once; the item resolves to it by itemType.id.
    const items = [item({ points: 13, dirtyFields: ['points'], itemType: { id: 'sprint_only', label: 'X' } })];
    expect(buildPushChanges(items, pushRefs(sprints), [sprintOnlyType])).toHaveLength(0);
  });

  it('serializes a dirty writeable vocabulary field into fields.attributes', () => {
    const items = [item({
      itemType: { id: 'bug', label: 'Bug' },
      attributes: { severity: 'critical' },
      dirtyFields: ['severity', 'points'],
      points: 8,
    })];
    const changes = buildPushChanges(items, pushRefs(sprints), [bugType]);
    expect(changes).toHaveLength(1);
    expect(changes[0].fields).toEqual({ points: 8, attributes: { severity: 'critical' } });
  });

  it('never serializes a non-writeable vocabulary field', () => {
    const items = [item({
      itemType: { id: 'bug', label: 'Bug' },
      attributes: { severity: 'low', foundIn: '5.0' },
      dirtyFields: ['foundIn'], // read-only per catalog
    })];
    expect(buildPushChanges(items, pushRefs(sprints), [bugType])).toHaveLength(0);
  });

  it('serializes a dirty status as the native vocabulary id', () => {
    const items = [item({
      itemType: { id: 'flow', label: 'Flow' },
      status: 'Under Review',
      statusNative: { id: 'qa', label: 'QA Verify' },
      dirtyFields: ['status'],
    })];
    const changes = buildPushChanges(items, pushRefs(sprints), [statusType]);
    expect(changes).toHaveLength(1);
    expect(changes[0].fields).toEqual({ statusId: 'qa' });
  });

  it('skips a dirty status that has no native id to express', () => {
    const items = [item({
      itemType: { id: 'flow', label: 'Flow' },
      status: 'Blocked',
      statusNative: null,
      dirtyFields: ['status'],
    })];
    expect(buildPushChanges(items, pushRefs(sprints), [statusType])).toHaveLength(0);
  });

  it('serializes dirty subject and description into their named wire slots', () => {
    const items = [item({
      itemType: { id: 'rich', label: 'Rich' },
      subject: 'New title',
      description: '<p>Edited body</p>',
      dirtyFields: ['subject', 'description'],
    })];
    const changes = buildPushChanges(items, pushRefs(sprints), [richType]);
    expect(changes).toHaveLength(1);
    expect(changes[0].fields).toEqual({ subject: 'New title', description: '<p>Edited body</p>' });
  });

  it('maps a dirty assignee to extAssigneeId (null when unassigned)', () => {
    const members = [member('mem_1', 'EXT-MEM-1')];
    const assigned = buildPushChanges(
      [item({ itemType: { id: 'rich', label: 'Rich' }, assignedMemberId: 'mem_1', dirtyFields: ['assignee'] })],
      pushRefs(sprints, [], members), [richType],
    );
    expect(assigned[0].fields.extAssigneeId).toBe('EXT-MEM-1');
    const unassigned = buildPushChanges(
      [item({ itemType: { id: 'rich', label: 'Rich' }, assignedMemberId: null, dirtyFields: ['assignee'] })],
      pushRefs(sprints, [], members), [richType],
    );
    expect(unassigned[0].fields.extAssigneeId).toBeNull();
  });

  it('maps a dirty workStream to extWorkStreamId', () => {
    const streams = [stream('ws_9', 'EXT-EPIC-9')];
    const changes = buildPushChanges(
      [item({ itemType: { id: 'rich', label: 'Rich' }, workStreamId: 'ws_9', dirtyFields: ['workStream'] })],
      pushRefs(sprints, streams), [richType],
    );
    expect(changes[0].fields.extWorkStreamId).toBe('EXT-EPIC-9');
  });

  it('handles multiple items, including a mix of dirty and clean', () => {
    const items = [
      item({ id: 'it_1', externalId: 'EXT-1', points: 8, dirtyFields: ['points'] }),
      item({ id: 'it_2', externalId: 'EXT-2', dirtyFields: [] }),
      item({ id: 'it_3', externalId: 'EXT-3', sprintId: 'sp_2', dirtyFields: ['sprint'] }),
    ];
    const changes = buildPushChanges(items, pushRefs(sprints), undefined);
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
    const items = [item({ points: 13, dirtyFields: ['points'], syncedValues: { points: 5, sprint: 'sp_1' } })];
    const [p] = buildPushPreview(items, undefined);
    expect(p).toMatchObject({ key: 'EXT-1', externalId: 'EXT-1' });
    expect(p.diffs).toEqual([{ field: 'points', label: 'Points', from: 5, to: 13 }]);
  });

  it('reports sprint change as local sprint ids (caller resolves names)', () => {
    const items = [item({ sprintId: 'sp_2', dirtyFields: ['sprint'], syncedValues: { points: 5, sprint: 'sp_1' } })];
    const [p] = buildPushPreview(items, undefined);
    expect(p.diffs).toEqual([{ field: 'sprint', label: 'Sprint', from: 'sp_1', to: 'sp_2' }]);
  });

  it('uses null `from` when there is no synced baseline', () => {
    const items = [item({ points: 8, dirtyFields: ['points'], syncedValues: null })];
    const [p] = buildPushPreview(items, undefined);
    expect(p.diffs).toEqual([{ field: 'points', label: 'Points', from: null, to: 8 }]);
  });

  it('emits both fields when both are dirty', () => {
    const items = [item({ points: 8, sprintId: 'sp_2', dirtyFields: ['points', 'sprint'], syncedValues: { points: 3, sprint: null } })];
    const [p] = buildPushPreview(items, undefined);
    expect(p.diffs).toEqual([
      { field: 'points', label: 'Points', from: 3, to: 8 },
      { field: 'sprint', label: 'Sprint', from: null, to: 'sp_2' },
    ]);
  });

  it('omits a dirty field that is not writeable for the item type', () => {
    const items = [item({ points: 8, dirtyFields: ['points'], syncedValues: { points: 3, sprint: 'sp_1' }, itemType: { id: 'sprint_only', label: 'X' } })];
    expect(buildPushPreview(items, [sprintOnlyType])).toHaveLength(0);
  });

  it('reports a status diff as native ids with the Status label', () => {
    const items = [item({
      itemType: { id: 'flow', label: 'Flow' },
      status: 'Under Review',
      statusNative: { id: 'qa', label: 'QA Verify' },
      dirtyFields: ['status'],
      syncedValues: { status: 'in_progress' },
    })];
    const [p] = buildPushPreview(items, [statusType]);
    expect(p.diffs).toEqual([{ field: 'status', label: 'Status', from: 'in_progress', to: 'qa' }]);
  });

  it('reports a dirty description diff with the Description label', () => {
    const items = [item({
      itemType: { id: 'rich', label: 'Rich' },
      description: '<p>After</p>',
      dirtyFields: ['description'],
      syncedValues: { description: '<p>Before</p>' },
    })];
    const [p] = buildPushPreview(items, [richType]);
    expect(p.diffs).toEqual([{ field: 'description', label: 'Description', from: '<p>Before</p>', to: '<p>After</p>' }]);
  });

  it('reports a vocabulary diff with its catalog label and spec', () => {
    const items = [item({
      itemType: { id: 'bug', label: 'Bug' },
      attributes: { severity: 'critical' },
      dirtyFields: ['severity'],
      syncedValues: { points: 5, sprint: 'sp_1', severity: 'low' },
    })];
    const [p] = buildPushPreview(items, [bugType]);
    expect(p.diffs).toHaveLength(1);
    expect(p.diffs[0]).toMatchObject({ field: 'severity', label: 'Severity', from: 'low', to: 'critical' });
    expect(p.diffs[0].spec?.options?.map((o) => o.value)).toContain('critical');
  });
});
