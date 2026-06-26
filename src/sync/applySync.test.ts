import { describe, expect, it } from 'vitest';
import { applySync } from './applySync';
import { buildSprints } from '../lib/dates';
import { SCHEMA_VERSION } from '../types';
import type { AppState, Release, WorkItem } from '../types';
import type { MappedRelease } from './schema';

// A connector release starts with NO sprints — the external system supplies them.
const baseRelease = (): Release => ({
  id: 'rel_1',
  name: 'Orion 2.0',
  startISO: '2026-04-13',
  teamId: 'team_1',
  workStreams: [],
  events: [],
  sprints: [],
  externalId: null,
  connector: { type: 'acme', config: {} },
  sync: null,
  sprintLengthDays: 14,
});

// A local release keeps the fixed grid and never creates sprints from a sync.
const localRelease = (): Release => ({
  ...baseRelease(),
  connector: null,
  sprints: buildSprints('2026-04-13', {}),
});

const baseState = (overrides: Partial<AppState> = {}): AppState => ({
  version: SCHEMA_VERSION,
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
    { externalId: 'EXT-1', extWorkStreamId: 'EPIC-A', extSprintId: 'JSPR-1', extAssigneeId: null, fields: { key: 'EXT-1', subject: 'Tokenize vault', description: 'd', status: 'In Progress', points: 5 } },
  ],
  ...over,
});

describe('applySync — connector release creates sprints', () => {
  it('creates work streams, sprints (with external dates), and items', () => {
    const { next, result } = applySync(baseState(), 'rel_1', mapped());
    const r = next.releases[0];

    expect(r.workStreams).toHaveLength(1);
    expect(r.workStreams[0]).toMatchObject({ name: 'Checkout API', externalId: 'EPIC-A' });

    // sprint created on demand; the external system owns its dates; daysOff is app-owned
    expect(r.sprints).toHaveLength(1);
    expect(r.sprints[0]).toMatchObject({
      externalId: 'JSPR-1', name: 'Sprint 1', startISO: '2026-04-13', endISO: '2026-04-26', daysOff: 0,
    });

    expect(next.items).toHaveLength(1);
    expect(next.items[0]).toMatchObject({
      releaseId: 'rel_1', externalId: 'EXT-1', key: 'EXT-1',
      workStreamId: r.workStreams[0].id, sprintId: r.sprints[0].id, status: 'In Progress', points: 5,
      assignedMemberId: null, dirtyFields: [],
    });
    expect(result).toMatchObject({ created: 3, updated: 0 }); // 1 ws + 1 sprint + 1 item
  });

  it('creates incoming sprints in chronological order regardless of input order', () => {
    const m = mapped({
      sprints: [
        // intentionally out of order; engine sorts by startISO
        { externalId: 'JSPR-2', fields: { name: 'S2', startISO: '2026-04-27', endISO: '2026-05-10' } },
        { externalId: 'JSPR-1', fields: { name: 'S1', startISO: '2026-04-13', endISO: '2026-04-26' } },
      ],
      items: [],
    });
    const { next, result } = applySync(baseState(), 'rel_1', m);
    expect(next.releases[0].sprints.map((s) => s.externalId)).toEqual(['JSPR-1', 'JSPR-2']);
    expect(result.created).toBe(3); // 1 ws + 2 sprints
  });
});

