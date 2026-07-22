import { describe, expect, it } from 'vitest';
import { activeSprint, capPct, effectiveCodeFreeze, effectiveStreamCodeFreeze, eventsIn, elapsedSprints, freezeSprintX, fullCap, groupItemsByStream, plannedVel, releaseCapacity, remainingSprints, sprintVel, statusSegs, streamCapacityCtx, streamContention, streamForecast, streamHealth, streamRunway, velocityAttainment, velocitySuggestion, type ReleaseCapacity, type StreamHealth } from './derive';
import { addDays, buildSprints, todayISO, workdaysInRange } from './dates';
import type { Release, Sprint, Team, WorkItem, WorkStream } from '../types';

const team = (members: number, velocity: number): Team => ({
  id: 't',
  name: 'T',
  velocity,
  members: Array.from({ length: members }, (_, i) => ({ id: `m${i}`, name: `M${i}`, externalId: null, nonContributing: false })),
  externalId: null,
});

const sprint = (startISO: string, endISO: string): Sprint => ({
  id: 'sp', name: 'S', startISO, endISO, daysOff: 0, externalId: null, plannedVelocity: null,
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
    codeFreezeISO: null,
    externalId: null,
    connector: null,
    sync: null,
    sprintLengthDays: 14,
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
    teamId: 't', workStreams: [], events: [], sprints, codeFreezeISO: null, externalId: null,
    connector: null, sync: null, sprintLengthDays: 14,
  });

  it('returns the sprint whose window contains today', () => {
    const today = todayISO();
    const active: Sprint = { id: 'sp_active', name: 'Active', startISO: addDays(today, -5), endISO: addDays(today, 5), daysOff: 0, externalId: null, plannedVelocity: null };
    const past: Sprint = { id: 'sp_past', name: 'Past', startISO: addDays(today, -20), endISO: addDays(today, -7), daysOff: 0, externalId: null, plannedVelocity: null };
    const future: Sprint = { id: 'sp_future', name: 'Future', startISO: addDays(today, 7), endISO: addDays(today, 20), daysOff: 0, externalId: null, plannedVelocity: null };
    const r = makeRelease([past, active, future]);
    expect(activeSprint(r)?.id).toBe('sp_active');
  });

  it('returns null when today falls between sprints', () => {
    const today = todayISO();
    const past: Sprint = { id: 'sp_past', name: 'Past', startISO: addDays(today, -30), endISO: addDays(today, -16), daysOff: 0, externalId: null, plannedVelocity: null };
    const future: Sprint = { id: 'sp_future', name: 'Future', startISO: addDays(today, 2), endISO: addDays(today, 15), daysOff: 0, externalId: null, plannedVelocity: null };
    expect(activeSprint(makeRelease([past, future]))).toBeNull();
  });

  it('returns null for a release with no sprints', () => {
    expect(activeSprint(makeRelease([]))).toBeNull();
  });

  it('matches on the boundary start date', () => {
    const today = todayISO();
    const sp: Sprint = { id: 'sp1', name: 'S', startISO: today, endISO: addDays(today, 13), daysOff: 0, externalId: null, plannedVelocity: null };
    expect(activeSprint(makeRelease([sp]))?.id).toBe('sp1');
  });

  it('matches on the boundary end date', () => {
    const today = todayISO();
    const sp: Sprint = { id: 'sp1', name: 'S', startISO: addDays(today, -13), endISO: today, daysOff: 0, externalId: null, plannedVelocity: null };
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
    const past: Sprint = { id: 'p', name: 'P', startISO: addDays(today, -28), endISO: addDays(today, -15), daysOff: 0, externalId: null, plannedVelocity: null };
    const active: Sprint = { id: 'a', name: 'A', startISO: addDays(today, -5), endISO: addDays(today, 9), daysOff: 0, externalId: null, plannedVelocity: null };
    const f1: Sprint = { id: 'f1', name: 'F1', startISO: addDays(today, 10), endISO: addDays(today, 23), daysOff: 0, externalId: null, plannedVelocity: null };
    const f2: Sprint = { id: 'f2', name: 'F2', startISO: addDays(today, 24), endISO: addDays(today, 37), daysOff: 0, externalId: null, plannedVelocity: null };
    return { id: 'r', name: 'R', startISO: past.startISO, teamId: 't', workStreams: [], events: [], sprints: [past, active, f1, f2], codeFreezeISO: null, externalId: null, connector: null, sync: null, sprintLengthDays: 14 };
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

  describe('code freeze', () => {
    // Fixed-date sprints (not today-relative) so proration math is deterministic.
    const sp1 = sprint('2026-04-13', '2026-04-26'); // Mon–Sun, 10 business days
    const sp2 = sprint('2026-04-27', '2026-05-10'); // Mon–Sun, 10 business days
    const freezeRelease = (codeFreezeISO: string | null): Release => ({
      id: 'r', name: 'R', startISO: sp1.startISO, teamId: 't',
      workStreams: [], events: [], sprints: [sp1, sp2], codeFreezeISO,
      externalId: null, connector: null, sync: null, sprintLengthDays: 14,
    });
    const ws = (codeFreezeISO?: string | null): WorkStream => ({
      id: 'ws', name: 'W', externalId: null, engineersRequired: null, planningMuted: false, build: null, externalUrl: null, codeFreezeISO,
    });
    const before = '2026-04-01'; // "today" earlier than both sprints — both are remaining

    describe('effectiveCodeFreeze', () => {
      it('defaults to the last sprint end when unset', () => {
        expect(effectiveCodeFreeze(freezeRelease(null))).toBe(sp2.endISO);
      });

      it('uses the explicit override when set', () => {
        expect(effectiveCodeFreeze(freezeRelease('2026-04-20'))).toBe('2026-04-20');
      });
    });

    describe('effectiveStreamCodeFreeze', () => {
      it('inherits the release date when the stream has no override', () => {
        expect(effectiveStreamCodeFreeze(freezeRelease('2026-04-20'), ws(null))).toBe('2026-04-20');
      });

      it("uses the stream's own override when set", () => {
        expect(effectiveStreamCodeFreeze(freezeRelease('2026-04-20'), ws('2026-05-05'))).toBe('2026-05-05');
      });

      it('inherits the release date for the Unassigned bucket (ws null)', () => {
        expect(effectiveStreamCodeFreeze(freezeRelease('2026-04-20'), null)).toBe('2026-04-20');
      });
    });

    describe('releaseCapacity with a code freeze', () => {
      it('excludes sprints that start after the freeze and prorates the straddling one', () => {
        const ctx = releaseCapacity(freezeRelease('2026-04-20'), team(1, 100), before);
        expect(ctx.remainingSprintCount).toBe(1); // sp2 starts 04-27, after the freeze
        const factor = workdaysInRange(sp1.startISO, '2026-04-20') / workdaysInRange(sp1.startISO, sp1.endISO);
        expect(ctx.teamRemainingCap).toBeCloseTo(100 * factor);
      });

      it('counts a sprint in full when it ends on/before the freeze', () => {
        const ctx = releaseCapacity(freezeRelease(sp1.endISO), team(1, 100), before);
        expect(ctx.remainingSprintCount).toBe(1);
        expect(ctx.teamRemainingCap).toBe(100);
      });

      it('is unaffected when codeFreezeISO is null (defaults to the last sprint end)', () => {
        const ctx = releaseCapacity(freezeRelease(null), team(1, 100), before);
        expect(ctx.remainingSprintCount).toBe(2);
        expect(ctx.teamRemainingCap).toBe(200);
      });

      it("uses a work stream's own freeze override when passed explicitly", () => {
        const r = freezeRelease('2026-04-20');
        const streamFreeze = effectiveStreamCodeFreeze(r, ws('2026-05-10'));
        const ctx = releaseCapacity(r, team(1, 100), before, streamFreeze);
        expect(ctx.remainingSprintCount).toBe(2); // stream's own freeze reaches through sp2
        expect(ctx.teamRemainingCap).toBe(200);
      });
    });

    describe('freezeSprintX', () => {
      const sprints = [sp1, sp2];

      it('is the left edge (index) when the date precedes all sprints', () => {
        expect(freezeSprintX(sprints, before)).toBe(0);
      });

      it('prorates within the straddling sprint, mirroring the capacity factor', () => {
        // Same proration releaseCapacity uses for the sprint the freeze falls inside.
        const expected = workdaysInRange(sp1.startISO, '2026-04-20') / workdaysInRange(sp1.startISO, sp1.endISO);
        expect(freezeSprintX(sprints, '2026-04-20')).toBeCloseTo(0 + expected); // 0.6 into sprint 0
      });

      it('offsets by the sprint index for a date in a later sprint', () => {
        const frac = workdaysInRange(sp2.startISO, '2026-05-03') / workdaysInRange(sp2.startISO, sp2.endISO);
        expect(freezeSprintX(sprints, '2026-05-03')).toBeCloseTo(1 + frac); // 1.5 — halfway through sprint 1
      });

      it('is sprints.length when the date is at/after the last sprint end (no cutoff)', () => {
        expect(freezeSprintX(sprints, sp2.endISO)).toBe(2);
        expect(freezeSprintX(sprints, '2026-06-01')).toBe(2);
      });
    });

    describe('streamCapacityCtx', () => {
      it('reuses the base capacity (identity) when the stream has no override', () => {
        const r = freezeRelease('2026-04-20');
        const base = releaseCapacity(r, team(1, 100), before);
        expect(streamCapacityCtx(r, team(1, 100), ws(null), base, before)).toBe(base);
      });

      it('reuses the base capacity for the Unassigned bucket (ws null)', () => {
        const r = freezeRelease('2026-04-20');
        const base = releaseCapacity(r, team(1, 100), before);
        expect(streamCapacityCtx(r, team(1, 100), null, base, before)).toBe(base);
      });

      it("recomputes against the stream's own freeze when it overrides", () => {
        const r = freezeRelease('2026-04-20'); // release freeze excludes sp2
        const base = releaseCapacity(r, team(1, 100), before);
        expect(base.remainingSprintCount).toBe(1);
        const streamCtx = streamCapacityCtx(r, team(1, 100), ws('2026-05-10'), base, before);
        expect(streamCtx).not.toBe(base);
        expect(streamCtx.remainingSprintCount).toBe(2); // stream freeze reaches through sp2
        expect(streamCtx.teamRemainingCap).toBe(200);
      });
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
      expect(f.summary).toContain('sprints required at 2 eng');
      expect(f.summary).toContain('(3 sprints remain)'); // ctx has 3 remaining sprints
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

  describe('streamRunway', () => {
    const ctx = () => releaseCapacity(calRelease(), team(4, 40)); // perEngineerCap 30, 3 remaining sprints
    const noContention = streamContention([], 4); // scale 1 → effective cap == nominal
    const opts = (over: Partial<{ itemsBeyondNext: number; muted: boolean }> = {}) => ({ itemsBeyondNext: 2, muted: false, ...over });
    // A fully-estimated health with custom remaining (totalPts == remaining + done).
    const estimated = (remainingPts: number, donePts = 0, itemCount = 3): StreamHealth =>
      ({ itemCount, totalPts: remainingPts + donePts, donePts, remainingPts, blockedPts: 0, pct: 0, pointsByStatus: [] });

    it('is unplanned (un-judgeable) when the stream has no items', () => {
      const r = streamRunway(hp(0, 0), 2, ctx(), noContention, opts());
      expect(r.verdict).toBe('unplanned');
      expect(r.judgeable).toBe(false);
      expect(r.alarm).toBe(false);
      expect(r.summary).toContain('reserved'); // surfaces the held capacity that can't be assessed
    });

    it('is unestimated (un-judgeable) when items exist but carry no points', () => {
      const noPoints: StreamHealth = { itemCount: 4, totalPts: 0, donePts: 0, remainingPts: 0, blockedPts: 0, pct: 0, pointsByStatus: [] };
      const r = streamRunway(noPoints, 2, ctx(), noContention, opts());
      expect(r.verdict).toBe('unestimated');
      expect(r.judgeable).toBe(false);
    });

    it('is unconfigured (un-judgeable) when engineersRequired is null', () => {
      const r = streamRunway(estimated(50), null, ctx(), noContention, opts());
      expect(r.verdict).toBe('unconfigured');
      expect(r.judgeable).toBe(false);
    });

    it('is planned when created work fills most of the held capacity', () => {
      // availableCap = 2 × 30 = 60; created 50 → unclaimed 10 = 0.5 sprints ≤ tolerance.
      const r = streamRunway(estimated(50), 2, ctx(), noContention, opts());
      expect(r.verdict).toBe('planned');
      expect(r.availableCap).toBe(60);
      expect(r.unclaimedRunway).toBe(10);
      expect(r.judgeable).toBe(true);
      expect(r.alarm).toBe(false);
    });

    it('is under-planned with an alarm when capacity is unclaimed and nothing is created beyond next', () => {
      // availableCap 60; created 10 → unclaimed 50 = 2.5 sprints > tolerance.
      const r = streamRunway(estimated(10), 2, ctx(), noContention, opts({ itemsBeyondNext: 0 }));
      expect(r.verdict).toBe('under-planned');
      expect(r.unclaimedRunway).toBe(50);
      expect(r.unclaimedSprints).toBeCloseTo(2.5);
      expect(r.alarm).toBe(true);
      expect(r.summary).toContain('pts over 3 sprints remaining at 2 eng capacity remaining');
      expect(r.summary).toContain('nothing created beyond the next sprint');
    });

    it('does not alarm when work is created beyond the next sprint', () => {
      const r = streamRunway(estimated(10), 2, ctx(), noContention, opts({ itemsBeyondNext: 3 }));
      expect(r.verdict).toBe('under-planned');
      expect(r.alarm).toBe(false);
    });

    it('mute silences the alarm but never promotes to green', () => {
      const r = streamRunway(estimated(10), 2, ctx(), noContention, opts({ itemsBeyondNext: 0, muted: true }));
      expect(r.verdict).toBe('under-planned'); // still flagged, not planned/green
      expect(r.alarm).toBe(false);
      expect(r.summary).toContain('muted');
    });

    it('never reads "0 remaining" as on-track: a finished-but-undersized stream is under-planned', () => {
      // All created work complete (remaining 0) but capacity is still held for 3 sprints.
      const r = streamRunway(estimated(0, 30), 2, ctx(), noContention, opts({ itemsBeyondNext: 0 }));
      expect(r.verdict).toBe('under-planned');
      expect(r.createdRemainingPts).toBe(0);
      expect(r.unclaimedRunway).toBe(60);
    });

    it('is complete when no sprints remain', () => {
      const over: ReleaseCapacity = { remainingSprintCount: 0, teamRemainingCap: 0, contributingCount: 4, perEngineerCap: 0 };
      const r = streamRunway(estimated(50), 2, over, noContention, opts());
      expect(r.verdict).toBe('complete');
      expect(r.judgeable).toBe(true);
    });

    it('uses contention-adjusted capacity so an overbooked, over-capacity stream is not under-planned', () => {
      // Mirrors the real Search-Revamp case: with the team overbooked, the stream's
      // effective share shrinks below its remaining work, so there is no "unclaimed"
      // capacity and it can't read under-planned while the forecast calls it at-risk.
      const contended = streamContention([2, 3, 4, 3], 4); // totalRequired 12, scale 1/3
      const r = streamRunway(estimated(35), 2, ctx(), contended, opts({ itemsBeyondNext: 0 }));
      // effective cap = 2 × (1/3) × 30 = 20 < 35 remaining → nothing unclaimed.
      expect(r.contended).toBe(true);
      expect(r.availableCap).toBeCloseTo(20);
      expect(r.unclaimedRunway).toBe(0);
      expect(r.verdict).not.toBe('under-planned');
      // Without contention the same stream WOULD look under-planned (nominal 60 vs 35).
      expect(streamRunway(estimated(35), 2, ctx(), noContention, opts()).verdict).toBe('under-planned');
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
      { id: 'e1', name: 'Sprint 1', startISO: addDays(today, -42), endISO: addDays(today, -29), daysOff: 0, externalId: null, plannedVelocity: null },
      { id: 'e2', name: 'Sprint 2', startISO: addDays(today, -28), endISO: addDays(today, -15), daysOff: 0, externalId: null, plannedVelocity: null },
      { id: 'a',  name: 'Sprint 3', startISO: addDays(today, -5),  endISO: addDays(today, 9),   daysOff: 0, externalId: null, plannedVelocity: null },
    ],
    codeFreezeISO: null,
    sprintLengthDays: 14,
  } as Release);

  const item = (sprintId: string, status: WorkItem['status'], points: number): WorkItem =>
    ({ id: Math.random().toString(), releaseId: 'r', workStreamId: null, sprintId, key: 'K', subject: 's', description: '', status, points } as WorkItem);

  it('measures only elapsed sprints and rolls up attainment', () => {
    const r = mkRelease();
    const items = [
      item('e1', 'Complete', 30),
      item('e2', 'Complete', 20),
      item('e2', 'In Progress', 100),  // not complete → excluded from actual
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
      { id: 'a', name: 'Sprint 1', startISO: addDays(today, -5), endISO: addDays(today, 9), daysOff: 0, externalId: null, plannedVelocity: null },
    ] };
    const v = velocityAttainment(r, team(1, 40), [], today);
    expect(elapsedSprints(r, today)).toHaveLength(0);
    expect(v.attainmentPct).toBeNull();
    expect(v.verdict).toBe('none');
  });

  it("reports no-baseline when sprints have elapsed but the team velocity is unset", () => {
    // Connector default: sprints have run, but velocity is still 0 → no planned total.
    const r = mkRelease();
    const items = [item('e1', 'Complete', 12), item('e2', 'Complete', 8)];
    const v = velocityAttainment(r, team(4, 0), items, today);
    expect(elapsedSprints(r, today)).toHaveLength(2); // sprints DID elapse
    expect(v.totalPlanned).toBe(0);
    expect(v.totalActual).toBe(20); // delivery is still measured
    expect(v.attainmentPct).toBeNull();
    expect(v.verdict).toBe('no-baseline'); // not the misleading 'none'
  });

  it('treats a frozen plannedVelocity of 0 as no baseline, re-deriving live', () => {
    // A sprint stamped 0 while the velocity was unset must not stay trapped at 0
    // once a real velocity is set — plannedVel re-derives it.
    const r = mkRelease();
    r.sprints[0].plannedVelocity = 0; // stale zero baseline
    const v = velocityAttainment(r, team(1, 40), [item('e1', 'Complete', 40)], today);
    expect(v.perSprint[0].planned).toBe(40); // re-derived from the now-set velocity, not 0
  });

  it('reads a frozen plannedVelocity baseline instead of the live derivation', () => {
    const r = mkRelease();
    // Freeze e1 at 40 (its commitment); leave e2 live.
    r.sprints[0].plannedVelocity = 40;
    const items = [item('e1', 'Complete', 20), item('e2', 'Complete', 20)];
    // Lower the team velocity to 28. e1 stays planned-40 (frozen); e2 redraws to 28.
    const v = velocityAttainment(r, team(1, 28), items, today);
    expect(v.perSprint.map((s) => s.planned)).toEqual([40, 28]);
    expect(v.totalPlanned).toBe(68); // 40 (frozen) + 28 (live) — past not rewritten
  });
});

describe('plannedVel', () => {
  it('returns the frozen baseline when present, ignoring the live velocity', () => {
    const sp = { ...sprint('2026-04-13', '2026-04-26'), plannedVelocity: 33 };
    expect(plannedVel(team(2, 50), sp)).toBe(33);
  });
  it('derives live from team velocity when the baseline is null', () => {
    const sp = sprint('2026-04-13', '2026-04-26'); // 10 business days, daysOff 0
    expect(plannedVel(team(1, 40), sp)).toBe(40); // == sprintVel
  });
});

describe('velocitySuggestion', () => {
  const today = todayISO();
  const mkRelease = (): Release => ({
    id: 'r', name: 'R', startISO: addDays(today, -56), teamId: 't',
    workStreams: [], events: [], codeFreezeISO: null, externalId: null, connector: null, sync: null, sprintLengthDays: 14,
    sprints: [
      { id: 'e1', name: 'S1', startISO: addDays(today, -56), endISO: addDays(today, -43), daysOff: 0, externalId: null, plannedVelocity: 40 },
      { id: 'e2', name: 'S2', startISO: addDays(today, -42), endISO: addDays(today, -29), daysOff: 0, externalId: null, plannedVelocity: 40 },
      { id: 'e3', name: 'S3', startISO: addDays(today, -28), endISO: addDays(today, -15), daysOff: 0, externalId: null, plannedVelocity: 40 },
      { id: 'a',  name: 'S4', startISO: addDays(today, -5),  endISO: addDays(today, 9),   daysOff: 0, externalId: null, plannedVelocity: null },
    ],
  } as Release);
  const item = (sprintId: string, points: number): WorkItem =>
    ({ id: Math.random().toString(), releaseId: 'r', workStreamId: null, sprintId, status: 'Complete', points } as WorkItem);

  it('averages the last N elapsed sprints and flags a material gap', () => {
    const r = mkRelease();
    const items = [item('e1', 8), item('e2', 12), item('e3', 13), item('a', 999)];
    const s = velocitySuggestion(r, team(1, 40), items, 3, today)!;
    expect(s.sampleSize).toBe(3);
    expect(s.recentAvg).toBe(11); // round((8+12+13)/3)
    expect(s.currentVelocity).toBe(40);
    expect(s.delta).toBe(-29);
    expect(s.meaningful).toBe(true);
  });

  it('windows to the most recent sprints', () => {
    const r = mkRelease();
    const items = [item('e1', 100), item('e2', 10), item('e3', 10)]; // e1 outside a 2-window
    const s = velocitySuggestion(r, team(1, 40), items, 2, today)!;
    expect(s.sampleSize).toBe(2);
    expect(s.recentAvg).toBe(10);
  });

  it('is not meaningful when recent delivery tracks the set velocity', () => {
    const r = mkRelease();
    const items = [item('e1', 39), item('e2', 41), item('e3', 40)];
    const s = velocitySuggestion(r, team(1, 40), items, 3, today)!;
    expect(s.recentAvg).toBe(40);
    expect(s.meaningful).toBe(false);
  });

  it('returns null when no sprint has elapsed', () => {
    const r: Release = { ...mkRelease(), sprints: [
      { id: 'a', name: 'S1', startISO: addDays(today, -5), endISO: addDays(today, 9), daysOff: 0, externalId: null, plannedVelocity: null },
    ] };
    expect(velocitySuggestion(r, team(1, 40), [], 3, today)).toBeNull();
  });
});
