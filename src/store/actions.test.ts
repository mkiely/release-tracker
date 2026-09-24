// @vitest-environment jsdom
//
// Store-action tests — the functions every UI interaction flows through.
// Implements docs/store-actions-test-plan.md. Runs in jsdom because the store
// singleton's load()/persist() touch localStorage, and syncRelease dispatches a
// window CustomEvent. The async sync/push actions mock the syncClient seam.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SCHEMA_VERSION } from '../types';
import { anItem, aSyncedItem } from '../test/factories';
import type { WorkItem } from '../types';
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
      createItem: vi.fn(),
    },
  };
});

import { getActions, getState, selDirtyCount, useStore } from './store';
import { SyncValidationError, syncClient } from '../sync/client';

const client = syncClient as unknown as {
  listConnectors: ReturnType<typeof vi.fn>;
  validate: ReturnType<typeof vi.fn>;
  sync: ReturnType<typeof vi.fn>;
  push: ReturnType<typeof vi.fn>;
  createItem: ReturnType<typeof vi.fn>;
};

const A = getActions; // shorthand: A() → the live actions object

// Default item type: points + sprint are writeable (matches legacy behavior).
const STORY_TYPE: ConnectorItemType = {
  id: 'acme_story',
  label: 'Story',
  fields: [
    { key: 'points', kind: 'number', role: 'points', writeable: true },
    { key: 'sprint', kind: 'ref', target: 'sprint', writeable: true },
  ],
};

// A connector meta whose item catalog makes points + sprint writeable.
const acmeMeta = (over: Record<string, unknown> = {}) => ({
  type: 'acme',
  label: 'Acme',
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
    const r = A().createRelease({ name: 'Orion', startISO: '2026-04-13', teamId: 't1', connector: { type: 'acme', config: {} } });
    expect(r.sprints).toEqual([]);
    expect(r.connector).toEqual({ type: 'acme', config: {} });
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
    expect(it!.points).toBeNull();
  });

  it('returns null for an unknown release id', () => {
    expect(A().createItem('nope', { workStreamId: null, sprintId: null, subject: 'S' })).toBeNull();
  });

  it('stamps createdISO and updatedISO', () => {
    const r = setup();
    const before = Date.now();
    const it = A().createItem(r.id, { workStreamId: null, sprintId: null, subject: 'S' })!;
    expect(Date.parse(it.createdISO!)).toBeGreaterThanOrEqual(before);
    expect(it.updatedISO).toBe(it.createdISO);
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
    expect(getState().items.find((i) => i.id === b.id)?.points).toBeNull();
  });

  it('bumps updatedISO on a local item', () => {
    useStore.setState({ items: [anItem({ id: 'it_1', updatedISO: '2020-01-01T00:00:00.000Z' })] });
    A().updateItem('it_1', { points: 8 });
    expect(getState().items[0].updatedISO).not.toBe('2020-01-01T00:00:00.000Z');
  });

  // On a synced item the timestamps are the backend's; a pending local edit must
  // not invent a modification the connector never recorded.
  it('leaves updatedISO alone on a synced item', () => {
    useStore.setState({ items: [aSyncedItem({ id: 'it_1', updatedISO: '2026-07-01T09:00:00.000Z' })] });
    A().updateItem('it_1', { points: 8 });
    expect(getState().items[0].updatedISO).toBe('2026-07-01T09:00:00.000Z');
  });

  it('lets an explicit updatedISO in the patch win', () => {
    useStore.setState({ items: [anItem({ id: 'it_1', updatedISO: '2020-01-01T00:00:00.000Z' })] });
    A().updateItem('it_1', { updatedISO: '2026-07-30T12:00:00.000Z' });
    expect(getState().items[0].updatedISO).toBe('2026-07-30T12:00:00.000Z');
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
    client.listConnectors.mockResolvedValue([acmeMeta()]);
    client.sync.mockResolvedValue(mappedRelease());
    const r = A().createRelease({ name: 'Orion', startISO: '2026-04-13', teamId: 't1', connector: { type: 'acme', config: {} } });

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

  it('snapshots the full connector vocabulary onto the release catalog', async () => {
    const streamFields = [{ key: 'track', label: 'Track', kind: 'enum' as const, filterable: true, options: [{ value: 'product', label: 'Product' }] }];
    client.listConnectors.mockResolvedValue([acmeMeta({ workStreamFields: streamFields })]);
    client.sync.mockResolvedValue(mappedRelease());
    const r = A().createRelease({ name: 'Orion', startISO: '2026-04-13', teamId: 't1', connector: { type: 'acme', config: {} } });

    await A().syncRelease(r.id);

    const catalog = getState().releases[0].catalog;
    expect(catalog?.itemTypes).toEqual([STORY_TYPE]);
    expect(catalog?.statuses).toEqual([]);
    expect(catalog?.workStreamFields).toEqual(streamFields);
  });

  it("returns { ok: false, reason: 'error' } and records the error when sync throws", async () => {
    client.listConnectors.mockResolvedValue([acmeMeta()]);
    client.sync.mockRejectedValue(new Error('boom'));
    const r = A().createRelease({ name: 'Orion', startISO: '2026-04-13', teamId: 't1', connector: { type: 'acme', config: {} } });

    const out = await A().syncRelease(r.id);

    expect(out).toMatchObject({ ok: false, reason: 'error', message: 'boom' });
    expect(getState().releases[0].sync?.state).toBe('error');
  });
});

