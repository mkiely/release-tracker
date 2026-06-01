import { describe, expect, it } from 'vitest';
import { applySync } from './applySync';
import { buildSprints } from '../lib/dates';
import type { AppState, Release, WorkItem } from '../types';
import type { MappedRelease } from './schema';

const baseRelease = (): Release => ({
  id: 'rel_1',
  name: 'Orion 2.0',
  startISO: '2026-04-13',
  teamId: 'team_1',
  workStreams: [],
  events: [],
  sprints: buildSprints('2026-04-13', {}),
  externalId: null,
  connector: { type: 'jira', config: {} },
  sync: null,
});

const baseState = (overrides: Partial<AppState> = {}): AppState => ({
  version: 2,
  teams: [],
  releases: [baseRelease()],
  items: [],
  meta: { lastSyncISO: null },
  ...overrides,
});

const mapped = (over: Partial<MappedRelease> = {}): MappedRelease => ({
  workStreams: [{ externalId: 'EPIC-A', fields: { name: 'Checkout API' } }],
  sprints: [{ externalId: 'JSPR-1', fields: { name: 'Sprint 1', startISO: '2026-04-13', endISO: '2026-04-26' } }],
  items: [
    { externalId: 'EXT-1', extWorkStreamId: 'EPIC-A', extSprintId: 'JSPR-1', fields: { key: 'EXT-1', subject: 'Tokenize vault', description: 'd', status: 'Active', points: 5 } },
  ],
  ...over,
});

describe('applySync — creation', () => {
  it('creates new work streams, links sprints, and creates items', () => {
    const { next, result } = applySync(baseState(), 'rel_1', mapped());
    const r = next.releases[0];

    expect(r.workStreams).toHaveLength(1);
    expect(r.workStreams[0]).toMatchObject({ name: 'Checkout API', externalId: 'EPIC-A' });
    // sprint linked onto slot 1 (chronologically first free slot)
    expect(r.sprints[0]).toMatchObject({ n: 1, externalId: 'JSPR-1', name: 'Sprint 1' });
    // dates stay owned by the fixed grid (option A) — not overwritten
    expect(r.sprints[0].startISO).toBe('2026-04-13');

    expect(next.items).toHaveLength(1);
    expect(next.items[0]).toMatchObject({
      releaseId: 'rel_1', externalId: 'EXT-1', key: 'EXT-1',
      workStreamId: r.workStreams[0].id, sprintN: 1, status: 'Active', points: 5,
    });
    expect(result).toMatchObject({ created: 2, updated: 0 }); // 1 ws + 1 item
  });
});

describe('applySync — external wins on re-sync', () => {
  it('overwrites matched item fields and placement, not its local id', () => {
    const first = applySync(baseState(), 'rel_1', mapped());
    const localId = first.next.items[0].id;

    const changed = mapped({
      items: [
        { externalId: 'EXT-1', extWorkStreamId: 'EPIC-A', extSprintId: 'JSPR-1', fields: { key: 'EXT-1', subject: 'Renamed', description: 'd2', status: 'Complete', points: 8 } },
      ],
    });
    const { next, result } = applySync(first.next, 'rel_1', changed);

    expect(next.items).toHaveLength(1);
    expect(next.items[0].id).toBe(localId); // stable local id
    expect(next.items[0]).toMatchObject({ subject: 'Renamed', status: 'Complete', points: 8 });
    expect(result).toMatchObject({ created: 0, updated: 2 }); // ws + item re-matched
  });

  it('matches the same work stream / sprint slot rather than duplicating', () => {
    const first = applySync(baseState(), 'rel_1', mapped());
    const { next } = applySync(first.next, 'rel_1', mapped());
    expect(next.releases[0].workStreams).toHaveLength(1);
    expect(next.releases[0].sprints.filter((s) => s.externalId === 'JSPR-1')).toHaveLength(1);
  });
});

