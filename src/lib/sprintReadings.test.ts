import { describe, expect, it } from 'vitest';
import { buildSprintReading, isUnderway, sameReading } from './sprintReadings';
import { aRelease, aSprint, aStream, aTeamOf, anItem } from '../test/factories';

const release = aRelease({ workStreams: [aStream({ id: 'ws1', engineersRequired: 2 }), aStream({ id: 'ws2', name: 'UI' })] });
const [sp1] = release.sprints;
const team = aTeamOf(3, 30, 1);

describe('buildSprintReading', () => {
  it('lists only the items in this sprint, copying what keeps the reading legible later', () => {
    const items = [
      anItem({ id: 'a', key: 'K-1', sprintId: 'sp1', points: 3, status: 'In Progress' }),
      anItem({ id: 'b', key: 'K-2', sprintId: 'sp2', points: 5 }),
      anItem({ id: 'c', key: 'K-3', sprintId: null, points: 2 }),
    ];
    const r = buildSprintReading(release, team, sp1, items, '2026-04-15');
    expect(r.dateISO).toBe('2026-04-15');
    expect(r.items).toEqual([{ id: 'a', key: 'K-1', points: 3, workStreamId: 'ws1', status: 'In Progress' }]);
  });

  it('counts the contributing roster only — an EM is not capacity', () => {
    expect(buildSprintReading(release, team, sp1, [], '2026-04-15').contributingCount).toBe(3);
    expect(buildSprintReading(release, undefined, sp1, [], '2026-04-15').contributingCount).toBe(0);
  });

  it('records release-wide scope per stream, every sprint and the backlog included', () => {
    const items = [
      anItem({ workStreamId: 'ws1', sprintId: 'sp1', points: 3, status: 'Complete' }),
      anItem({ workStreamId: 'ws1', sprintId: 'sp2', points: 5 }),
      anItem({ workStreamId: 'ws1', sprintId: null, points: null }),
    ];
    const r = buildSprintReading(release, team, sp1, items, '2026-04-15');
    expect(r.streams).toEqual([
      { workStreamId: 'ws1', scopePts: 8, remainingPts: 5, engineersRequired: 2 },
      { workStreamId: 'ws2', scopePts: 0, remainingPts: 0, engineersRequired: null },
    ]);
  });

  it('gathers unstreamed items — and ones whose stream is gone — under a null entry', () => {
    const items = [
      anItem({ workStreamId: null, points: 2 }),
      anItem({ workStreamId: 'ws_deleted', points: 3, status: 'Complete' }),
    ];
    const r = buildSprintReading(release, team, sp1, items, '2026-04-15');
    expect(r.streams.at(-1)).toEqual({ workStreamId: null, scopePts: 5, remainingPts: 2, engineersRequired: null });
  });

  it('adds no null entry when every item has a stream', () => {
    const r = buildSprintReading(release, team, sp1, [anItem()], '2026-04-15');
    expect(r.streams.map((s) => s.workStreamId)).toEqual(['ws1', 'ws2']);
  });
});

describe('sameReading', () => {
  it('ignores the day a reading was taken, and nothing else', () => {
    const items = [anItem({ id: 'a' })];
    const monday = buildSprintReading(release, team, sp1, items, '2026-04-13');
    const tuesday = buildSprintReading(release, team, sp1, items, '2026-04-14');
    expect(sameReading(monday, tuesday)).toBe(true);
    const moved = buildSprintReading(release, team, sp1, [anItem({ id: 'a', status: 'Complete' })], '2026-04-14');
    expect(sameReading(monday, moved)).toBe(false);
  });
});

describe('isUnderway', () => {
  it('holds on both inclusive ends and nowhere outside them', () => {
    const sp = aSprint({ startISO: '2026-04-13', endISO: '2026-04-26' });
    expect(isUnderway(sp, '2026-04-12')).toBe(false);
    expect(isUnderway(sp, '2026-04-13')).toBe(true);
    expect(isUnderway(sp, '2026-04-26')).toBe(true);
    expect(isUnderway(sp, '2026-04-27')).toBe(false);
  });
});