describe('applySync — external wins on re-sync', () => {
  it('overwrites matched item fields and placement, not its local id', () => {
    const first = applySync(baseState(), 'rel_1', mapped());
    const localId = first.next.items[0].id;

    const changed = mapped({
      items: [
        { externalId: 'EXT-1', extWorkStreamId: 'EPIC-A', extSprintId: 'JSPR-1', extAssigneeId: null, fields: { key: 'EXT-1', subject: 'Renamed', description: 'd2', status: 'Complete', points: 8 } },
      ],
    });
    const { next, result } = applySync(first.next, 'rel_1', changed);

    expect(next.items).toHaveLength(1);
    expect(next.items[0].id).toBe(localId); // stable local id
    expect(next.items[0]).toMatchObject({ subject: 'Renamed', status: 'Complete', points: 8 });
    expect(result).toMatchObject({ created: 0, updated: 1, unchanged: 1 }); // item changed; ws re-matched but identical
  });

  it('treats null points from the connector as null (unestimated)', () => {
    const nullPoints = mapped({
      items: [
        { externalId: 'EXT-1', extWorkStreamId: 'EPIC-A', extSprintId: 'JSPR-1', extAssigneeId: null, fields: { key: 'EXT-1', subject: 'Tokenize vault', description: 'd', status: 'In Progress', points: null } },
      ],
    });
    const { next } = applySync(baseState(), 'rel_1', nullPoints);
    expect(next.items[0].points).toBeNull();
  });

  it('preserves a locally-dirty writeable description across re-sync (external wins on the rest)', () => {
    const first = applySync(baseState(), 'rel_1', mapped());
    // Locally edit the description and mark it dirty (as the detail modal would).
    const dirtied = {
      ...first.next,
      items: first.next.items.map((i) =>
        i.externalId === 'EXT-1' ? { ...i, description: '<p>Local edit</p>', dirtyFields: ['description'] } : i,
      ),
    };

    const changed = mapped({
      items: [
        { externalId: 'EXT-1', extWorkStreamId: 'EPIC-A', extSprintId: 'JSPR-1', extAssigneeId: null, fields: { key: 'EXT-1', subject: 'Renamed', description: '<p>External body</p>', status: 'Complete', points: 8 } },
      ],
    });
    // description is writeable for this connector, so a pending push must survive.
    const { next } = applySync(dirtied, 'rel_1', changed, ['description']);
    const item = next.items.find((i) => i.externalId === 'EXT-1')!;

    expect(item.description).toBe('<p>Local edit</p>'); // dirty local value preserved
    expect(item.dirtyFields).toContain('description');
    expect(item.subject).toBe('Renamed'); // non-dirty field still takes external
    expect(item.syncedValues?.description).toBe('<p>External body</p>'); // baseline advances to incoming
  });

  it('updates the dates of an already-linked sprint on the next sync', () => {
    const first = applySync(baseState(), 'rel_1', mapped());
    const sprintId = first.next.releases[0].sprints[0].id;

    const changed = mapped({
      sprints: [{ externalId: 'JSPR-1', fields: { name: 'Sprint 1 (shifted)', startISO: '2026-04-20', endISO: '2026-05-03' } }],
      items: [],
    });
    const { next } = applySync(first.next, 'rel_1', changed);

    expect(next.releases[0].sprints).toHaveLength(1); // re-linked, not duplicated
    expect(next.releases[0].sprints[0]).toMatchObject({
      id: sprintId, name: 'Sprint 1 (shifted)', startISO: '2026-04-20', endISO: '2026-05-03',
    });
  });

  it('preserves app-owned daysOff on a synced sprint across re-sync', () => {
    const first = applySync(baseState(), 'rel_1', mapped());
    first.next.releases[0].sprints[0].daysOff = 4; // user adjusts local holidays
    const { next } = applySync(first.next, 'rel_1', mapped());
    expect(next.releases[0].sprints[0].daysOff).toBe(4);
  });

  it('defaults engineersRequired to null on create and preserves it across re-sync', () => {
    const first = applySync(baseState(), 'rel_1', mapped());
    expect(first.next.releases[0].workStreams[0].engineersRequired).toBeNull();
    first.next.releases[0].workStreams[0].engineersRequired = 3; // user enriches the stream
    const { next } = applySync(first.next, 'rel_1', mapped({
      workStreams: [{ externalId: 'EPIC-A', fields: { name: 'Checkout API (renamed)' } }],
    }));
    expect(next.releases[0].workStreams[0].name).toBe('Checkout API (renamed)'); // external wins on name
    expect(next.releases[0].workStreams[0].engineersRequired).toBe(3); // app-owned enrichment survives
  });

  it('defaults work stream build to null on create, then external wins on re-sync', () => {
    const first = applySync(baseState(), 'rel_1', mapped());
    expect(first.next.releases[0].workStreams[0].build).toBeNull(); // native by default
    first.next.releases[0].workStreams[0].engineersRequired = 2; // user enrichment
    const { next } = applySync(first.next, 'rel_1', mapped({
      workStreams: [{ externalId: 'EPIC-A', fields: { name: 'Checkout API', build: 'Orion 1.5' } }],
    }));
    expect(next.releases[0].workStreams[0].build).toBe('Orion 1.5'); // connector-owned: external wins
    expect(next.releases[0].workStreams[0].engineersRequired).toBe(2); // app-owned still survives
  });

  it('matches the same work stream / sprint rather than duplicating', () => {
    const first = applySync(baseState(), 'rel_1', mapped());
    const { next } = applySync(first.next, 'rel_1', mapped());
    expect(next.releases[0].workStreams).toHaveLength(1);
    expect(next.releases[0].sprints.filter((s) => s.externalId === 'JSPR-1')).toHaveLength(1);
  });
});

