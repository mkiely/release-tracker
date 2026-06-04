import { describe, expect, it } from 'vitest';
import { activeSprint, capPct, eventsIn, fullCap, groupItemsByStream, sprintVel, statusSegs } from './derive';
import { addDays, buildSprints, todayISO, workdaysInRange } from './dates';
import type { Release, Sprint, Team, WorkItem } from '../types';

const team = (members: number, velocity: number): Team => ({
  id: 't',
  name: 'T',
  velocity,
  members: Array.from({ length: members }, (_, i) => ({ id: `m${i}`, name: `M${i}`, externalId: null })),
  externalId: null,
});

const sprint = (startISO: string, endISO: string): Sprint => ({
  id: 'sp', name: 'S', startISO, endISO, daysOff: 0, externalId: null,
});

// standard 14-day sprint: Mon Apr 13 → Sun Apr 26, 2026 = 10 business days
const s14 = sprint('2026-04-13', '2026-04-26');

describe('workdaysInRange', () => {
  it('is 10 for a standard 14-day sprint (parity with the old WORKDAYS constant)', () => {
    expect(workdaysInRange('2026-04-13', '2026-04-26')).toBe(10);
  });
  it('counts only Mon–Fri for shorter ranges', () => {
    expect(workdaysInRange('2026-04-13', '2026-04-19')).toBe(5); // one week
  });
  it('scales for longer ranges', () => {
    expect(workdaysInRange('2026-04-13', '2026-05-03')).toBe(15); // three weeks
  });
});

describe('fullCap', () => {
  it('is members × the sprint workdays (10 for a standard 14-day sprint)', () => {
    expect(fullCap(team(5, 40), s14)).toBe(50);
    expect(fullCap(team(3, 24), s14)).toBe(30);
  });
  it('tracks non-standard sprint lengths', () => {
    expect(fullCap(team(2, 20), sprint('2026-04-13', '2026-04-19'))).toBe(10); // 5 workdays × 2
    expect(fullCap(team(2, 20), sprint('2026-04-13', '2026-05-03'))).toBe(30); // 15 workdays × 2
  });
  it('is 0 for undefined team', () => {
    expect(fullCap(undefined, s14)).toBe(0);
  });
});

describe('capPct', () => {
  it('is 1 at no days off', () => {
    expect(capPct(team(5, 40), s14, 0)).toBe(1);
  });
  it('scales linearly with days off', () => {
    // full = 50; 10 off → 40/50 = 0.8
    expect(capPct(team(5, 40), s14, 10)).toBeCloseTo(0.8);
  });
  it('clamps at 0, never negative', () => {
    expect(capPct(team(5, 40), s14, 999)).toBe(0);
  });
  it('is 0 when team has no capacity', () => {
    expect(capPct(team(0, 40), s14, 0)).toBe(0);
  });
});

describe('sprintVel', () => {
  it('is velocity at full capacity', () => {
    expect(sprintVel(team(5, 40), s14, 0)).toBe(40);
  });
  it('rounds velocity × capacity%', () => {
    // 40 × 0.8 = 32
    expect(sprintVel(team(5, 40), s14, 10)).toBe(32);
    // full = 50; 5 off → 45/50 = 0.9; 40 × 0.9 = 36
    expect(sprintVel(team(5, 40), s14, 5)).toBe(36);
  });
  it('rounds to nearest integer', () => {
    // full = 30; 5 off → 25/30 = 0.8333; 24 × 0.8333 = 20 (19.999→20)
    expect(sprintVel(team(3, 24), s14, 5)).toBe(20);
  });
  it('is 0 for undefined team', () => {
    expect(sprintVel(undefined, s14, 0)).toBe(0);
  });
});

