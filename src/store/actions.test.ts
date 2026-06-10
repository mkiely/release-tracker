// @vitest-environment jsdom
//
// Store-action tests — the functions every UI interaction flows through.
// Implements docs/store-actions-test-plan.md. Runs in jsdom because the store
// singleton's load()/persist() touch localStorage, and syncRelease dispatches a
// window CustomEvent. The async sync/push actions mock the syncClient seam.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SCHEMA_VERSION } from '../types';
import type { ConnectorItemType, MappedRelease } from '../sync/schema';

// Mock the syncClient seam used by syncRelease / pushRelease. Keep the rest of
// the module (createSyncClient, connectorLabel, …) intact.
vi.mock('../sync/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../sync/client')>();
  return {
    ...actual,
    syncClient: {
      listConnectors: vi.fn(),
      validate: vi.fn(),
      sync: vi.fn(),
      push: vi.fn(),
    },
  };
});

import { getActions, getState, useStore } from './store';
import { syncClient } from '../sync/client';

const client = syncClient as unknown as {
  listConnectors: ReturnType<typeof vi.fn>;
  validate: ReturnType<typeof vi.fn>;
  sync: ReturnType<typeof vi.fn>;
  push: ReturnType<typeof vi.fn>;
};

const A = getActions; // shorthand: A() → the live actions object

// Default item type: points + sprint are writeable (matches legacy behavior).
const STORY_TYPE: ConnectorItemType = {
  id: 'jira_story',
  label: 'Story',
  fields: [
    { key: 'points', kind: 'number', role: 'points', writeable: true },
    { key: 'sprint', kind: 'ref', target: 'sprint', writeable: true },
  ],
};

// A connector meta whose item catalog makes points + sprint writeable.
const jiraMeta = (over: Record<string, unknown> = {}) => ({
  type: 'jira',
  label: 'Jira',
  configFields: [],
  itemTypes: [STORY_TYPE],
  ...over,
});

// A minimal MappedRelease the fixture sync returns.
const mappedRelease = (over: Partial<MappedRelease> = {}): MappedRelease => ({
  workStreams: [{ externalId: 'EPIC-A', fields: { name: 'Checkout API' } }],
  sprints: [{ externalId: 'JSPR-1', fields: { name: 'Sprint 1', startISO: '2026-04-13', endISO: '2026-04-26' } }],
  items: [
    { externalId: 'EXT-1', extWorkStreamId: 'EPIC-A', extSprintId: 'JSPR-1', extAssigneeId: null, fields: { key: 'EXT-1', subject: 'Tokenize vault', description: 'd', status: 'In Progress', points: 5 } },
  ],
  ...over,
});

beforeEach(() => {
  localStorage.clear();
  vi.resetAllMocks();
  // Reset the module-level singleton to a clean, empty store. setState merges at
  // the top level, so the stable `actions` reference is preserved.
  useStore.setState({ version: SCHEMA_VERSION, teams: [], releases: [], items: [], meta: { lastSyncISO: null } });
});

describe('createTeam', () => {
  it('creates a team with the given name, velocity, and members', () => {
    const t = A().createTeam({ name: 'Platform', velocity: 30, members: ['Alice', 'Bob'] });
    expect(t.name).toBe('Platform');
    expect(t.velocity).toBe(30);
    expect(t.members.map((m) => m.name)).toEqual(['Alice', 'Bob']);
    expect(getState().teams).toHaveLength(1);
  });

  it('filters out blank member names before storing', () => {
    const t = A().createTeam({ name: 'X', velocity: 10, members: ['Alice', '   ', '', 'Bob'] });
    expect(t.members.map((m) => m.name)).toEqual(['Alice', 'Bob']);
  });

  it("defaults name to 'Untitled team' when name is empty", () => {
    expect(A().createTeam({ name: '', velocity: 10, members: [] }).name).toBe('Untitled team');
  });

  it('sets velocity to 0 when velocity is empty/NaN', () => {
    expect(A().createTeam({ name: 'X', velocity: '', members: [] }).velocity).toBe(0);
    expect(A().createTeam({ name: 'X', velocity: 'abc', members: [] }).velocity).toBe(0);
  });

  it('sets externalId: null and nonContributing: false on team and members', () => {
    const t = A().createTeam({ name: 'X', velocity: 10, members: ['Alice'] });
    expect(t.externalId).toBeNull();
    expect(t.members[0].externalId).toBeNull();
    expect(t.members[0].nonContributing).toBe(false);
  });
});