describe('applySync — local-only entities are untouched', () => {
  it('never matches or modifies items with externalId === null', () => {
    const local: WorkItem = {
      id: 'it_local', releaseId: 'rel_1', workStreamId: 'ws_x', sprintId: 'sp_x',
      key: 'LOCAL-1', subject: 'Hand-entered', description: '', status: 'Not Started', points: 1, externalId: null,
      assignedMemberId: null, build: null, externalUrl: null, dirtyFields: [], itemType: null,
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
        { externalId: 'EXT-9', extWorkStreamId: 'EPIC-MISSING', extSprintId: 'JSPR-1', extAssigneeId: null, fields: { key: 'EXT-9', subject: 's', description: '', status: 'In Progress', points: 2 } },
      ],
    });
    const { next, result } = applySync(baseState(), 'rel_1', m);
    expect(next.items).toHaveLength(0);
    expect(result.skipped).toBe(1);
    expect(result.warnings.some((w) => w.includes('EXT-9'))).toBe(true);
  });

  it('accepts an item with extWorkStreamId null as unassigned (workStreamId null)', () => {
    const m = mapped({
      items: [
        { externalId: 'EXT-U', extWorkStreamId: null, extSprintId: 'JSPR-1', extAssigneeId: null, fields: { key: 'EXT-U', subject: 'unassigned item', description: '', status: 'Not Started', points: 1 } },
      ],
    });
    const { next, result } = applySync(baseState(), 'rel_1', m);
    expect(next.items).toHaveLength(1);
    expect(next.items[0].workStreamId).toBeNull();
    expect(result.skipped).toBe(0);
  });

  it('places an item with an unresolved sprint into the backlog (sprintId null)', () => {
    const m = mapped({
      items: [
        { externalId: 'EXT-2', extWorkStreamId: 'EPIC-A', extSprintId: 'JSPR-UNKNOWN', extAssigneeId: null, fields: { key: 'EXT-2', subject: 's', description: '', status: 'In Progress', points: 2 } },
      ],
    });
    const { next, result } = applySync(baseState(), 'rel_1', m);
    expect(next.items[0].sprintId).toBeNull();
    expect(result.warnings.some((w) => w.includes('backlog'))).toBe(true);
  });

  it('places an item with no external sprint into the backlog', () => {
    const m = mapped({
      items: [
        { externalId: 'EXT-3', extWorkStreamId: 'EPIC-A', extSprintId: null, extAssigneeId: null, fields: { key: 'EXT-3', subject: 's', description: '', status: 'In Progress', points: 2 } },
      ],
    });
    const { next } = applySync(baseState(), 'rel_1', m);
    expect(next.items[0].sprintId).toBeNull();
  });
});

