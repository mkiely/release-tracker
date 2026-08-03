import { describe, expect, it } from 'vitest';
import { assessRelease, assessStream, assessStreams } from './streamAssessment';
import { aRelease, aSprint, aStream, aTeamOf, anItem } from '../test/factories';
import { addDays, todayISO } from './dates';
import type { Release } from '../types';

// Sprints must lie ahead of today or there is no forward capacity to assess.
const future = (): Release => {
  const start = addDays(todayISO(), 1);
  return aRelease({
    startISO: start,
    sprints: [
      aSprint({ id: 'sp1', name: 'S1', startISO: start, endISO: addDays(start, 13) }),
      aSprint({ id: 'sp2', name: 'S2', startISO: addDays(start, 14), endISO: addDays(start, 27) }),
      aSprint({ id: 'sp3', name: 'S3', startISO: addDays(start, 28), endISO: addDays(start, 41) }),
    ],
  });
};

const team = aTeamOf(4, 40);

describe('assessStreams', () => {
  it('assesses every stream in release order and keys them by id', () => {
    const r = future();
    r.workStreams = [aStream({ id: 'ws1', name: 'A' }), aStream({ id: 'ws2', name: 'B' })];
    const a = assessStreams(r, team, [], { today: todayISO() });
    expect(a.streams.map((s) => s.ws?.id)).toEqual(['ws1', 'ws2']);
    expect(a.byId.get('ws2')?.ws?.name).toBe('B');
  });

  it('appends the caller-supplied unassigned bucket, keyed null', () => {
    const r = future();
    r.workStreams = [aStream({ id: 'ws1' })];
    const orphan = anItem({ id: 'i1', workStreamId: null, sprintId: 'sp1', points: 5 });
    const a = assessStreams(r, team, [orphan], { today: todayISO(), unassignedItems: [orphan] });
    expect(a.streams.map((s) => s.ws?.id ?? null)).toEqual(['ws1', null]);
    // No engineer reservation is possible for the bucket, so it can't be assessed.
    expect(a.byId.get(null)?.forecast.verdict).toBe('unconfigured');
  });

  it('omits the unassigned bucket when the caller supplies none', () => {
    const r = future();
    r.workStreams = [aStream({ id: 'ws1' })];
    const orphan = anItem({ id: 'i1', workStreamId: null, sprintId: 'sp1', points: 5 });
    expect(assessStreams(r, team, [orphan], { today: todayISO() }).byId.has(null)).toBe(false);
  });

  it('counts contention across every stream with work, not just the ones a caller shows', () => {
    // 4 engineers demanded against a 4-person team is exactly booked; the same two
    // streams assessed in isolation would each look uncontended.
    const r = future();
    r.workStreams = [
      aStream({ id: 'ws1', name: 'A', engineersRequired: 3 }),
      aStream({ id: 'ws2', name: 'B', engineersRequired: 3 }),
    ];
    const items = [
      anItem({ id: 'i1', workStreamId: 'ws1', sprintId: 'sp1', points: 80 }),
      anItem({ id: 'i2', workStreamId: 'ws2', sprintId: 'sp1', points: 80 }),
    ];
    const a = assessStreams(r, team, items, { today: todayISO() });
    expect(a.contention.totalRequired).toBe(6);
    expect(a.contention.overAllocated).toBe(true);
    expect(a.byId.get('ws1')!.forecast.contended).toBe(true);
  });

  it('excludes finished streams from contention — a done stream holds nobody', () => {
    const r = future();
    r.workStreams = [
      aStream({ id: 'ws1', name: 'A', engineersRequired: 3 }),
      aStream({ id: 'ws2', name: 'B', engineersRequired: 3 }),
    ];
    const items = [
      anItem({ id: 'i1', workStreamId: 'ws1', sprintId: 'sp1', points: 80 }),
      anItem({ id: 'i2', workStreamId: 'ws2', sprintId: 'sp1', points: 80, status: 'Complete' }),
    ];
    expect(assessStreams(r, team, items, { today: todayISO() }).contention.totalRequired).toBe(3);
  });

  it('honors a stream freeze override with its own capacity window', () => {
    const r = future();
    // ws2 freezes at the end of sprint 1; ws1 inherits the release-wide window.
    r.workStreams = [aStream({ id: 'ws1' }), aStream({ id: 'ws2', codeFreezeISO: r.sprints[0].endISO })];
    const a = assessStreams(r, team, [], { today: todayISO() });
    expect(a.byId.get('ws1')!.ctx.remainingSprintCount).toBe(3);
    expect(a.byId.get('ws2')!.ctx.remainingSprintCount).toBe(1);
  });

  it('splits remaining work at the freeze and reports the post-freeze remainder', () => {
    const r = future();
    r.workStreams = [aStream({ id: 'ws1', engineersRequired: 1, codeFreezeISO: r.sprints[0].endISO })];
    const items = [
      anItem({ id: 'i1', workStreamId: 'ws1', sprintId: 'sp1', points: 5 }),
      anItem({ id: 'i2', workStreamId: 'ws1', sprintId: 'sp3', points: 8 }),
    ];
    const a = assessStreams(r, team, items, { today: todayISO() }).byId.get('ws1')!;
    expect(a.preFreezePts).toBe(5);
    expect(a.postFreezePts).toBe(8);
    // The forecast measures only the pre-freeze slice, and reports the rest separately.
    expect(a.forecast.remainingPts).toBe(5);
    expect(a.forecast.postFreezeRemainingPts).toBe(8);
  });

  it('feeds forecast and runway the same baseline, so the two can never contradict', () => {
    // The invariant docs/metrics.md turns on: a stream is never both "too much work"
    // and "too little work planned". Swept across a range of remaining work.
    const r = future();
    for (const pts of [0, 5, 20, 50, 80, 120, 200]) {
      r.workStreams = [aStream({ id: 'ws1', engineersRequired: 2 })];
      const items = pts > 0 ? [anItem({ id: 'i1', workStreamId: 'ws1', sprintId: 'sp1', points: pts })] : [];
      const { forecast, runway } = assessStreams(r, team, items, { today: todayISO() }).byId.get('ws1')!;
      expect(forecast.verdict === 'at-risk' && runway.verdict === 'under-planned').toBe(false);
      // And the corollary the chips depend on: under-planned never rides a green
      // delivery verdict without saying so — it is only ever paired with a
      // non-risk verdict, which is exactly why it needs its own chip.
      if (runway.verdict === 'under-planned') expect(forecast.verdict).not.toBe('at-risk');
    }
  });

  it('reads a stream whose own freeze has passed, with work outstanding, as at-risk', () => {
    // The compound that used to score green: an override already behind us, so the
    // pre-freeze slice is empty and the shortfall arithmetic "fits", while real work
    // sits in a sprint past the freeze with no window left to land in.
    const today = '2026-07-28';
    const r = aRelease({
      startISO: '2026-07-04',
      codeFreezeISO: '2026-08-17',
      workStreams: [aStream({ id: 'ws1', engineersRequired: 1, codeFreezeISO: '2026-07-17' })],
      sprints: [
        aSprint({ id: 'sp1', name: 'S1', startISO: '2026-07-04', endISO: '2026-07-17' }),
        aSprint({ id: 'sp2', name: 'S2', startISO: '2026-07-18', endISO: '2026-08-07' }),
      ],
    });
    const items = [anItem({ id: 'i1', workStreamId: 'ws1', sprintId: 'sp2', points: 3 })];
    const { forecast, runway, preFreezePts, postFreezePts, ctx } = assessStreams(r, team, items, { today }).byId.get('ws1')!;
    expect(ctx.remainingSprintCount).toBe(0);
    expect(preFreezePts).toBe(0);
    expect(postFreezePts).toBe(3);
    expect(forecast.verdict).toBe('at-risk');
    // The planning chip beside it correctly reports there is nothing left to plan.
    expect(runway.verdict).toBe('complete');
  });

  it('reads an empty stream holding engineers as no-work + unplanned, never green', () => {
    const r = future();
    r.workStreams = [aStream({ id: 'ws1', engineersRequired: 2 })];
    const { forecast, runway } = assessStreams(r, team, [], { today: todayISO() }).byId.get('ws1')!;
    expect(forecast.verdict).toBe('no-work');
    expect(runway.verdict).toBe('unplanned');
    expect(runway.judgeable).toBe(false);
  });
});