describe('updateTeam', () => {
  it('patches the named fields on the target team and leaves others untouched', () => {
    const a = A().createTeam({ name: 'A', velocity: 10, members: [] });
    const b = A().createTeam({ name: 'B', velocity: 20, members: [] });
    A().updateTeam(a.id, { velocity: 99 });
    expect(getState().teams.find((t) => t.id === a.id)?.velocity).toBe(99);
    expect(getState().teams.find((t) => t.id === b.id)?.velocity).toBe(20);
  });
});

describe('createRelease (local)', () => {
  it('creates a release with connector: null and a fixed sprint grid', () => {
    const t = A().createTeam({ name: 'T', velocity: 20, members: [] });
    const r = A().createRelease({ name: 'Orion', startISO: '2026-04-13', teamId: t.id });
    expect(r.connector).toBeNull();
    expect(r.sprints.length).toBeGreaterThan(0);
    // sprint dates are contiguous (each starts the day after the previous ends).
    expect(r.sprints[0].startISO).toBe('2026-04-13');
  });

  it('respects the sprintCount parameter', () => {
    const t = A().createTeam({ name: 'T', velocity: 20, members: [] });
    const r = A().createRelease({ name: 'Orion', startISO: '2026-04-13', teamId: t.id, sprintCount: 3 });
    expect(r.sprints).toHaveLength(3);
  });
});

describe('createRelease (connector)', () => {
  it('creates a release with no sprints (external system supplies them on sync)', () => {
    const r = A().createRelease({ name: 'Orion', startISO: '2026-04-13', teamId: 't1', connector: { type: 'jira', config: {} } });
    expect(r.sprints).toEqual([]);
    expect(r.connector).toEqual({ type: 'jira', config: {} });
    expect(r.sync).toBeNull();
  });
});

describe('createWorkStream', () => {
  it('appends the work stream to the named release', () => {
    const t = A().createTeam({ name: 'T', velocity: 20, members: [] });
    const r = A().createRelease({ name: 'Orion', startISO: '2026-04-13', teamId: t.id });
    const ws = A().createWorkStream(r.id, 'API');
    expect(ws).not.toBeNull();
    expect(getState().releases[0].workStreams.map((w) => w.name)).toEqual(['API']);
    expect(ws!.engineersRequired).toBeNull();
  });

  it('returns null and makes no change for an unknown release id', () => {
    expect(A().createWorkStream('nope', 'API')).toBeNull();
  });
});

describe('createEvent', () => {
  it('appends the event to the named release', () => {
    const t = A().createTeam({ name: 'T', velocity: 20, members: [] });
    const r = A().createRelease({ name: 'Orion', startISO: '2026-04-13', teamId: t.id });
    A().createEvent(r.id, { label: 'Code freeze', dateISO: '2026-05-01' });
    expect(getState().releases[0].events).toMatchObject([{ label: 'Code freeze', dateISO: '2026-05-01' }]);
  });

  it('no-ops silently for an unknown release id', () => {
    expect(() => A().createEvent('nope', { label: 'X', dateISO: '2026-05-01' })).not.toThrow();
    expect(getState().releases).toHaveLength(0);
  });
});

describe('updateSprint', () => {
  it('patches daysOff on the target sprint and leaves others untouched', () => {
    const t = A().createTeam({ name: 'T', velocity: 20, members: [] });
    const r = A().createRelease({ name: 'Orion', startISO: '2026-04-13', teamId: t.id, sprintCount: 2 });
    A().updateSprint(r.id, r.sprints[0].id, { daysOff: 4 });
    const after = getState().releases[0].sprints;
    expect(after[0].daysOff).toBe(4);
    expect(after[1].daysOff).toBe(0);
  });
});

describe('createItem', () => {
  const setup = () => {
    const t = A().createTeam({ name: 'T', velocity: 20, members: [] });
    return A().createRelease({ name: 'Orion 2.0', startISO: '2026-04-13', teamId: t.id });
  };

  it('derives the key from the first 3 letters of the release name', () => {
    const r = setup();
    const it = A().createItem(r.id, { workStreamId: null, sprintId: null, subject: 'S' });
    expect(it!.key).toBe('ORI-100');
  });

  it("falls back to prefix 'I' when the release name has no letters", () => {
    const t = A().createTeam({ name: 'T', velocity: 20, members: [] });
    const r = A().createRelease({ name: '2.0', startISO: '2026-04-13', teamId: t.id });
    const it = A().createItem(r.id, { workStreamId: null, sprintId: null, subject: 'S' });
    expect(it!.key).toBe('I-100');
  });

  it('increments the key count from existing items for this release', () => {
    const r = setup();
    A().createItem(r.id, { workStreamId: null, sprintId: null, subject: 'A' });
    const second = A().createItem(r.id, { workStreamId: null, sprintId: null, subject: 'B' });
    expect(second!.key).toBe('ORI-101');
  });

  it('sets sensible defaults (status, externalId, dirtyFields, syncedValues)', () => {
    const r = setup();
    const it = A().createItem(r.id, { workStreamId: null, sprintId: null, subject: 'S' });
    expect(it!.status).toBe('Not Started');
    expect(it!.externalId).toBeNull();
    expect(it!.dirtyFields).toEqual([]);
    expect(it!.syncedValues).toBeNull();
    expect(it!.points).toBe(0);
  });

  it('returns null for an unknown release id', () => {
    expect(A().createItem('nope', { workStreamId: null, sprintId: null, subject: 'S' })).toBeNull();
  });
});