describe('applySync — local release sprint grid', () => {
  it('links sprints onto free grid slots in chronological order', () => {
    const m = mapped({
      sprints: [
        { externalId: 'JSPR-2', fields: { name: 'S2', startISO: '2026-04-27', endISO: '2026-05-10' } },
        { externalId: 'JSPR-1', fields: { name: 'S1', startISO: '2026-04-13', endISO: '2026-04-26' } },
      ],
      items: [],
    });
    const { next } = applySync(baseState({ releases: [localRelease()] }), 'rel_1', m);
    expect(next.releases[0].sprints[0]).toMatchObject({ externalId: 'JSPR-1' });
    expect(next.releases[0].sprints[1]).toMatchObject({ externalId: 'JSPR-2' });
    expect(next.releases[0].sprints).toHaveLength(8); // grid size unchanged — no creation
  });

  it('does not overwrite the local grid dates with external dates', () => {
    const m = mapped({
      sprints: [{ externalId: 'JSPR-1', fields: { name: 'S1', startISO: '2030-01-01', endISO: '2030-01-14' } }],
      items: [],
    });
    const { next } = applySync(baseState({ releases: [localRelease()] }), 'rel_1', m);
    const linked = next.releases[0].sprints.find((s) => s.externalId === 'JSPR-1')!;
    expect(linked.startISO).toBe('2026-04-13'); // grid keeps owning dates (option A)
  });

  it('drops + warns external sprints beyond the fixed grid', () => {
    const sprints = Array.from({ length: 9 }, (_, i) => ({
      externalId: `JSPR-${i}`,
      fields: { name: `S${i}`, startISO: `2026-04-${String(13 + i).padStart(2, '0')}`, endISO: '2026-12-31' },
    }));
    const { next, result } = applySync(baseState({ releases: [localRelease()] }), 'rel_1', mapped({ sprints, items: [] }));
    expect(next.releases[0].sprints).toHaveLength(8); // never grows
    expect(result.skipped).toBe(1);
    expect(result.warnings.some((w) => w.includes('No free sprint slot'))).toBe(true);
  });
});

describe('applySync — team sync', () => {
  it('creates a new team from the mapped payload and repoints release.teamId', () => {
    const m = mapped({
      team: {
        externalId: 'ACME-TEAM-1',
        fields: { name: 'Platform Core' },
        members: [
          { externalId: 'USR-ADA', fields: { name: 'Ada L.' } },
          { externalId: 'USR-MARCO', fields: { name: 'Marco P.' } },
        ],
      },
    });
    const { next } = applySync(baseState(), 'rel_1', m);
    const newTeam = next.teams.find((t) => t.externalId === 'ACME-TEAM-1');
    expect(newTeam).toBeDefined();
    expect(newTeam!.name).toBe('Platform Core');
    expect(newTeam!.members).toHaveLength(2);
    expect(newTeam!.members[0]).toMatchObject({ name: 'Ada L.', externalId: 'USR-ADA' });
    expect(next.releases[0].teamId).toBe(newTeam!.id);
  });

  it('reuses an existing team by externalId and updates its name', () => {
    const existingTeam = { id: 'team_x', name: 'Old Name', velocity: 30, externalId: 'ACME-TEAM-1', members: [] };
    const state = { ...baseState(), teams: [existingTeam], releases: [{ ...baseRelease(), teamId: 'team_x' }] };
    const m = mapped({
      team: { externalId: 'ACME-TEAM-1', fields: { name: 'New Name' }, members: [] },
    });
    const { next } = applySync(state, 'rel_1', m);
    const team = next.teams.find((t) => t.externalId === 'ACME-TEAM-1')!;
    expect(team.name).toBe('New Name');
    expect(team.velocity).toBe(30); // app-owned, never overwritten
    expect(next.releases[0].teamId).toBe('team_x');
  });

  it('upserts members by externalId and preserves local members', () => {
    const localMember = { id: 'm_local', name: 'Local User', externalId: null, nonContributing: false };
    const syncedMember = { id: 'm_synced', name: 'Ada L.', externalId: 'USR-ADA', nonContributing: false };
    const existingTeam = { id: 'team_x', name: 'T', velocity: 20, externalId: 'ACME-TEAM-1', members: [localMember, syncedMember] };
    const state = { ...baseState(), teams: [existingTeam], releases: [{ ...baseRelease(), teamId: 'team_x' }] };
    const m = mapped({
      team: {
        externalId: 'ACME-TEAM-1',
        fields: { name: 'T' },
        members: [
          { externalId: 'USR-ADA', fields: { name: 'Ada L. (updated)' } },
          { externalId: 'USR-MARCO', fields: { name: 'Marco P.' } },
        ],
      },
    });
    const { next } = applySync(state, 'rel_1', m);
    const team = next.teams.find((t) => t.externalId === 'ACME-TEAM-1')!;
    // Ada updated, Marco added, local member preserved
    expect(team.members).toHaveLength(3);
    expect(team.members.find((m) => m.externalId === 'USR-ADA')!.name).toBe('Ada L. (updated)');
    expect(team.members.find((m) => m.id === 'm_local')).toBeDefined();
  });

  it('does not sync team for local releases even if payload has one', () => {
    const m = mapped({
      team: { externalId: 'ACME-TEAM-1', fields: { name: 'Platform Core' }, members: [] },
    });
    const { next } = applySync(baseState({ releases: [localRelease()] }), 'rel_1', m);
    expect(next.teams).toHaveLength(0); // no team created
    expect(next.releases[0].teamId).toBe('team_1'); // unchanged
  });
});

