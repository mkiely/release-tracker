import { describe, expect, it } from 'vitest';
import { activeSprint, capPct, eventsIn, elapsedSprints, fullCap, groupItemsByStream, releaseCapacity, remainingSprints, sprintVel, statusSegs, streamContention, streamForecast, streamHealth, velocityAttainment, type StreamHealth } from './derive';
import { addDays, buildSprints, todayISO, workdaysInRange } from './dates';
import type { Release, Sprint, Team, WorkItem } from '../types';

const team = (members: number, velocity: number): Team => ({
  id: 't',
  name: 'T',
  velocity,
  members: Array.from({ length: members }, (_, i) => ({ id: `m${i}`, name: `M${i}`, externalId: null, nonContributing: false })),
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

const teamWithNonContrib = (contributing: number, nonContributing: number, velocity: number): Team => ({
  id: 't',
  name: 'T',
  velocity,
  externalId: null,
  members: [
    ...Array.from({ length: contributing }, (_, i) => ({ id: `c${i}`, name: `C${i}`, externalId: null, nonContributing: false })),
    ...Array.from({ length: nonContributing }, (_, i) => ({ id: `nc${i}`, name: `NC${i}`, externalId: null, nonContributing: true })),
  ],
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
  it('excludes non-contributing members from capacity', () => {
    // 4 contributing + 2 non-contributing → only 4 count
    expect(fullCap(teamWithNonContrib(4, 2, 40), s14)).toBe(40);
  });
  it('is 0 when all members are non-contributing', () => {
    expect(fullCap(teamWithNonContrib(0, 3, 40), s14)).toBe(0);
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
    build: null, externalUrl: null,
    dirtyFields: [],
    itemType: null,
  });

  it('counts per status and drops zeros', () => {
    const items = [item('Complete'), item('Complete'), item('In Progress'), item('Blocked')];
    expect(statusSegs(items)).toEqual([
      { k: 'In Progress', v: 1 },
      { k: 'Blocked', v: 1 },
      { k: 'Complete', v: 2 },
    ]);
  });

  it('produces segments in STATUSES order (Not Started, In Progress, Under Review, Blocked, Complete)', () => {
    const items = [item('Complete'), item('Not Started'), item('In Progress'), item('Under Review')];
    expect(statusSegs(items).map((s) => s.k)).toEqual(['Not Started', 'In Progress', 'Under Review', 'Complete']);
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
    points: 1, externalId: null, assignedMemberId: null, build: null, externalUrl: null, dirtyFields: [], itemType: null,
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

describe('streamHealth', () => {
  const it_ = (status: WorkItem['status'], points: number): WorkItem => ({
    id: Math.random().toString(), releaseId: 'r', workStreamId: 'w', sprintId: 'sp1',
    key: 'K', subject: 's', description: '', status, points,
    externalId: null, assignedMemberId: null, build: null, externalUrl: null, dirtyFields: [], itemType: null,
  });

  it('computes points-based completion, not count-based', () => {
    const h = streamHealth([it_('Complete', 13), it_('Not Started', 1)]);
    expect(h.totalPts).toBe(14);
    expect(h.donePts).toBe(13);
    expect(h.pct).toBe(93); // 13/14, not 50% by count
    expect(h.remainingPts).toBe(1);
  });

  it('sums blocked points', () => {
    const h = streamHealth([it_('Complete', 40), it_('Blocked', 5), it_('Blocked', 3)]);
    expect(h.blockedPts).toBe(8);
  });

  it('is 100% when all points are complete', () => {
    const h = streamHealth([it_('Complete', 8), it_('Complete', 5)]);
    expect(h.pct).toBe(100);
    expect(h.remainingPts).toBe(0);
  });

  it('produces non-zero points-by-status in STATUSES order', () => {
    const h = streamHealth([it_('Complete', 5), it_('Not Started', 2), it_('In Progress', 3)]);
    expect(h.pointsByStatus).toEqual([
      { k: 'Not Started', v: 2 },
      { k: 'In Progress', v: 3 },
      { k: 'Complete', v: 5 },
    ]);
  });

  it('is all-zero for an empty stream', () => {
    const h = streamHealth([]);
    expect(h).toMatchObject({ totalPts: 0, donePts: 0, remainingPts: 0, blockedPts: 0, pct: 0, pointsByStatus: [] });
  });
});

// ── Forward capacity-fit health ─────────────────────────────────────────────
describe('forward capacity-fit health', () => {
  // A calendar-relative release: one fully-past sprint, the active sprint, and two
  // future sprints. With daysOff 0, sprintVel == velocity, so capacity is exact.
  const calRelease = (): Release => {
    const today = todayISO();
    const past: Sprint = { id: 'p', name: 'P', startISO: addDays(today, -28), endISO: addDays(today, -15), daysOff: 0, externalId: null };
    const active: Sprint = { id: 'a', name: 'A', startISO: addDays(today, -5), endISO: addDays(today, 9), daysOff: 0, externalId: null };
    const f1: Sprint = { id: 'f1', name: 'F1', startISO: addDays(today, 10), endISO: addDays(today, 23), daysOff: 0, externalId: null };
    const f2: Sprint = { id: 'f2', name: 'F2', startISO: addDays(today, 24), endISO: addDays(today, 37), daysOff: 0, externalId: null };
    return { id: 'r', name: 'R', startISO: past.startISO, teamId: 't', workStreams: [], events: [], sprints: [past, active, f1, f2], externalId: null, connector: null, sync: null };
  };

  const hp = (remainingPts: number, itemCount = 1): StreamHealth => ({ itemCount, totalPts: remainingPts, donePts: 0, remainingPts, blockedPts: 0, pct: 0, pointsByStatus: [] });

  describe('remainingSprints', () => {
    it('excludes fully-past sprints and includes the active + future ones', () => {
      const ids = remainingSprints(calRelease()).map((s) => s.id);
      expect(ids).toEqual(['a', 'f1', 'f2']);
    });
  });

  describe('releaseCapacity', () => {
    it('splits remaining team capacity per contributing engineer', () => {
      const ctx = releaseCapacity(calRelease(), team(4, 40));
      expect(ctx.remainingSprintCount).toBe(3);
      expect(ctx.teamRemainingCap).toBe(120); // 40 × 3 remaining sprints
      expect(ctx.contributingCount).toBe(4);
      expect(ctx.perEngineerCap).toBe(30); // 120 / 4
    });

    it('is 0-safe when there is no team', () => {
      const ctx = releaseCapacity(calRelease(), undefined);
      expect(ctx.contributingCount).toBe(0);
      expect(ctx.perEngineerCap).toBe(0);
    });
  });

  describe('streamContention', () => {
    it('flags over-allocation and scales engineers down proportionally', () => {
      const c = streamContention([2, 3, 4], 4);
      expect(c.totalRequired).toBe(9);
      expect(c.overAllocated).toBe(true);
      expect(c.scale).toBeCloseTo(4 / 9);
    });

    it('does not scale when demand fits the team', () => {
      const c = streamContention([2, 1], 4);
      expect(c.overAllocated).toBe(false);
      expect(c.scale).toBe(1);
    });
  });

  describe('streamForecast', () => {
    const ctx = () => releaseCapacity(calRelease(), team(4, 40)); // perEngineerCap 30, 3 sprints
    const noContention = streamContention([], 4);

    it('is unconfigured when engineersRequired is null', () => {
      const f = streamForecast(hp(50), null, ctx(), noContention);
      expect(f.verdict).toBe('unconfigured');
    });

    it('is complete when estimated work is all done', () => {
      const done: StreamHealth = { itemCount: 3, totalPts: 30, donePts: 30, remainingPts: 0, blockedPts: 0, pct: 100, pointsByStatus: [] };
      const f = streamForecast(done, 2, ctx(), noContention);
      expect(f.verdict).toBe('complete');
    });

    it('is unestimated when items exist but none carry points', () => {
      const noPoints: StreamHealth = { itemCount: 4, totalPts: 0, donePts: 0, remainingPts: 0, blockedPts: 0, pct: 0, pointsByStatus: [] };
      const f = streamForecast(noPoints, 2, ctx(), noContention);
      expect(f.verdict).toBe('unestimated');
      expect(f.summary).toContain('4 items');
    });

    it('reports unestimated before engineers are even configured', () => {
      const noPoints: StreamHealth = { itemCount: 1, totalPts: 0, donePts: 0, remainingPts: 0, blockedPts: 0, pct: 0, pointsByStatus: [] };
      const f = streamForecast(noPoints, null, ctx(), noContention);
      expect(f.verdict).toBe('unestimated');
      expect(f.summary).toContain('1 item');
    });

    it('is complete (not unestimated) for an empty stream', () => {
      const f = streamForecast(hp(0, 0), 2, ctx(), noContention);
      expect(f.verdict).toBe('complete');
    });

    it('is on-track when remaining work fits capacity', () => {
      const f = streamForecast(hp(50), 2, ctx(), noContention); // cap = 2 × 30 = 60
      expect(f.verdict).toBe('on-track');
      expect(f.effectiveCap).toBe(60);
      expect(f.shortfallPts).toBeLessThanOrEqual(0);
    });

    it('is at-risk when remaining work exceeds capacity, with a shortfall', () => {
      const f = streamForecast(hp(80), 2, ctx(), noContention); // cap = 60
      expect(f.verdict).toBe('at-risk');
      expect(f.shortfallPts).toBeCloseTo(20);
      expect(f.sprintsShort).toBeGreaterThan(0);
    });

    it('downgrades a nominally-fine stream when the release is over-allocated', () => {
      const contended = streamContention([2, 3, 4], 4); // scale 4/9
      const f = streamForecast(hp(50), 2, ctx(), contended);
      expect(f.contended).toBe(true);
      expect(f.effectiveCap).toBeLessThan(f.nominalCap); // 26.7 < 60
      expect(f.verdict).toBe('at-risk');
      expect(f.summary).toContain('overbooked');
    });

    it('is at-risk with infinite runway when there is no forward capacity', () => {
      const ctx0 = releaseCapacity(calRelease(), undefined); // perEngineerCap 0
      const f = streamForecast(hp(20), 2, ctx0, streamContention([], 0));
      expect(f.verdict).toBe('at-risk');
      expect(Number.isFinite(f.runwaySprints)).toBe(false);
    });
  });
});

describe('buildSprints length', () => {
  it('defaults to 14-day sprints', () => {
    const sps = buildSprints('2026-04-13', {}, 2);
    expect(sps[0].startISO).toBe('2026-04-13');
    expect(sps[0].endISO).toBe('2026-04-26'); // 14 calendar days inclusive
    expect(sps[1].startISO).toBe('2026-04-27');
  });

  it('honors a custom uniform length (3 weeks)', () => {
    const sps = buildSprints('2026-04-13', {}, 2, 21);
    expect(sps[0].endISO).toBe('2026-05-03'); // 21 days inclusive
    expect(sps[1].startISO).toBe('2026-05-04');
    expect(workdaysInRange(sps[0].startISO, sps[0].endISO)).toBe(15);
  });
});

describe('velocityAttainment', () => {
  const today = todayISO();
  // Two elapsed sprints + one active. daysOff 0 so sprintVel == team velocity.
  const mkRelease = (): Release => ({
    id: 'r', name: 'R', startISO: addDays(today, -42), teamId: 't',
    workStreams: [], events: [], externalId: null, connector: null, sync: null,
    sprints: [
      { id: 'e1', name: 'Sprint 1', startISO: addDays(today, -42), endISO: addDays(today, -29), daysOff: 0, externalId: null },
      { id: 'e2', name: 'Sprint 2', startISO: addDays(today, -28), endISO: addDays(today, -15), daysOff: 0, externalId: null },
      { id: 'a',  name: 'Sprint 3', startISO: addDays(today, -5),  endISO: addDays(today, 9),   daysOff: 0, externalId: null },
    ],
  } as Release);

  const item = (sprintId: string, status: WorkItem['status'], points: number): WorkItem =>
    ({ id: Math.random().toString(), releaseId: 'r', workStreamId: null, sprintId, key: 'K', subject: 's', description: '', status, points } as WorkItem);

  it('measures only elapsed sprints and rolls up attainment', () => {
    const r = mkRelease();
    const items = [
      item('e1', 'Complete', 30),
      item('e2', 'Complete', 20),
      item('e2', 'Active', 100),  // not complete → excluded from actual
      item('a', 'Complete', 999), // active sprint → excluded entirely
    ];
    const v = velocityAttainment(r, team(1, 40), items, today);
    expect(v.perSprint.map((s) => s.sprint.id)).toEqual(['e1', 'e2']);
    expect(v.totalPlanned).toBe(80); // 40 × 2 elapsed sprints
    expect(v.totalActual).toBe(50); // 30 + 20
    expect(v.attainmentPct).toBe(63); // round(50/80)
    expect(v.verdict).toBe('under');
  });

  it('is on-track when delivery meets the plan', () => {
    const r = mkRelease();
    const items = [item('e1', 'Complete', 40), item('e2', 'Complete', 38)];
    const v = velocityAttainment(r, team(1, 40), items, today);
    expect(v.verdict).toBe('on-track'); // 78/80 = 98%
  });

  it('reports none when no sprint has elapsed', () => {
    const r: Release = { ...mkRelease(), sprints: [
      { id: 'a', name: 'Sprint 1', startISO: addDays(today, -5), endISO: addDays(today, 9), daysOff: 0, externalId: null },
    ] };
    const v = velocityAttainment(r, team(1, 40), [], today);
    expect(elapsedSprints(r, today)).toHaveLength(0);
    expect(v.attainmentPct).toBeNull();
    expect(v.verdict).toBe('none');
  });
});