describe('revertItem', () => {
  it('restores dirty fields — including attributes — to the synced baseline', () => {
    const t = A().createTeam({ name: 'T', velocity: 20, members: [] });
    const r = A().createRelease({ name: 'Orion', startISO: '2026-04-13', teamId: t.id, connector: { type: 'acme', config: {} } });
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
    const r = A().createRelease({ name: 'Orion', startISO: '2026-04-13', teamId: t.id, connector: { type: 'acme', config: {} } });
    // Seed the release's vocabulary snapshot (normally written by syncRelease).
    useStore.setState({
      releases: getState().releases.map((rel) =>
        rel.id === r.id
          ? { ...rel, catalog: { itemTypes: [], statuses: [{ id: 'in_progress', label: 'Doing', category: 'In Progress' as const }], workStreamFields: [] } }
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

  it('restores a dirty sprint to the baseline', () => {
    const t = A().createTeam({ name: 'T', velocity: 20, members: [] });
    const r = A().createRelease({ name: 'Orion', startISO: '2026-04-13', teamId: t.id, connector: { type: 'acme', config: {} } });
    // A connector release has no sprints until it syncs; revert copies the baseline
    // value across without resolving it, so a bare id is enough here.
    const it1 = A().createItem(r.id, { workStreamId: null, sprintId: null, subject: 'S' })!;
    A().updateItem(it1.id, {
      externalId: 'EXT-1',
      sprintId: null,
      dirtyFields: ['sprint'],
      syncedValues: { points: null, sprint: 'sp_baseline' },
    });

    A().revertItem(it1.id);

    const reverted = getState().items.find((i) => i.id === it1.id)!;
    expect(reverted.sprintId).toBe('sp_baseline');
    expect(reverted.dirtyFields).toEqual([]);
  });

  // A field the baseline can't speak for keeps its local value — so it has to keep
  // its dirty mark too, or the edit survives while becoming unpushable and invisible
  // to the push review.
  it('leaves a field with no baseline dirty, and reverts the rest', () => {
    const t = A().createTeam({ name: 'T', velocity: 20, members: [] });
    const r = A().createRelease({ name: 'Orion', startISO: '2026-04-13', teamId: t.id, connector: { type: 'acme', config: {} } });
    const it1 = A().createItem(r.id, { workStreamId: null, sprintId: null, subject: 'S', points: 8 })!;
    A().updateItem(it1.id, {
      externalId: 'EXT-1',
      attributes: { severity: 'critical' },
      dirtyFields: ['points', 'severity'],
      syncedValues: { points: 5 }, // severity has no baseline
    });

    A().revertItem(it1.id);

    const reverted = getState().items.find((i) => i.id === it1.id)!;
    expect(reverted.points).toBe(5);
    expect(reverted.attributes).toEqual({ severity: 'critical' });
    expect(reverted.dirtyFields).toEqual(['severity']);
  });
});

describe('pushRelease', () => {
  // Create a connector release with one synced, points-dirty item.
  const setupDirty = (over: { dirtyFields?: string[]; itemType?: { id: string; label: string } } = {}) => {
    const r = A().createRelease({ name: 'Orion', startISO: '2026-04-13', teamId: 't1', connector: { type: 'acme', config: {} } });
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
    client.listConnectors.mockResolvedValue([acmeMeta()]);
    const r = A().createRelease({ name: 'Orion', startISO: '2026-04-13', teamId: 't1', connector: { type: 'acme', config: {} } });
    A().createItem(r.id, { workStreamId: null, sprintId: null, subject: 'clean' });
    expect(await A().pushRelease(r.id)).toMatchObject({ ok: false, reason: 'nothing-to-push' });
    expect(client.push).not.toHaveBeenCalled();
  });

  it("returns 'nothing-to-push' when a dirty field is not writeable for the item's type", async () => {
    // A type where points is create-once (writeable:false); the item resolves to it.
    const sprintOnly: ConnectorItemType = {
      id: 'acme_story',
      label: 'Story',
      fields: [
        { key: 'sprint', kind: 'ref', target: 'sprint', writeable: true },
        { key: 'points', kind: 'number', role: 'points', writeable: false },
      ],
    };
    client.listConnectors.mockResolvedValue([acmeMeta({ itemTypes: [sprintOnly] })]);
    setupDirty({ dirtyFields: ['points'], itemType: { id: 'acme_story', label: 'Story' } });
    expect(await A().pushRelease(getState().releases[0].id)).toMatchObject({ ok: false, reason: 'nothing-to-push' });
    expect(client.push).not.toHaveBeenCalled();
  });

  it('pushes changes, clears dirtyFields, and advances the synced baseline on success', async () => {
    client.listConnectors.mockResolvedValue([acmeMeta()]);
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

  // A push is not all-or-nothing. These pin the two halves the old string[] shape
  // could not express: which item failed, and that the ones that DIDN'T fail are
  // the only ones allowed to be marked clean.
  it('reports a partial failure as ok-with-failures, not as a plain success', async () => {
    client.listConnectors.mockResolvedValue([acmeMeta()]);
    client.push.mockResolvedValue({
      pushed: 0,
      failed: 1,
      errors: [{ externalId: 'EXT-1', message: 'Sprint is locked on a closed ticket', fieldErrors: [{ field: 'sprint', message: 'Ticket is closed' }] }],
    });
    const { itemId } = setupDirty();

    const out = await A().pushRelease(getState().releases[0].id);

    // Nothing landed at all, so this one is an outright failure — but it carries
    // the attribution rather than a joined string.
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.failures).toHaveLength(1);
      expect(out.failures![0]).toMatchObject({ itemId, kind: 'update', message: 'Sprint is locked on a closed ticket' });
      expect(out.failures![0].fieldErrors).toEqual([{ field: 'sprint', message: 'Ticket is closed' }]);
    }
  });

  it('leaves a FAILED item dirty while clearing the ones that landed', async () => {
    // The bug this shape exists to fix: dirtyFields used to be cleared for every
    // item in the batch, so a partial failure marked unlanded edits clean and the
    // user silently lost them.
    client.listConnectors.mockResolvedValue([acmeMeta()]);
    const r = A().createRelease({ name: 'Orion', startISO: '2026-04-13', teamId: 't1', connector: { type: 'acme', config: {} } });
    const good = A().createItem(r.id, { workStreamId: null, sprintId: null, subject: 'lands', points: 8 })!;
    const bad = A().createItem(r.id, { workStreamId: null, sprintId: null, subject: 'rejected', points: 13 })!;
    A().updateItem(good.id, { externalId: 'EXT-OK', dirtyFields: ['points'], syncedValues: { points: 1, sprint: null } });
    A().updateItem(bad.id, { externalId: 'EXT-BAD', dirtyFields: ['points'], syncedValues: { points: 2, sprint: null } });

    client.push.mockResolvedValue({
      pushed: 1,
      failed: 1,
      errors: [{ externalId: 'EXT-BAD', message: 'Estimate exceeds the cap' }],
    });

    const out = await A().pushRelease(r.id);

    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.result.pushed).toBe(1);
      expect(out.result.failures.map((f) => f.itemId)).toEqual([bad.id]);
    }
    expect(getState().items.find((i) => i.id === good.id)!.dirtyFields).toEqual([]);
    expect(getState().items.find((i) => i.id === bad.id)!.dirtyFields).toEqual(['points']);
  });

  it('records the failure on the item and clears it once a later push succeeds', async () => {
    client.listConnectors.mockResolvedValue([acmeMeta()]);
    client.push.mockResolvedValue({ pushed: 0, failed: 1, errors: [{ externalId: 'EXT-1', message: 'Rejected' }] });
    const { r, itemId } = setupDirty();

    await A().pushRelease(r.id);
    // Durable: this is a state the item is in, not a toast that has gone.
    expect(getState().items.find((i) => i.id === itemId)!.lastPushError).toMatchObject({ message: 'Rejected', kind: 'update' });

    client.push.mockResolvedValue({ pushed: 1, failed: 0, errors: [] });
    await A().pushRelease(r.id);
    expect(getState().items.find((i) => i.id === itemId)!.lastPushError).toBeNull();
  });

  it("returns { ok: false, reason: 'error' } and records the error when push throws", async () => {
    client.listConnectors.mockResolvedValue([acmeMeta()]);
    client.push.mockRejectedValue(new Error('network down'));
    const { itemId } = setupDirty();

    const out = await A().pushRelease(getState().releases[0].id);

    expect(out).toMatchObject({ ok: false, reason: 'error', message: 'network down' });
    expect(getState().releases[0].sync?.state).toBe('error');
    // dirtyFields are left intact for retry.
    expect(getState().items.find((i) => i.id === itemId)?.dirtyFields).toEqual(['points']);
  });
});

// A creatable Story type: subject + points are creatable, plus the sprint ref.
const creatableStory: ConnectorItemType = {
  id: 'acme_story',
  label: 'Story',
  fields: [
    { key: 'subject', kind: 'string', role: 'subject', creatable: true },
    { key: 'points', kind: 'number', role: 'points', creatable: true },
    { key: 'sprint', kind: 'ref', target: 'sprint', creatable: true },
  ],
};

const draft = (over: Record<string, unknown> = {}) => ({
  itemType: { id: 'acme_story', label: 'Story' },
  workStreamId: null,
  sprintId: null,
  assignedMemberId: null,
  subject: 'New thing',
  description: '',
  descriptionFormat: 'text' as const,
  status: 'Not Started' as const,
  points: 5,
  attributes: {},
  ...over,
});

describe('createConnectorItem (queue for push)', () => {
  const connectorRelease = () =>
    A().createRelease({ name: 'Orion', startISO: '2026-04-13', teamId: 't1', connector: { type: 'acme', config: {} } });

  it('creates a local pendingCreate item without hitting the network', () => {
    const r = connectorRelease();
    const it = A().createConnectorItem(r.id, draft())!;
    expect(it).not.toBeNull();
    expect(it.pendingCreate).toBe(true);
    expect(it.externalId).toBeNull();
    expect(it.subject).toBe('New thing');
    expect(client.createItem).not.toHaveBeenCalled();
    expect(getState().items).toHaveLength(1);
  });

  it('counts pending creates in the release dirty count', () => {
    const r = connectorRelease();
    A().createConnectorItem(r.id, draft());
    expect(selDirtyCount(getState(), r.id)).toBe(1);
  });

  it('returns null for a local (non-connector) release', () => {
    const t = A().createTeam({ name: 'T', velocity: 20, members: [] });
    const r = A().createRelease({ name: 'Local', startISO: '2026-04-13', teamId: t.id });
    expect(A().createConnectorItem(r.id, draft())).toBeNull();
  });

  it('discardPendingCreate removes a queued item; leaves already-created items alone', () => {
    const r = connectorRelease();
    const it = A().createConnectorItem(r.id, draft())!;
    A().discardPendingCreate(it.id);
    expect(getState().items).toHaveLength(0);
    // A synced (non-pending) item is untouched by discard.
    const synced = A().createItem(r.id, { workStreamId: null, sprintId: null, subject: 'S' })!;
    A().updateItem(synced.id, { externalId: 'EXT-9', pendingCreate: false });
    A().discardPendingCreate(synced.id);
    expect(getState().items.find((i) => i.id === synced.id)).toBeDefined();
  });
});

describe('setAutoSync', () => {
  it('sets and clears the release auto-sync cadence', () => {
    const r = A().createRelease({ name: 'Orion', startISO: '2026-04-13', teamId: 't1', connector: { type: 'acme', config: {} } });
    A().setAutoSync(r.id, 30);
    expect(getState().releases[0].autoSyncMinutes).toBe(30);
    A().setAutoSync(r.id, 0); // 0 turns it off
    expect(getState().releases[0].autoSyncMinutes).toBeNull();
    A().setAutoSync(r.id, 60);
    expect(getState().releases[0].autoSyncMinutes).toBe(60);
    A().setAutoSync(r.id, null);
    expect(getState().releases[0].autoSyncMinutes).toBeNull();
  });
});

describe('forgetItem', () => {
  const releaseWithTwo = () => {
    const t = A().createTeam({ name: 'T', velocity: 20, members: [] });
    const r = A().createRelease({ name: 'Orion', startISO: '2026-04-13', teamId: t.id, connector: { type: 'acme', config: {} } });
    const keep = A().createItem(r.id, { workStreamId: null, sprintId: null, subject: 'keep' })!;
    const drop = A().createItem(r.id, { workStreamId: null, sprintId: null, subject: 'drop' })!;
    return { r, keep, drop };
  };

  it('removes only the named item', () => {
    const { keep, drop } = releaseWithTwo();
    A().forgetItem(drop.id);
    const left = getState().items;
    expect(left).toHaveLength(1);
    expect(left[0].id).toBe(keep.id);
  });

  it('removes a synced item along with its pending edits', () => {
    const { drop } = releaseWithTwo();
    A().updateItem(drop.id, { externalId: 'EXT-1', dirtyFields: ['points'], syncedValues: { points: 5 } });
    A().forgetItem(drop.id);
    expect(getState().items.find((i) => i.id === drop.id)).toBeUndefined();
  });

  // Forgetting is local-only: the sync contract has no delete, so nothing may be
  // left behind that a later push could interpret as one.
  it('queues nothing for push', async () => {
    client.listConnectors.mockResolvedValue([acmeMeta()]);
    const { r, drop } = releaseWithTwo();
    A().updateItem(drop.id, { externalId: 'EXT-1', dirtyFields: ['points'], syncedValues: { points: 5 } });
    A().forgetItem(drop.id);
    expect(await A().pushRelease(r.id)).toMatchObject({ ok: false, reason: 'nothing-to-push' });
    expect(client.push).not.toHaveBeenCalled();
  });

  it('is a no-op for an unknown id', () => {
    releaseWithTwo();
    A().forgetItem('nope');
    expect(getState().items).toHaveLength(2);
  });
});

describe('pushRelease (flush queued creates)', () => {
  const connectorRelease = () =>
    A().createRelease({ name: 'Orion', startISO: '2026-04-13', teamId: 't1', connector: { type: 'acme', config: {} } });

  const createdMapped = (over: Record<string, unknown> = {}) => ({
    externalId: 'EXT-900', extWorkStreamId: null, extSprintId: null, extAssigneeId: null,
    fields: { key: 'ORI-900', subject: 'New thing', description: '', status: 'Not Started', points: 5, itemType: { id: 'acme_story', label: 'Story' } },
    ...over,
  });

  it('sends each queued create and reconciles it into a synced item', async () => {
    client.listConnectors.mockResolvedValue([acmeMeta({ itemTypes: [creatableStory] })]);
    client.createItem.mockResolvedValue(createdMapped());
    const r = connectorRelease();
    A().createConnectorItem(r.id, draft());

    const out = await A().pushRelease(r.id);

    expect(out.ok).toBe(true);
    expect(client.createItem).toHaveBeenCalledOnce();
    const items = getState().items;
    expect(items).toHaveLength(1);
    // The placeholder is gone; the reconciled item is a real synced item.
    expect(items[0].pendingCreate).toBeFalsy();
    expect(items[0].externalId).toBe('EXT-900');
    expect(items[0].key).toBe('ORI-900');
    expect(selDirtyCount(getState(), r.id)).toBe(0);
  });

  it("preserves a 422's field errors instead of flattening them into prose", async () => {
    // The whole point of the create path's structured errors: the service already
    // said WHICH field it rejected, and that attribution used to be thrown away at
    // the catch, leaving the user with "Acme rejected the new item (1 field error)".
    client.listConnectors.mockResolvedValue([acmeMeta({ itemTypes: [creatableStory] })]);
    client.createItem.mockRejectedValue(
      new SyncValidationError('Acme rejected the new item', [
        { field: 'description', message: 'Critical bugs require reproduction steps' },
      ]),
    );
    const r = connectorRelease();
    A().createConnectorItem(r.id, draft());

    const out = await A().pushRelease(r.id);

    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.failures![0]).toMatchObject({ kind: 'create', message: 'Acme rejected the new item' });
      expect(out.failures![0].fieldErrors).toEqual([
        { field: 'description', message: 'Critical bugs require reproduction steps' },
      ]);
    }
    // And it is on the item, so the form can mark the field after a reload.
    expect(getState().items[0].lastPushError?.fieldErrors).toHaveLength(1);
  });

  it('leaves the queued item in place and reports an error when the create fails', async () => {
    client.listConnectors.mockResolvedValue([acmeMeta({ itemTypes: [creatableStory] })]);
    client.createItem.mockRejectedValue(new Error('422 bad field'));
    const r = connectorRelease();
    A().createConnectorItem(r.id, draft());

    const out = await A().pushRelease(r.id);

    expect(out).toMatchObject({ ok: false, reason: 'error' });
    const items = getState().items;
    expect(items).toHaveLength(1);
    expect(items[0].pendingCreate).toBe(true); // still queued for retry
    expect(getState().releases[0].sync?.state).toBe('error');
  });
});