describe('applySync — assignee resolution', () => {
  it('resolves extAssigneeId to a local member id on item create', () => {
    const m = mapped({
      team: {
        externalId: 'ACME-TEAM-1',
        fields: { name: 'T' },
        members: [{ externalId: 'USR-ADA', fields: { name: 'Ada L.' } }],
      },
      items: [
        { externalId: 'EXT-1', extWorkStreamId: 'EPIC-A', extSprintId: 'JSPR-1', extAssigneeId: 'USR-ADA', fields: { key: 'EXT-1', subject: 's', description: '', status: 'In Progress', points: 5 } },
      ],
    });
    const { next } = applySync(baseState(), 'rel_1', m);
    const item = next.items[0];
    const ada = next.teams[0].members.find((m) => m.externalId === 'USR-ADA')!;
    expect(item.assignedMemberId).toBe(ada.id);
  });

  it('sets assignedMemberId to null when extAssigneeId is unknown', () => {
    const m = mapped({
      items: [
        { externalId: 'EXT-1', extWorkStreamId: 'EPIC-A', extSprintId: 'JSPR-1', extAssigneeId: 'USR-UNKNOWN', fields: { key: 'EXT-1', subject: 's', description: '', status: 'In Progress', points: 5 } },
      ],
    });
    const { next } = applySync(baseState(), 'rel_1', m);
    expect(next.items[0].assignedMemberId).toBeNull();
  });
});

describe('applySync — dirty-aware pull', () => {
  it('preserves locally-dirty writeable field (points) across sync', () => {
    // First sync: creates item
    const first = applySync(baseState(), 'rel_1', mapped(), ['points', 'sprint']);
    const item = first.next.items[0];
    // Simulate user editing points locally → mark as dirty
    item.points = 13;
    item.dirtyFields = ['points'];

    // Second sync: external sends points = 5, but local is dirty → preserve 13
    const { next } = applySync(first.next, 'rel_1', mapped(), ['points', 'sprint']);
    expect(next.items[0].points).toBe(13); // preserved
  });

  it('preserves locally-dirty sprint across sync', () => {
    const first = applySync(baseState(), 'rel_1', mapped(), ['points', 'sprint']);
    const item = first.next.items[0];
    const originalSprintId = item.sprintId;

    // User moves item to backlog locally
    item.sprintId = null;
    item.dirtyFields = ['sprint'];

    // Re-sync tries to place it in the original sprint — but local dirty wins
    const { next } = applySync(first.next, 'rel_1', mapped(), ['points', 'sprint']);
    expect(next.items[0].sprintId).toBeNull(); // preserved, not overwritten
    // Sanity: the sprint still exists
    expect(next.releases[0].sprints[0].id).toBe(originalSprintId);
  });

  it('does not preserve dirty field if it is not in the writeable set', () => {
    // Same setup but writeableItemFields does not include 'points'
    const first = applySync(baseState(), 'rel_1', mapped(), ['sprint']);
    const item = first.next.items[0];
    item.points = 13;
    item.dirtyFields = ['points']; // dirty, but NOT in writeable

    const { next } = applySync(first.next, 'rel_1', mapped(), ['sprint']);
    expect(next.items[0].points).toBe(5); // external wins, dirty ignored
  });

  it('external wins on read-only fields even if item has dirty writeable fields', () => {
    const first = applySync(baseState(), 'rel_1', mapped(), ['points', 'sprint']);
    const item = first.next.items[0];
    item.points = 13;
    item.dirtyFields = ['points'];

    const changed = mapped({
      items: [
        { externalId: 'EXT-1', extWorkStreamId: 'EPIC-A', extSprintId: 'JSPR-1', extAssigneeId: null, fields: { key: 'EXT-1', subject: 'Updated subject', description: 'd2', status: 'Complete', points: 5 } },
      ],
    });
    const { next } = applySync(first.next, 'rel_1', changed, ['points', 'sprint']);
    expect(next.items[0].subject).toBe('Updated subject'); // read-only, external wins
    expect(next.items[0].status).toBe('Complete'); // read-only, external wins
    expect(next.items[0].points).toBe(13); // writeable + dirty, preserved
  });
});

