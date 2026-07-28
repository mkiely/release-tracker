import { describe, expect, it } from 'vitest';
import { assessStream, assessStreams } from './streamAssessment';
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