describe('eventsIn', () => {
  const release = (): Release => ({
    id: 'r',
    name: 'R',
    startISO: '2026-04-13',
    teamId: 't',
    workStreams: [],
    events: [
      { id: 'e3', label: 'C', dateISO: '2026-04-25', externalId: null },
      { id: 'e1', label: 'A', dateISO: '2026-04-13', externalId: null },
      { id: 'e2', label: 'B', dateISO: '2026-04-20', externalId: null },
      { id: 'e4', label: 'D', dateISO: '2026-05-01', externalId: null }, // outside sprint 1
    ],
    sprints: buildSprints('2026-04-13', {}),
    externalId: null,
    connector: null,
    sync: null,
  });

  it('returns events inside the sprint range, sorted ascending', () => {
    const r = release();
    const sp1 = r.sprints[0]; // Apr 13 – Apr 26
    const got = eventsIn(r, sp1);
    expect(got.map((e) => e.id)).toEqual(['e1', 'e2', 'e3']);
  });

  it('includes events on the boundary dates', () => {
    const r = release();
    const sp1 = r.sprints[0];
    expect(eventsIn(r, sp1).some((e) => e.dateISO === sp1.startISO)).toBe(true);
  });
});

describe('activeSprint', () => {
  // Build a release whose sprints bracket today so tests don't depend on the
  // calendar date they run on. todayISO() and addDays() are pure utilities.
  const makeRelease = (sprints: Sprint[]): Release => ({
    id: 'r', name: 'R', startISO: sprints[0]?.startISO ?? '2026-01-01',
    teamId: 't', workStreams: [], events: [], sprints, externalId: null,
    connector: null, sync: null,
  });

  it('returns the sprint whose window contains today', () => {
    const today = todayISO();
    const active: Sprint = { id: 'sp_active', name: 'Active', startISO: addDays(today, -5), endISO: addDays(today, 5), daysOff: 0, externalId: null };
    const past: Sprint = { id: 'sp_past', name: 'Past', startISO: addDays(today, -20), endISO: addDays(today, -7), daysOff: 0, externalId: null };
    const future: Sprint = { id: 'sp_future', name: 'Future', startISO: addDays(today, 7), endISO: addDays(today, 20), daysOff: 0, externalId: null };
    const r = makeRelease([past, active, future]);
    expect(activeSprint(r)?.id).toBe('sp_active');
  });

  it('returns null when today falls between sprints', () => {
    const today = todayISO();
    const past: Sprint = { id: 'sp_past', name: 'Past', startISO: addDays(today, -30), endISO: addDays(today, -16), daysOff: 0, externalId: null };
    const future: Sprint = { id: 'sp_future', name: 'Future', startISO: addDays(today, 2), endISO: addDays(today, 15), daysOff: 0, externalId: null };
    expect(activeSprint(makeRelease([past, future]))).toBeNull();
  });

  it('returns null for a release with no sprints', () => {
    expect(activeSprint(makeRelease([]))).toBeNull();
  });

  it('matches on the boundary start date', () => {
    const today = todayISO();
    const sp: Sprint = { id: 'sp1', name: 'S', startISO: today, endISO: addDays(today, 13), daysOff: 0, externalId: null };
    expect(activeSprint(makeRelease([sp]))?.id).toBe('sp1');
  });

  it('matches on the boundary end date', () => {
    const today = todayISO();
    const sp: Sprint = { id: 'sp1', name: 'S', startISO: addDays(today, -13), endISO: today, daysOff: 0, externalId: null };
    expect(activeSprint(makeRelease([sp]))?.id).toBe('sp1');
  });
});

describe('statusSegs', () => {
  const item = (status: WorkItem['status']): WorkItem => ({
    id: Math.random().toString(),
    releaseId: 'r',
    workStreamId: 'w',
    sprintId: 'sp1',
    key: 'K',
    subject: 's',
    description: '',
    status,
    points: 1,
    externalId: null,
    assignedMemberId: null,
    build: null,
    dirtyFields: [],
  });

  it('counts per status and drops zeros', () => {
    const items = [item('Complete'), item('Complete'), item('Active'), item('Blocked')];
    expect(statusSegs(items)).toEqual([
      { k: 'Active', v: 1 },
      { k: 'Blocked', v: 1 },
      { k: 'Complete', v: 2 },
    ]);
  });

  it('produces segments in STATUSES order (Not Started, Active, Blocked, Complete)', () => {
    const items = [item('Complete'), item('Not Started'), item('Active')];
    expect(statusSegs(items).map((s) => s.k)).toEqual(['Not Started', 'Active', 'Complete']);
  });

  it('returns empty for no items', () => {
    expect(statusSegs([])).toEqual([]);
  });
});