describe('applySync — build field', () => {
  const itemWithBuild = (build: string | null) => ({
    externalId: 'EXT-1', extWorkStreamId: 'EPIC-A', extSprintId: 'JSPR-1', extAssigneeId: null,
    fields: { key: 'EXT-1', subject: 's', description: '', status: 'In Progress' as const, points: 3, build },
  });

  it('sets build from the mapped field on item create', () => {
    const m = mapped({ items: [itemWithBuild('Orion 1.5')] });
    const { next } = applySync(baseState(), 'rel_1', m);
    expect(next.items[0].build).toBe('Orion 1.5');
  });

  it('sets build: null when the connector omits the field', () => {
    const { next } = applySync(baseState(), 'rel_1', mapped());
    expect(next.items[0].build).toBeNull();
  });

  it('updates build on re-sync', () => {
    const first = applySync(baseState(), 'rel_1', mapped({ items: [itemWithBuild(null)] }));
    const m2 = mapped({ items: [itemWithBuild('Orion 1.5')] });
    const { next } = applySync(first.next, 'rel_1', m2);
    expect(next.items[0].build).toBe('Orion 1.5');
  });

  it('clears build to null when the connector removes it on re-sync', () => {
    const first = applySync(baseState(), 'rel_1', mapped({ items: [itemWithBuild('Orion 1.5')] }));
    const { next } = applySync(first.next, 'rel_1', mapped({ items: [itemWithBuild(null)] }));
    expect(next.items[0].build).toBeNull();
  });
});

describe('applySync — externalUrl (connector deep link)', () => {
  const itemWithUrl = (url: string | null) => ({
    externalId: 'EXT-1', extWorkStreamId: 'EPIC-A', extSprintId: 'JSPR-1', extAssigneeId: null,
    fields: { key: 'EXT-1', subject: 's', description: '', status: 'In Progress' as const, points: 3, url },
  });
  const wsWithUrl = (url: string | null) => ({
    externalId: 'EPIC-A', fields: { name: 'Checkout API', url },
  });

  it('sets item externalUrl from the mapped field on create', () => {
    const { next } = applySync(baseState(), 'rel_1', mapped({ items: [itemWithUrl('https://acme.test/browse/EXT-1')] }));
    expect(next.items[0].externalUrl).toBe('https://acme.test/browse/EXT-1');
  });

  it('sets item externalUrl: null when the connector omits the field', () => {
    const { next } = applySync(baseState(), 'rel_1', mapped());
    expect(next.items[0].externalUrl).toBeNull();
  });

  it('external wins on item externalUrl across re-sync (set then clear)', () => {
    const first = applySync(baseState(), 'rel_1', mapped({ items: [itemWithUrl('https://acme.test/browse/EXT-1')] }));
    expect(first.next.items[0].externalUrl).toBe('https://acme.test/browse/EXT-1');
    const { next } = applySync(first.next, 'rel_1', mapped({ items: [itemWithUrl(null)] }));
    expect(next.items[0].externalUrl).toBeNull();
  });

  it('sets and updates work-stream externalUrl (external wins)', () => {
    const first = applySync(baseState(), 'rel_1', mapped({ workStreams: [wsWithUrl('https://acme.test/browse/EPIC-A')] }));
    expect(first.next.releases[0].workStreams[0].externalUrl).toBe('https://acme.test/browse/EPIC-A');
    const { next } = applySync(first.next, 'rel_1', mapped({ workStreams: [wsWithUrl(null)] }));
    expect(next.releases[0].workStreams[0].externalUrl).toBeNull();
  });
});