describe('assessRelease', () => {
  // Two streams reserving 3 engineers each against a team of 4: overbooked, and
  // overbooked for the whole cycle no matter what lands.
  const overbooked = () => {
    const r = future();
    r.workStreams = [
      aStream({ id: 'ws1', name: 'A', engineersRequired: 3 }),
      aStream({ id: 'ws2', name: 'B', engineersRequired: 3 }),
    ];
    return r;
  };

  it('counts every stream that carried work, so completion cannot improve the verdict', () => {
    const r = overbooked();
    const open = [
      anItem({ id: 'i1', workStreamId: 'ws1', sprintId: 'sp1', points: 40 }),
      anItem({ id: 'i2', workStreamId: 'ws2', sprintId: 'sp1', points: 40 }),
    ];
    // The same release with stream B entirely finished.
    const bDone = [open[0], { ...open[1], status: 'Complete' as const }];

    expect(assessRelease(r, team, open).contention.totalRequired).toBe(6);
    expect(assessRelease(r, team, bDone).contention.totalRequired).toBe(6);
    expect(assessRelease(r, team, bDone).contention.overAllocated).toBe(true);

    // The forward view moves, correctly — that contrast is the whole point of
    // having both. B's engineers are genuinely free from here.
    expect(assessStreams(r, team, open, { today: todayISO() }).contention.totalRequired).toBe(6);
    expect(assessStreams(r, team, bDone, { today: todayISO() }).contention.totalRequired).toBe(3);
  });

  it('ignores streams that never carried work, reserved or not', () => {
    const r = overbooked();
    // ws2 holds a reservation but no items ever landed in it: nothing to account for.
    const items = [anItem({ id: 'i1', workStreamId: 'ws1', sprintId: 'sp1', points: 40 })];
    expect(assessRelease(r, team, items).contention.totalRequired).toBe(3);
  });

  it('reports total scope against total capacity, unmoved by how much is done', () => {
    const r = future();
    r.workStreams = [aStream({ id: 'ws1' })];
    const items = [
      anItem({ id: 'i1', workStreamId: 'ws1', sprintId: 'sp1', points: 30, status: 'Complete' }),
      anItem({ id: 'i2', workStreamId: 'ws1', sprintId: 'sp2', points: 30 }),
    ];
    const retro = assessRelease(r, team, items);
    expect(retro.totalPts).toBe(60);
    expect(retro.donePts).toBe(30);
    // Three sprints at the team's 40-point velocity, none of it spent yet.
    expect(retro.ledger.sprintCount).toBe(3);
    expect(retro.ledger.totalCap).toBe(120);
    expect(retro.overCommitted).toBe(false);
  });

  it('flags a release carrying more scope than the team could ever deliver', () => {
    const r = future();
    r.workStreams = [aStream({ id: 'ws1' })];
    const items = [anItem({ id: 'i1', workStreamId: 'ws1', sprintId: 'sp1', points: 200 })];
    const retro = assessRelease(r, team, items);
    expect(retro.overCommitted).toBe(true);
    // 200 pts against 120 pts of whole-release capacity across 4 engineers:
    // the scope demanded ~6.7 engineers' worth of the release.
    expect(retro.streams[0].engineersImplied).toBeCloseTo(200 / 30, 5);
  });

  it('cannot be judged over-committed without a capacity baseline', () => {
    const r = future();
    r.workStreams = [aStream({ id: 'ws1' })];
    const items = [anItem({ id: 'i1', workStreamId: 'ws1', sprintId: 'sp1', points: 200 })];
    const retro = assessRelease(r, undefined, items);
    expect(retro.ledger.totalCap).toBe(0);
    expect(retro.overCommitted).toBe(false);
    expect(retro.streams[0].engineersImplied).toBe(0);
  });

  it('judges each sprint on the streams that held work in it', () => {
    const r = overbooked();
    const items = [
      // Both streams run in sp1 (3 + 3 against 4): overbooked.
      anItem({ id: 'i1', workStreamId: 'ws1', sprintId: 'sp1', points: 10 }),
      anItem({ id: 'i2', workStreamId: 'ws2', sprintId: 'sp1', points: 10 }),
      // Only A runs in sp2 (3 against 4): within capacity.
      anItem({ id: 'i3', workStreamId: 'ws1', sprintId: 'sp2', points: 10 }),
      // sp3 holds nothing.
    ];
    const { perSprint, overbookedSprints, judgedSprints } = assessRelease(r, team, items);
    expect(perSprint.map((s) => s.sprint.id)).toEqual(['sp1', 'sp2', 'sp3']);
    expect(perSprint.map((s) => s.contention.overAllocated)).toEqual([true, false, false]);
    expect(perSprint.map((s) => s.idle)).toEqual([false, false, true]);
    // The idle sprint is excluded from the denominator, not counted as healthy.
    expect(overbookedSprints).toBe(1);
    expect(judgedSprints).toBe(2);
  });

  it('keeps a completed sprint overbooked — the reading completion cannot flatter', () => {
    const r = overbooked();
    const open = [
      anItem({ id: 'i1', workStreamId: 'ws1', sprintId: 'sp1', points: 10 }),
      anItem({ id: 'i2', workStreamId: 'ws2', sprintId: 'sp1', points: 10 }),
    ];
    const done = open.map((i) => ({ ...i, status: 'Complete' as const }));
    expect(assessRelease(r, team, done).perSprint[0].contention.overAllocated).toBe(true);
    expect(assessRelease(r, team, done).overbookedSprints).toBe(1);
  });

  it('counts a stream toward its sprint even with no reservation to contend with', () => {
    const r = future();
    r.workStreams = [aStream({ id: 'ws1', engineersRequired: null })];
    const items = [anItem({ id: 'i1', workStreamId: 'ws1', sprintId: 'sp1', points: 10 })];
    const sp1 = assessRelease(r, team, items).perSprint[0];
    expect(sp1.idle).toBe(false); // work happened here
    expect(sp1.streamCount).toBe(1);
    expect(sp1.contention.totalRequired).toBe(0); // but nothing was reserved
  });

  it('treats a sprint holding only unassigned work as idle for allocation', () => {
    const r = overbooked();
    const items = [anItem({ id: 'i1', workStreamId: null, sprintId: 'sp1', points: 10 })];
    expect(assessRelease(r, team, items).perSprint[0].idle).toBe(true);
  });

  it('counts unassigned points in the ledger but not in contention', () => {
    const r = overbooked();
    const items = [
      anItem({ id: 'i1', workStreamId: 'ws1', sprintId: 'sp1', points: 40 }),
      anItem({ id: 'i2', workStreamId: null, sprintId: 'sp1', points: 25 }),
    ];
    const retro = assessRelease(r, team, items);
    expect(retro.totalPts).toBe(65);
    expect(retro.streams.map((s) => s.ws.id)).toEqual(['ws1', 'ws2']);
    expect(retro.contention.totalRequired).toBe(3);
  });
});

describe('assessStream', () => {
  it('returns one stream, still assessed against the full release contention', () => {
    const r = future();
    r.workStreams = [
      aStream({ id: 'ws1', engineersRequired: 3 }),
      aStream({ id: 'ws2', engineersRequired: 3 }),
    ];
    const items = [
      anItem({ id: 'i1', workStreamId: 'ws1', sprintId: 'sp1', points: 80 }),
      anItem({ id: 'i2', workStreamId: 'ws2', sprintId: 'sp1', points: 80 }),
    ];
    const one = assessStream(r, team, items, 'ws1', { today: todayISO() })!;
    expect(one.ws?.id).toBe('ws1');
    expect(one.forecast.contended).toBe(true);
  });

  it('is undefined for a stream that is not in the release', () => {
    expect(assessStream(future(), team, [], 'nope', { today: todayISO() })).toBeUndefined();
  });
});