// ── moveItemToSprint ──────────────────────────────────────────────────────
// The drag-and-drop path. Its whole subtlety is the dirty flag: a move is only
// pushable while the item sits somewhere other than its synced baseline, so
// dragging an item away and back must leave it clean.

const movable = (over: Partial<WorkItem>): WorkItem =>
  aSyncedItem({ id: 'it_1', workStreamId: 'ws_1', sprintId: 'sp_1', points: 5, ...over });

describe('moveItemToSprint', () => {
  const setItems = (...items: WorkItem[]) => useStore.setState({ items });
  const got = (id = 'it_1') => getState().items.find((i) => i.id === id)!;

  beforeEach(() => setItems());

  it('is a no-op when the sprint is unchanged', () => {
    setItems(movable({ sprintId: 'sp_1', dirtyFields: [] }));
    A().moveItemToSprint('it_1', 'sp_1');
    expect(got().sprintId).toBe('sp_1');
    expect(got().dirtyFields).toEqual([]);
  });

  it('moves a local item without marking it dirty', () => {
    setItems(movable({ externalId: null, syncedValues: null, dirtyFields: [] }));
    A().moveItemToSprint('it_1', 'sp_2');
    expect(got().sprintId).toBe('sp_2');
    expect(got().dirtyFields).toEqual([]);
  });

  it('marks a synced item sprint-dirty when moved away from the baseline', () => {
    setItems(movable({ sprintId: 'sp_1', syncedValues: { points: 5, sprint: 'sp_1' } }));
    A().moveItemToSprint('it_1', 'sp_2');
    expect(got().sprintId).toBe('sp_2');
    expect(got().dirtyFields).toContain('sprint');
  });

  it('clears the sprint dirty flag when moved back to the synced sprint', () => {
    setItems(movable({ sprintId: 'sp_2', dirtyFields: ['sprint'], syncedValues: { points: 5, sprint: 'sp_1' } }));
    A().moveItemToSprint('it_1', 'sp_1');
    expect(got().sprintId).toBe('sp_1');
    expect(got().dirtyFields).not.toContain('sprint');
  });

  it('treats backlog (null) as a sprint value relative to the baseline', () => {
    setItems(movable({ sprintId: 'sp_1', syncedValues: { points: 5, sprint: null } }));
    A().moveItemToSprint('it_1', null);
    expect(got().sprintId).toBeNull();
    expect(got().dirtyFields).not.toContain('sprint');
  });

  it('preserves an existing points dirty flag when toggling sprint', () => {
    setItems(movable({ sprintId: 'sp_1', dirtyFields: ['points'], syncedValues: { points: 8, sprint: 'sp_1' } }));
    A().moveItemToSprint('it_1', 'sp_2');
    expect(got().dirtyFields).toEqual(['points', 'sprint']);
    A().moveItemToSprint('it_1', 'sp_1');
    expect(got().dirtyFields).toEqual(['points']);
  });

  it('does not mark a synced item dirty when it has no baseline', () => {
    setItems(movable({ sprintId: 'sp_1', syncedValues: null }));
    A().moveItemToSprint('it_1', 'sp_2');
    expect(got().sprintId).toBe('sp_2');
    expect(got().dirtyFields).toEqual([]);
  });
});