describe('updateItem', () => {
  it('applies the patch to the target item and leaves others untouched', () => {
    const t = A().createTeam({ name: 'T', velocity: 20, members: [] });
    const r = A().createRelease({ name: 'Orion', startISO: '2026-04-13', teamId: t.id });
    const a = A().createItem(r.id, { workStreamId: null, sprintId: null, subject: 'A' })!;
    const b = A().createItem(r.id, { workStreamId: null, sprintId: null, subject: 'B' })!;
    A().updateItem(a.id, { points: 8, status: 'Blocked' });
    expect(getState().items.find((i) => i.id === a.id)).toMatchObject({ points: 8, status: 'Blocked' });
    expect(getState().items.find((i) => i.id === b.id)?.points).toBe(0);
  });
});

describe('syncRelease', () => {
  it("returns { ok: false, reason: 'no-connector' } for a local release", async () => {
    const t = A().createTeam({ name: 'T', velocity: 20, members: [] });
    const r = A().createRelease({ name: 'Orion', startISO: '2026-04-13', teamId: t.id });
    const out = await A().syncRelease(r.id);
    expect(out).toMatchObject({ ok: false, reason: 'no-connector' });
  });

  it('applies the mapped payload and marks the release synced on success', async () => {
    client.listConnectors.mockResolvedValue([jiraMeta()]);
    client.sync.mockResolvedValue(mappedRelease());
    const r = A().createRelease({ name: 'Orion', startISO: '2026-04-13', teamId: 't1', connector: { type: 'jira', config: {} } });

    const out = await A().syncRelease(r.id);

    expect(out.ok).toBe(true);
    expect(client.sync).toHaveBeenCalledOnce();
    const after = getState();
    expect(after.meta.lastSyncISO).not.toBeNull();
    expect(after.releases[0].sync?.state).toBe('ok');
    // applySync upserted the mapped work stream + item.
    expect(after.releases[0].workStreams.map((w) => w.externalId)).toContain('EPIC-A');
    expect(after.items.map((i) => i.externalId)).toContain('EXT-1');
  });

  it("returns { ok: false, reason: 'error' } and records the error when sync throws", async () => {
    client.listConnectors.mockResolvedValue([jiraMeta()]);
    client.sync.mockRejectedValue(new Error('boom'));
    const r = A().createRelease({ name: 'Orion', startISO: '2026-04-13', teamId: 't1', connector: { type: 'jira', config: {} } });

    const out = await A().syncRelease(r.id);

    expect(out).toMatchObject({ ok: false, reason: 'error', message: 'boom' });
    expect(getState().releases[0].sync?.state).toBe('error');
  });
});

describe('revertItem', () => {
  it('restores dirty fields — including attributes — to the synced baseline', () => {
    const t = A().createTeam({ name: 'T', velocity: 20, members: [] });
    const r = A().createRelease({ name: 'Orion', startISO: '2026-04-13', teamId: t.id, connector: { type: 'jira', config: {} } });
    const it1 = A().createItem(r.id, { workStreamId: null, sprintId: null, subject: 'S', points: 8 })!;
    A().updateItem(it1.id, {
      externalId: 'EXT-1',
      attributes: { severity: 'critical' },
      dirtyFields: ['points', 'severity'],
      syncedValues: { points: 5, sprint: null, severity: 'low' },
    });

    A().revertItem(it1.id);

    const reverted = getState().items.find((i) => i.id === it1.id)!;
    expect(reverted.dirtyFields).toEqual([]);
    expect(reverted.points).toBe(5);
    expect(reverted.attributes).toEqual({ severity: 'low' });
  });

  it('restores a dirty status through the release status vocabulary', () => {
    const t = A().createTeam({ name: 'T', velocity: 20, members: [] });
    const r = A().createRelease({ name: 'Orion', startISO: '2026-04-13', teamId: t.id, connector: { type: 'jira', config: {} } });
    // Seed the release's vocabulary snapshot (normally written by syncRelease).
    useStore.setState({
      releases: getState().releases.map((rel) =>
        rel.id === r.id
          ? { ...rel, catalog: { itemTypes: [], statuses: [{ id: 'in_progress', label: 'Doing', category: 'In Progress' as const }] } }
          : rel,
      ),
    });
    const it1 = A().createItem(r.id, { workStreamId: null, sprintId: null, subject: 'S' })!;
    A().updateItem(it1.id, {
      externalId: 'EXT-1',
      status: 'Under Review',
      statusNative: { id: 'qa', label: 'QA Verify' },
      dirtyFields: ['status'],
      syncedValues: { status: 'in_progress' },
    });

    A().revertItem(it1.id);

    const reverted = getState().items.find((i) => i.id === it1.id)!;
    expect(reverted.dirtyFields).toEqual([]);
    expect(reverted.status).toBe('In Progress');
    expect(reverted.statusNative).toEqual({ id: 'in_progress', label: 'Doing' });
  });
});