describe('applySync — local-only entities are untouched', () => {
  it('never matches or modifies items with externalId === null', () => {
    const local: WorkItem = {
      id: 'it_local', releaseId: 'rel_1', workStreamId: 'ws_x', sprintN: 2,
      key: 'LOCAL-1', subject: 'Hand-entered', description: '', status: 'Not Started', points: 1, externalId: null,
    };
    const { next } = applySync(baseState({ items: [local] }), 'rel_1', mapped());
    const stillThere = next.items.find((i) => i.id === 'it_local');
    expect(stillThere).toEqual(local); // unchanged
    expect(next.items).toHaveLength(2); // local + one synced
  });
});

describe('applySync — reference resolution', () => {
  it('skips + warns an item whose work stream cannot be resolved', () => {
    const m = mapped({
      items: [
        { externalId: 'EXT-9', extWorkStreamId: 'EPIC-MISSING', extSprintId: 'JSPR-1', fields: { key: 'EXT-9', subject: 's', description: '', status: 'Active', points: 2 } },
      ],
    });
    const { next, result } = applySync(baseState(), 'rel_1', m);
    expect(next.items).toHaveLength(0);
    expect(result.skipped).toBe(1);
    expect(result.warnings.some((w) => w.includes('EXT-9'))).toBe(true);
  });

  it('places an item with an unresolved sprint into the backlog (sprintN 0)', () => {
    const m = mapped({
      items: [
        { externalId: 'EXT-2', extWorkStreamId: 'EPIC-A', extSprintId: 'JSPR-UNKNOWN', fields: { key: 'EXT-2', subject: 's', description: '', status: 'Active', points: 2 } },
      ],
    });
    const { next, result } = applySync(baseState(), 'rel_1', m);
    expect(next.items[0].sprintN).toBe(0);
    expect(result.warnings.some((w) => w.includes('backlog'))).toBe(true);
  });

  it('places an item with no external sprint into the backlog', () => {
    const m = mapped({
      items: [
        { externalId: 'EXT-3', extWorkStreamId: 'EPIC-A', extSprintId: null, fields: { key: 'EXT-3', subject: 's', description: '', status: 'Active', points: 2 } },
      ],
    });
    const { next } = applySync(baseState(), 'rel_1', m);
    expect(next.items[0].sprintN).toBe(0);
  });
});

describe('applySync — sprint linking', () => {
  it('links sprints onto free slots in chronological order', () => {
    const m = mapped({
      sprints: [
        // intentionally out of order; engine sorts by startISO
        { externalId: 'JSPR-2', fields: { name: 'S2', startISO: '2026-04-27', endISO: '2026-05-10' } },
        { externalId: 'JSPR-1', fields: { name: 'S1', startISO: '2026-04-13', endISO: '2026-04-26' } },
      ],
      items: [],
    });
    const { next } = applySync(baseState(), 'rel_1', m);
    expect(next.releases[0].sprints[0]).toMatchObject({ n: 1, externalId: 'JSPR-1' });
    expect(next.releases[0].sprints[1]).toMatchObject({ n: 2, externalId: 'JSPR-2' });
  });

  it('drops + warns external sprints beyond the 8-slot grid', () => {
    const sprints = Array.from({ length: 9 }, (_, i) => ({
      externalId: `JSPR-${i}`,
      fields: { name: `S${i}`, startISO: `2026-04-${String(13 + i).padStart(2, '0')}`, endISO: '2026-12-31' },
    }));
    const { result } = applySync(baseState(), 'rel_1', mapped({ sprints, items: [] }));
    expect(result.skipped).toBe(1);
    expect(result.warnings.some((w) => w.includes('No free sprint slot'))).toBe(true);
  });
});

describe('applySync — purity', () => {
  it('does not mutate the input state', () => {
    const state = baseState();
    const snapshot = JSON.stringify(state);
    applySync(state, 'rel_1', mapped());
    expect(JSON.stringify(state)).toBe(snapshot);
  });

  it('warns and no-ops for an unknown release', () => {
    const { next, result } = applySync(baseState(), 'nope', mapped());
    expect(next.items).toHaveLength(0);
    expect(result.warnings[0]).toContain('not found');
  });
});