describe('groupItemsByStream', () => {
  const ws = (id: string, name: string) => ({ id, name });

  const item = (id: string, workStreamId: string | null): WorkItem => ({
    id, releaseId: 'r', workStreamId, sprintId: null,
    key: `K-${id}`, subject: 'S', description: '', status: 'Not Started',
    points: 1, externalId: null, assignedMemberId: null, build: null, dirtyFields: [],
  });

  it('groups items under their stream in the order streams are declared', () => {
    const streams = [ws('ws1', 'Alpha'), ws('ws2', 'Beta'), ws('ws3', 'Gamma')];
    const items = [item('i3', 'ws3'), item('i1', 'ws1'), item('i2', 'ws2')];
    const result = groupItemsByStream(items, streams);
    expect(result.map((g) => g.wsId)).toEqual(['ws1', 'ws2', 'ws3']);
    expect(result[0].items.map((i) => i.id)).toEqual(['i1']);
    expect(result[1].items.map((i) => i.id)).toEqual(['i2']);
    expect(result[2].items.map((i) => i.id)).toEqual(['i3']);
  });

  it('omits streams that have no items in the given set', () => {
    const streams = [ws('ws1', 'Alpha'), ws('ws2', 'Beta'), ws('ws3', 'Gamma')];
    const items = [item('i1', 'ws1'), item('i3', 'ws3')];
    const result = groupItemsByStream(items, streams);
    expect(result.map((g) => g.wsId)).toEqual(['ws1', 'ws3']);
  });

  it('collects items with workStreamId null into a trailing unassigned group', () => {
    const streams = [ws('ws1', 'Alpha')];
    const items = [item('i1', 'ws1'), item('i2', null), item('i3', null)];
    const result = groupItemsByStream(items, streams);
    expect(result).toHaveLength(2);
    expect(result[1]).toEqual({ wsId: null, wsName: null, items: [item('i2', null), item('i3', null)] });
  });

  it('collects items whose workStreamId is not in the stream list into unassigned', () => {
    const streams = [ws('ws1', 'Alpha')];
    const items = [item('i1', 'ws_unknown'), item('i2', 'ws1')];
    const result = groupItemsByStream(items, streams);
    expect(result).toHaveLength(2);
    expect(result[0].wsId).toBe('ws1');
    expect(result[1]).toMatchObject({ wsId: null, wsName: null });
    expect(result[1].items.map((i) => i.id)).toEqual(['i1']);
  });

  it('returns only an unassigned group when streams list is empty', () => {
    const items = [item('i1', null), item('i2', 'ws_orphan')];
    const result = groupItemsByStream(items, []);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ wsId: null, wsName: null });
    expect(result[0].items).toHaveLength(2);
  });

  it('returns empty when items list is empty', () => {
    expect(groupItemsByStream([], [ws('ws1', 'Alpha')])).toHaveLength(0);
    expect(groupItemsByStream([], [])).toHaveLength(0);
  });

  it('unassigned group is always last even when all other groups are present', () => {
    const streams = [ws('ws1', 'Alpha'), ws('ws2', 'Beta')];
    const items = [item('i_none', null), item('i1', 'ws1'), item('i2', 'ws2')];
    const result = groupItemsByStream(items, streams);
    expect(result[result.length - 1].wsId).toBeNull();
  });

  it('wsName is set on named groups and null on the unassigned group', () => {
    const streams = [ws('ws1', 'My Stream')];
    const items = [item('i1', 'ws1'), item('i2', null)];
    const result = groupItemsByStream(items, streams);
    expect(result[0].wsName).toBe('My Stream');
    expect(result[1].wsName).toBeNull();
  });
});