describe('applySync — attributes (connector vocabulary)', () => {
  const itemWithAttrs = (attributes?: Record<string, string | number | boolean | null>) => ({
    externalId: 'EXT-1', extWorkStreamId: 'EPIC-A', extSprintId: 'JSPR-1', extAssigneeId: null,
    ...(attributes !== undefined && { attributes }),
    fields: { key: 'EXT-1', subject: 's', description: '', status: 'In Progress' as const, points: 3 },
  });

  it('stores item attributes on create', () => {
    const m = mapped({ items: [itemWithAttrs({ severity: 'high', regression: true })] });
    const { next } = applySync(baseState(), 'rel_1', m);
    expect(next.items[0].attributes).toEqual({ severity: 'high', regression: true });
  });

  it('defaults to {} when the connector omits the bag', () => {
    const { next } = applySync(baseState(), 'rel_1', mapped({ items: [itemWithAttrs()] }));
    expect(next.items[0].attributes).toEqual({});
  });

  it('external wins wholesale on re-sync (updated + removed keys)', () => {
    const first = applySync(baseState(), 'rel_1', mapped({ items: [itemWithAttrs({ severity: 'low', flaky: true })] }));
    const { next } = applySync(first.next, 'rel_1', mapped({ items: [itemWithAttrs({ severity: 'critical' })] }));
    expect(next.items[0].attributes).toEqual({ severity: 'critical' });
  });

  it('preserves a locally-dirty writeable attribute on pull and records the external baseline', () => {
    // First sync establishes the item with severity 'low'.
    const first = applySync(baseState(), 'rel_1', mapped({ items: [itemWithAttrs({ severity: 'low' })] }), ['points', 'sprint', 'severity']);
    // Local edit: severity → 'critical', pending push.
    first.next.items[0].attributes = { severity: 'critical' };
    first.next.items[0].dirtyFields = ['severity'];
    // Re-sync still reports 'low' externally.
    const { next } = applySync(first.next, 'rel_1', mapped({ items: [itemWithAttrs({ severity: 'low' })] }), ['points', 'sprint', 'severity']);
    expect(next.items[0].attributes).toEqual({ severity: 'critical' }); // local pending edit survives
    expect(next.items[0].dirtyFields).toEqual(['severity']);
    expect(next.items[0].syncedValues).toEqual({ points: 3, sprint: expect.any(String), severity: 'low' });
  });

  it('overwrites a non-writeable attribute even when locally modified', () => {
    const first = applySync(baseState(), 'rel_1', mapped({ items: [itemWithAttrs({ severity: 'low' })] }));
    first.next.items[0].attributes = { severity: 'critical' };
    first.next.items[0].dirtyFields = ['severity'];
    // severity NOT in writeableItemFields → external wins.
    const { next } = applySync(first.next, 'rel_1', mapped({ items: [itemWithAttrs({ severity: 'low' })] }), ['points', 'sprint']);
    expect(next.items[0].attributes).toEqual({ severity: 'low' });
  });

  it('stores work-stream attributes and overwrites them on re-sync', () => {
    const ws = (attributes?: Record<string, string | number | boolean | null>) => ({
      externalId: 'EPIC-A', ...(attributes !== undefined && { attributes }), fields: { name: 'Checkout API' },
    });
    const first = applySync(baseState(), 'rel_1', mapped({ workStreams: [ws({ area: 'payments' })] }));
    expect(first.next.releases[0].workStreams[0].attributes).toEqual({ area: 'payments' });
    const { next } = applySync(first.next, 'rel_1', mapped({ workStreams: [ws()] }));
    expect(next.releases[0].workStreams[0].attributes).toEqual({});
  });
});

