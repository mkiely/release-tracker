import { describe, expect, it } from 'vitest';
import { migrate } from './store';
import { SCHEMA_VERSION } from '../types';

// Minimal v1 release — no connector/sync fields.
const v1Release = () => ({
  id: 'r1', name: 'Orion 2.0', startISO: '2026-04-13', teamId: 't1',
  workStreams: [], events: [], sprints: [], externalId: null,
});

// Minimal v2 release — has connector/sync, sprints use numeric `n`.
const v2Sprint = (n: number) => ({
  n, name: `Sprint ${n}`, startISO: '2026-04-13', endISO: '2026-04-26', daysOff: 0, externalId: null,
});

const v2Release = () => ({
  ...v1Release(), connector: null, sync: null,
  sprints: [v2Sprint(1), v2Sprint(2)],
});

// Minimal v3 item — no assignedMemberId / dirtyFields.
const v3Item = () => ({
  id: 'it1', releaseId: 'r1', workStreamId: 'ws1', sprintId: 'sp_x',
  key: 'K-1', subject: 'S', description: '', status: 'Active', points: 3, externalId: null,
});

// Minimal v4 item — no build field.
const v4Item = () => ({
  ...v3Item(), assignedMemberId: null, dirtyFields: [],
});

describe('migrate — v1 → current', () => {
  const v1 = { version: 1, teams: [], releases: [v1Release()], items: [], meta: { lastSyncISO: null } };

  it('reaches the current schema version', () => {
    expect(migrate(v1 as any)?.version).toBe(SCHEMA_VERSION);
  });

  it('adds connector: null and sync: null to releases', () => {
    const next = migrate(v1 as any)!;
    expect(next.releases[0].connector).toBeNull();
    expect(next.releases[0].sync).toBeNull();
  });

  it('preserves existing connector value when already set', () => {
    const withConn = {
      ...v1,
      releases: [{ ...v1Release(), connector: { type: 'jira', config: {} } }],
    };
    const next = migrate(withConn as any)!;
    expect(next.releases[0].connector).toEqual({ type: 'jira', config: {} });
  });
});

describe('migrate — v2 → current', () => {
  const v2Item = (sprintN: number) => ({
    id: 'it1', releaseId: 'r1', workStreamId: 'ws1', sprintN,
    key: 'K-1', subject: 'S', description: '', status: 'Active', points: 3, externalId: null,
  });

  const v2 = {
    version: 2, teams: [], meta: { lastSyncISO: null },
    releases: [v2Release()],
    items: [v2Item(1), { ...v2Item(2), id: 'it2', key: 'K-2' }],
  };

  it('reaches the current schema version', () => {
    expect(migrate(v2 as any)?.version).toBe(SCHEMA_VERSION);
  });

  it('replaces sprint positional n with a string id', () => {
    const next = migrate(v2 as any)!;
    const sprints = next.releases[0].sprints;
    expect(sprints).toHaveLength(2);
    expect(typeof sprints[0].id).toBe('string');
    expect((sprints[0] as any).n).toBeUndefined();
  });

  it('rewires item sprintId to match the new sprint string id', () => {
    const next = migrate(v2 as any)!;
    const sprint1Id = next.releases[0].sprints[0].id;
    const sprint2Id = next.releases[0].sprints[1].id;
    expect(next.items[0].sprintId).toBe(sprint1Id);
    expect(next.items[1].sprintId).toBe(sprint2Id);
    expect((next.items[0] as any).sprintN).toBeUndefined();
  });

  it('maps sprintN 0 (backlog) to sprintId null', () => {
    const v2WithBacklog = {
      ...v2,
      items: [{ ...v2Item(0), id: 'it_bl', key: 'BL-1' }],
    };
    const next = migrate(v2WithBacklog as any)!;
    expect(next.items[0].sprintId).toBeNull();
  });

  it('adds assignedMemberId: null and dirtyFields: [] to items', () => {
    const next = migrate(v2 as any)!;
    expect(next.items[0].assignedMemberId).toBeNull();
    expect(next.items[0].dirtyFields).toEqual([]);
  });
});

describe('migrate — v3 → current', () => {
  const v3 = {
    version: 3, teams: [], meta: { lastSyncISO: null },
    releases: [{ ...v2Release(), sprints: [{ id: 'sp1', name: 'Sprint 1', startISO: '2026-04-13', endISO: '2026-04-26', daysOff: 0, externalId: null }] }],
    items: [v3Item()],
  };

  it('reaches the current schema version', () => {
    expect(migrate(v3 as any)?.version).toBe(SCHEMA_VERSION);
  });

  it('adds assignedMemberId: null to items that lack it', () => {
    const next = migrate(v3 as any)!;
    expect(next.items[0].assignedMemberId).toBeNull();
  });

  it('adds dirtyFields: [] to items that lack it', () => {
    const next = migrate(v3 as any)!;
    expect(next.items[0].dirtyFields).toEqual([]);
  });

  it('preserves existing assignedMemberId when already set', () => {
    const v3WithAssignee = { ...v3, items: [{ ...v3Item(), assignedMemberId: 'm1' }] };
    const next = migrate(v3WithAssignee as any)!;
    expect(next.items[0].assignedMemberId).toBe('m1');
  });
});

describe('migrate — v4 → current', () => {
  const v4 = {
    version: 4, teams: [], meta: { lastSyncISO: null },
    releases: [{ ...v2Release(), sprints: [{ id: 'sp1', name: 'Sprint 1', startISO: '2026-04-13', endISO: '2026-04-26', daysOff: 0, externalId: null }] }],
    items: [v4Item()],
  };

  it('reaches the current schema version', () => {
    expect(migrate(v4 as any)?.version).toBe(SCHEMA_VERSION);
  });

  it('adds build: null to items that lack it', () => {
    const next = migrate(v4 as any)!;
    expect(next.items[0].build).toBeNull();
  });

  it('preserves an existing build value when already set', () => {
    const v4WithBuild = { ...v4, items: [{ ...v4Item(), build: 'Orion 1.5' }] };
    const next = migrate(v4WithBuild as any)!;
    expect(next.items[0].build).toBe('Orion 1.5');
  });

  it('sets build: null on every item when multiple items are present', () => {
    const v4Multi = { ...v4, items: [v4Item(), { ...v4Item(), id: 'it2', key: 'K-2' }] };
    const next = migrate(v4Multi as any)!;
    expect(next.items.every((i) => i.build === null)).toBe(true);
  });
});

describe('migrate — edge cases', () => {
  it('returns null for an unknown schema version', () => {
    const unknown = { version: 999, teams: [], releases: [], items: [], meta: { lastSyncISO: null } };
    expect(migrate(unknown as any)).toBeNull();
  });

  it('returns the state unchanged for the current version', () => {
    const current = { version: SCHEMA_VERSION, teams: [], releases: [], items: [], meta: { lastSyncISO: null } };
    const result = migrate(current as any);
    expect(result).toEqual(current);
  });
});