describe('pushRelease', () => {
  // Create a connector release with one synced, points-dirty item.
  const setupDirty = (over: { dirtyFields?: string[]; itemType?: { id: string; label: string } } = {}) => {
    const r = A().createRelease({ name: 'Orion', startISO: '2026-04-13', teamId: 't1', connector: { type: 'jira', config: {} } });
    const it = A().createItem(r.id, { workStreamId: null, sprintId: null, subject: 'S', points: 13 })!;
    A().updateItem(it.id, {
      externalId: 'EXT-1',
      dirtyFields: over.dirtyFields ?? ['points'],
      syncedValues: { points: 5, sprint: null },
      ...(over.itemType ? { itemType: over.itemType } : {}),
    });
    return { r, itemId: it.id };
  };

  it("returns { ok: false, reason: 'no-connector' } for a local release", async () => {
    const t = A().createTeam({ name: 'T', velocity: 20, members: [] });
    const r = A().createRelease({ name: 'Orion', startISO: '2026-04-13', teamId: t.id });
    expect(await A().pushRelease(r.id)).toMatchObject({ ok: false, reason: 'no-connector' });
  });

  it("returns 'nothing-to-push' when no synced dirty items exist", async () => {
    client.listConnectors.mockResolvedValue([jiraMeta()]);
    const r = A().createRelease({ name: 'Orion', startISO: '2026-04-13', teamId: 't1', connector: { type: 'jira', config: {} } });
    A().createItem(r.id, { workStreamId: null, sprintId: null, subject: 'clean' });
    expect(await A().pushRelease(r.id)).toMatchObject({ ok: false, reason: 'nothing-to-push' });
    expect(client.push).not.toHaveBeenCalled();
  });

  it("returns 'nothing-to-push' when a dirty field is not writeable for the item's type", async () => {
    // A type where points is create-once (writeable:false); the item resolves to it.
    const sprintOnly: ConnectorItemType = {
      id: 'jira_story',
      label: 'Story',
      fields: [
        { key: 'sprint', kind: 'ref', target: 'sprint', writeable: true },
        { key: 'points', kind: 'number', role: 'points', writeable: false },
      ],
    };
    client.listConnectors.mockResolvedValue([jiraMeta({ itemTypes: [sprintOnly] })]);
    setupDirty({ dirtyFields: ['points'], itemType: { id: 'jira_story', label: 'Story' } });
    expect(await A().pushRelease(getState().releases[0].id)).toMatchObject({ ok: false, reason: 'nothing-to-push' });
    expect(client.push).not.toHaveBeenCalled();
  });

  it('pushes changes, clears dirtyFields, and advances the synced baseline on success', async () => {
    client.listConnectors.mockResolvedValue([jiraMeta()]);
    client.push.mockResolvedValue({ pushed: 1, failed: 0, errors: [] });
    const { itemId } = setupDirty();

    const out = await A().pushRelease(getState().releases[0].id);

    expect(out.ok).toBe(true);
    expect(client.push).toHaveBeenCalledOnce();
    const pushed = getState().items.find((i) => i.id === itemId)!;
    expect(pushed.dirtyFields).toEqual([]);
    expect(pushed.syncedValues).toEqual({ points: 13, sprint: null });
    expect(getState().releases[0].sync?.state).toBe('ok');
  });

  it("returns { ok: false, reason: 'error' } and records the error when push throws", async () => {
    client.listConnectors.mockResolvedValue([jiraMeta()]);
    client.push.mockRejectedValue(new Error('network down'));
    const { itemId } = setupDirty();

    const out = await A().pushRelease(getState().releases[0].id);

    expect(out).toMatchObject({ ok: false, reason: 'error', message: 'network down' });
    expect(getState().releases[0].sync?.state).toBe('error');
    // dirtyFields are left intact for retry.
    expect(getState().items.find((i) => i.id === itemId)?.dirtyFields).toEqual(['points']);
  });
});