describe('applySync — status vocabulary', () => {
  const itemWithStatus = (status: 'Not Started' | 'In Progress' | 'Under Review' | 'Blocked' | 'Complete', statusNative?: { id: string; label: string } | null) => ({
    externalId: 'EXT-1', extWorkStreamId: 'EPIC-A', extSprintId: 'JSPR-1', extAssigneeId: null,
    fields: { key: 'EXT-1', subject: 's', description: '', status, ...(statusNative !== undefined && { statusNative }), points: 3 },
  });

  it('stores the native state on create and refreshes it on re-sync (external wins)', () => {
    const first = applySync(baseState(), 'rel_1', mapped({ items: [itemWithStatus('Under Review', { id: 'qa', label: 'QA Verify' })] }));
    expect(first.next.items[0].status).toBe('Under Review');
    expect(first.next.items[0].statusNative).toEqual({ id: 'qa', label: 'QA Verify' });
    const { next } = applySync(first.next, 'rel_1', mapped({ items: [itemWithStatus('Complete', { id: 'done', label: 'Done' })] }));
    expect(next.items[0].status).toBe('Complete');
    expect(next.items[0].statusNative).toEqual({ id: 'done', label: 'Done' });
  });

  it('leaves statusNative null when the connector sends none', () => {
    const { next } = applySync(baseState(), 'rel_1', mapped({ items: [itemWithStatus('In Progress')] }));
    expect(next.items[0].statusNative).toBeNull();
  });

  it('preserves a locally-dirty status on pull and baselines the external native id', () => {
    const first = applySync(baseState(), 'rel_1', mapped({ items: [itemWithStatus('In Progress', { id: 'in_progress', label: 'Doing' })] }), ['points', 'sprint', 'status']);
    // Local edit: move to QA, pending push.
    first.next.items[0].status = 'Under Review';
    first.next.items[0].statusNative = { id: 'qa', label: 'QA Verify' };
    first.next.items[0].dirtyFields = ['status'];
    // External still reports Doing.
    const { next } = applySync(first.next, 'rel_1', mapped({ items: [itemWithStatus('In Progress', { id: 'in_progress', label: 'Doing' })] }), ['points', 'sprint', 'status']);
    expect(next.items[0].status).toBe('Under Review');
    expect(next.items[0].statusNative).toEqual({ id: 'qa', label: 'QA Verify' });
    expect(next.items[0].dirtyFields).toEqual(['status']);
    expect(next.items[0].syncedValues?.status).toBe('in_progress');
  });

  it('baselines the bare category when status is writeable but no vocabulary exists', () => {
    const { next } = applySync(baseState(), 'rel_1', mapped({ items: [itemWithStatus('Blocked')] }), ['points', 'sprint', 'status']);
    expect(next.items[0].syncedValues?.status).toBe('Blocked');
  });
});

describe('applySync — descriptionFormat field', () => {
  const itemWithFormat = (descriptionFormat?: 'text' | 'html') => ({
    externalId: 'EXT-1', extWorkStreamId: 'EPIC-A', extSprintId: 'JSPR-1', extAssigneeId: null,
    fields: {
      key: 'EXT-1', subject: 's', description: '<p>detail</p>', status: 'In Progress' as const, points: 3,
      ...(descriptionFormat !== undefined && { descriptionFormat }),
    },
  });

  it('sets descriptionFormat: html on item create when connector sends html', () => {
    const m = mapped({ items: [itemWithFormat('html')] });
    const { next } = applySync(baseState(), 'rel_1', m);
    expect(next.items[0].descriptionFormat).toBe('html');
  });

  it('defaults to descriptionFormat: text when connector omits the field on create', () => {
    const { next } = applySync(baseState(), 'rel_1', mapped());
    expect(next.items[0].descriptionFormat).toBe('text');
  });

  it('updates descriptionFormat to html on re-sync when connector sends html', () => {
    const first = applySync(baseState(), 'rel_1', mapped({ items: [itemWithFormat('text')] }));
    const { next } = applySync(first.next, 'rel_1', mapped({ items: [itemWithFormat('html')] }));
    expect(next.items[0].descriptionFormat).toBe('html');
  });

  it('resets descriptionFormat to text when connector omits the field on re-sync', () => {
    const first = applySync(baseState(), 'rel_1', mapped({ items: [itemWithFormat('html')] }));
    const { next } = applySync(first.next, 'rel_1', mapped()); // no descriptionFormat in fields
    expect(next.items[0].descriptionFormat).toBe('text');
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
