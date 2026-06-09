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

// Minimal v6 item — has build, no descriptionFormat.
const v6Item = () => ({
  ...v4Item(), build: null,
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

describe('migrate — v6 → current', () => {
  const sp = { id: 'sp1', name: 'Sprint 1', startISO: '2026-04-13', endISO: '2026-04-26', daysOff: 0, externalId: null };
  const v6 = {
    version: 6, teams: [], meta: { lastSyncISO: null },
    releases: [{ ...v2Release(), sprints: [sp] }],
    items: [v6Item()],
  };

  it('reaches the current schema version', () => {
    expect(migrate(v6 as any)?.version).toBe(SCHEMA_VERSION);
  });

  it('adds descriptionFormat: text to items that lack it', () => {
    const next = migrate(v6 as any)!;
    expect(next.items[0].descriptionFormat).toBe('text');
  });

  it('preserves an existing descriptionFormat: html when already set', () => {
    const v6WithHtml = { ...v6, items: [{ ...v6Item(), descriptionFormat: 'html' }] };
    const next = migrate(v6WithHtml as any)!;
    expect(next.items[0].descriptionFormat).toBe('html');
  });

  it('sets descriptionFormat on every item when multiple items are present', () => {
    const v6Multi = { ...v6, items: [v6Item(), { ...v6Item(), id: 'it2', key: 'K-2' }] };
    const next = migrate(v6Multi as any)!;
    expect(next.items.every((i) => i.descriptionFormat === 'text')).toBe(true);
  });
});

// Minimal v7 item — has descriptionFormat, no itemType.
const v7Item = () => ({
  ...v6Item(), descriptionFormat: 'text' as const,
});
// Minimal v7 team member — no nonContributing.
const v7Member = () => ({ id: 'm1', name: 'Alice', externalId: null });

describe('migrate — v7 → current', () => {
  const sp = { id: 'sp1', name: 'Sprint 1', startISO: '2026-04-13', endISO: '2026-04-26', daysOff: 0, externalId: null };
  const v7 = {
    version: 7,
    teams: [{ id: 't1', name: 'Team', velocity: 30, externalId: null, members: [v7Member()] }],
    meta: { lastSyncISO: null },
    releases: [{ ...v2Release(), sprints: [sp] }],
    items: [v7Item()],
  };

  it('reaches the current schema version', () => {
    expect(migrate(v7 as any)?.version).toBe(SCHEMA_VERSION);
  });

  it('adds itemType: null to items that lack it', () => {
    const next = migrate(v7 as any)!;
    expect(next.items[0].itemType).toBeNull();
  });

  it('adds nonContributing: false to members that lack it', () => {
    const next = migrate(v7 as any)!;
    expect(next.teams[0].members[0].nonContributing).toBe(false);
  });

  it('preserves an existing nonContributing: true when already set', () => {
    const v7WithNonContrib = {
      ...v7,
      teams: [{ ...v7.teams[0], members: [{ ...v7Member(), nonContributing: true }] }],
    };
    const next = migrate(v7WithNonContrib as any)!;
    expect(next.teams[0].members[0].nonContributing).toBe(true);
  });
});

// Minimal v8 item — has all v8 fields, uses legacy 'Active' status.
const v8Item = () => ({
  ...v7Item(), itemType: null,
});
// Minimal v8 member — has nonContributing.
const v8Member = () => ({ ...v7Member(), nonContributing: false });

describe('migrate — v8 → current', () => {
  const sp = { id: 'sp1', name: 'Sprint 1', startISO: '2026-04-13', endISO: '2026-04-26', daysOff: 0, externalId: null };
  const v8 = {
    version: 8,
    teams: [{ id: 't1', name: 'Team', velocity: 30, externalId: null, members: [v8Member()] }],
    meta: { lastSyncISO: null },
    releases: [{ ...v2Release(), sprints: [sp] }],
    items: [v8Item()],
  };

  it('reaches the current schema version', () => {
    expect(migrate(v8 as any)?.version).toBe(SCHEMA_VERSION);
  });

  it("renames 'Active' status to 'In Progress'", () => {
    const next = migrate(v8 as any)!;
    expect(next.items[0].status).toBe('In Progress');
  });

  it('leaves other statuses unchanged', () => {
    const mixed = {
      ...v8,
      items: [
        { ...v8Item(), status: 'Not Started' },
        { ...v8Item(), id: 'it2', key: 'K-2', status: 'Blocked' },
        { ...v8Item(), id: 'it3', key: 'K-3', status: 'Complete' },
        { ...v8Item(), id: 'it4', key: 'K-4', status: 'Active' },
      ],
    };
    const next = migrate(mixed as any)!;
    expect(next.items.map((i) => i.status)).toEqual(['Not Started', 'Blocked', 'Complete', 'In Progress']);
  });
});

describe('migrate — v9 → current', () => {
  const v9 = {
    version: 9,
    teams: [],
    meta: { lastSyncISO: null },
    releases: [{ ...v2Release(), workStreams: [{ id: 'ws1', name: 'API', externalId: null }] }],
    items: [],
  };

  it('reaches the current schema version', () => {
    expect(migrate(v9 as any)?.version).toBe(SCHEMA_VERSION);
  });

  it('adds engineersRequired: null to work streams that lack it', () => {
    const next = migrate(v9 as any)!;
    expect(next.releases[0].workStreams[0].engineersRequired).toBeNull();
  });

  it('preserves an existing engineersRequired value', () => {
    const withVal = {
      ...v9,
      releases: [{ ...v2Release(), workStreams: [{ id: 'ws1', name: 'API', externalId: null, engineersRequired: 3 }] }],
    };
    const next = migrate(withVal as any)!;
    expect(next.releases[0].workStreams[0].engineersRequired).toBe(3);
  });
});

describe('migrate — v10 → current', () => {
  const sp = { id: 'sp1', name: 'Sprint 1', startISO: '2026-04-13', endISO: '2026-04-26', daysOff: 0, externalId: null };
  // Minimal v10 item — all v10 fields, no syncedValues.
  const v10Item = (over: Record<string, unknown> = {}) => ({
    ...v8Item(), itemType: null, status: 'Not Started', sprintId: 'sp1', points: 3, ...over,
  });
  const v10 = {
    version: 10,
    teams: [],
    meta: { lastSyncISO: null },
    releases: [{ ...v2Release(), workStreams: [{ id: 'ws1', name: 'API', externalId: null, engineersRequired: null }], sprints: [sp] }],
    items: [v10Item({ externalId: 'EXT-1' })],
  };

  it('reaches the current schema version', () => {
    expect(migrate(v10 as any)?.version).toBe(SCHEMA_VERSION);
  });

  it('seeds syncedValues from the current value for synced items', () => {
    const next = migrate(v10 as any)!;
    expect(next.items[0].syncedValues).toEqual({ points: 3, sprint: 'sp1' });
  });

  it('sets syncedValues null for local items (no externalId)', () => {
    const local = { ...v10, items: [v10Item({ externalId: null })] };
    const next = migrate(local as any)!;
    expect(next.items[0].syncedValues).toBeNull();
  });

  it('preserves an existing syncedValues when already set', () => {
    const withVal = { ...v10, items: [v10Item({ externalId: 'EXT-1', syncedValues: { points: 8, sprintId: null } })] };
    const next = migrate(withVal as any)!;
    expect(next.items[0].syncedValues).toEqual({ points: 8, sprint: null });
  });
});

describe('migrate — v11 → current', () => {
  const v11 = {
    version: 11,
    teams: [],
    meta: { lastSyncISO: null },
    releases: [{ ...v2Release(), workStreams: [{ id: 'ws1', name: 'API', externalId: null, engineersRequired: null }] }],
    items: [],
  };

  it('reaches the current schema version', () => {
    expect(migrate(v11 as any)?.version).toBe(SCHEMA_VERSION);
  });

  it('adds build: null to work streams that lack it (treated as native)', () => {
    const next = migrate(v11 as any)!;
    expect(next.releases[0].workStreams[0].build).toBeNull();
  });

  it('preserves an existing build value', () => {
    const withBuild = {
      ...v11,
      releases: [{ ...v2Release(), workStreams: [{ id: 'ws1', name: 'API', externalId: null, engineersRequired: null, build: 'Orion 1.5' }] }],
    };
    const next = migrate(withBuild as any)!;
    expect(next.releases[0].workStreams[0].build).toBe('Orion 1.5');
  });
});

describe('migrate — v12 → current', () => {
  const v12Ws = (over: Record<string, unknown> = {}) => ({
    id: 'ws1', name: 'API', externalId: null, engineersRequired: null, build: null, ...over,
  });
  const v12Item = (over: Record<string, unknown> = {}) => ({
    id: 'it1', releaseId: 'r1', workStreamId: 'ws1', sprintId: null,
    key: 'K-1', subject: 'S', description: '', status: 'Not Started', points: 3,
    externalId: null, assignedMemberId: null, build: null, dirtyFields: [],
    syncedValues: null, itemType: null, ...over,
  });
  const v12 = {
    version: 12,
    teams: [],
    meta: { lastSyncISO: null },
    releases: [{ ...v2Release(), sprints: [], workStreams: [v12Ws()] }],
    items: [v12Item()],
  };

  it('reaches the current schema version', () => {
    expect(migrate(v12 as any)?.version).toBe(SCHEMA_VERSION);
  });

  it('adds attributes: {} to items and work streams that lack it', () => {
    const next = migrate(v12 as any)!;
    expect(next.items[0].attributes).toEqual({});
    expect(next.releases[0].workStreams[0].attributes).toEqual({});
  });

  it('adds catalog: null to releases', () => {
    const next = migrate(v12 as any)!;
    expect(next.releases[0].catalog).toBeNull();
  });

  it('preserves existing attributes when already set', () => {
    const withAttrs = {
      ...v12,
      items: [v12Item({ attributes: { severity: 'high' } })],
      releases: [{ ...v2Release(), sprints: [], workStreams: [v12Ws({ attributes: { area: 'payments' } })] }],
    };
    const next = migrate(withAttrs as any)!;
    expect(next.items[0].attributes).toEqual({ severity: 'high' });
    expect(next.releases[0].workStreams[0].attributes).toEqual({ area: 'payments' });
  });
});

describe('migrate — v13 → current', () => {
  const v13Item = (over: Record<string, unknown> = {}) => ({
    id: 'it1', releaseId: 'r1', workStreamId: 'ws1', sprintId: 'sp1',
    key: 'K-1', subject: 'S', description: '', status: 'Not Started', points: 3,
    externalId: 'EXT-1', assignedMemberId: null, build: null, dirtyFields: [],
    syncedValues: { points: 3, sprintId: 'sp1' }, itemType: null, attributes: {}, ...over,
  });
  const v13 = (items: unknown[]) => ({
    version: 13, teams: [], meta: { lastSyncISO: null },
    releases: [{ ...v2Release(), sprints: [], catalog: null }],
    items,
  });

  it('renames the syncedValues sprintId key to sprint', () => {
    const next = migrate(v13([v13Item()]) as any)!;
    expect(next.version).toBe(SCHEMA_VERSION);
    expect(next.items[0].syncedValues).toEqual({ points: 3, sprint: 'sp1' });
  });

  it('keeps a null baseline null (local items)', () => {
    const next = migrate(v13([v13Item({ externalId: null, syncedValues: null })]) as any)!;
    expect(next.items[0].syncedValues).toBeNull();
  });

  it('passes an already-record-shaped baseline through unchanged', () => {
    const record = { points: 5, sprint: null, severity: 'high' };
    const next = migrate(v13([v13Item({ syncedValues: record })]) as any)!;
    expect(next.items[0].syncedValues).toEqual(record);
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
