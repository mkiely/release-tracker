import { describe, expect, it } from 'vitest';
import { anItem } from '../test/factories';
import {
  barGeometry,
  clampPct,
  pctOfDate,
  spanOfItems,
  sprintIndex,
  timelineWindow,
  type TimelineSprint,
} from './streamTimeline';
import type { Sprint } from '../types';

// Three contiguous 14-day sprints: Apr 13 – May 24 (41 days inclusive).
const SPRINTS: TimelineSprint[] = [
  { name: 'S1', startISO: '2026-04-13', endISO: '2026-04-26' },
  { name: 'S2', startISO: '2026-04-27', endISO: '2026-05-10' },
  { name: 'S3', startISO: '2026-05-11', endISO: '2026-05-24' },
];
const WINDOW = timelineWindow(SPRINTS)!;

const byId = sprintIndex([
  { id: 'sp1' } as Sprint,
  { id: 'sp2' } as Sprint,
  { id: 'sp3' } as Sprint,
]);

describe('spanOfItems', () => {
  it('spans the first through the last sprint holding work', () => {
    const items = [
      anItem({ id: 'a', sprintId: 'sp3' }),
      anItem({ id: 'b', sprintId: 'sp1' }),
      anItem({ id: 'c', sprintId: 'sp2' }),
    ];
    expect(spanOfItems(items, byId)).toEqual({ startIdx: 0, endIdx: 2 });
  });

  it('collapses to a single sprint when all the work is in one', () => {
    expect(spanOfItems([anItem({ id: 'a', sprintId: 'sp2' })], byId)).toEqual({ startIdx: 1, endIdx: 1 });
  });

  it('is null when nothing is in a sprint — an unscheduled stream has no position', () => {
    // A backlog item must not stretch the bar across the whole release: that would
    // claim a plan the stream doesn't have.
    expect(spanOfItems([anItem({ id: 'a', sprintId: null })], byId)).toBeNull();
    expect(spanOfItems([], byId)).toBeNull();
  });

  it('ignores an item pointing at a sprint the release no longer has', () => {
    const items = [anItem({ id: 'a', sprintId: 'sp_deleted' }), anItem({ id: 'b', sprintId: 'sp2' })];
    expect(spanOfItems(items, byId)).toEqual({ startIdx: 1, endIdx: 1 });
  });

  it('is null when every item points at a missing sprint', () => {
    expect(spanOfItems([anItem({ id: 'a', sprintId: 'sp_deleted' })], byId)).toBeNull();
  });
});

describe('timelineWindow', () => {
  it('runs from the earliest start to the latest end', () => {
    expect(WINDOW).toEqual({ startISO: '2026-04-13', endISO: '2026-05-24' });
  });

  it('does not assume the sprints arrive in order', () => {
    expect(timelineWindow([SPRINTS[2], SPRINTS[0], SPRINTS[1]])).toEqual(WINDOW);
  });

  it('is null with no sprints — there is no axis to draw', () => {
    expect(timelineWindow([])).toBeNull();
  });
});

describe('pctOfDate', () => {
  it('puts the window bounds at 0 and 100', () => {
    expect(pctOfDate('2026-04-13', WINDOW)).toBe(0);
    expect(pctOfDate('2026-05-24', WINDOW)).toBe(100);
  });

  it('places an interior date by real elapsed time, not by sprint index', () => {
    // Apr 27 is day 14 of 41 — a third of the way in, NOT the 1/3 a three-sprint
    // grid would put it at by index. This difference is the reason the view exists.
    expect(Math.round(pctOfDate('2026-04-27', WINDOW))).toBe(34);
  });

  it('returns values outside 0–100 for dates outside the window, so callers can decide', () => {
    expect(pctOfDate('2026-04-06', WINDOW)).toBeLessThan(0);
    expect(pctOfDate('2026-06-01', WINDOW)).toBeGreaterThan(100);
  });

  it('is 0 for a zero-width window rather than dividing by zero', () => {
    expect(pctOfDate('2026-04-13', { startISO: '2026-04-13', endISO: '2026-04-13' })).toBe(0);
  });
});

describe('clampPct', () => {
  it('holds a value inside the track', () => {
    expect(clampPct(-20)).toBe(0);
    expect(clampPct(140)).toBe(100);
    expect(clampPct(42)).toBe(42);
  });
});

describe('barGeometry', () => {
  it('runs from the first sprint\'s start to the last sprint\'s end', () => {
    const geo = barGeometry({ startIdx: 0, endIdx: 2 }, SPRINTS, WINDOW);
    expect(geo.leftPct).toBe(0);
    expect(Math.round(geo.widthPct)).toBe(100);
  });

  it('covers a single sprint\'s own days, not a point', () => {
    const geo = barGeometry({ startIdx: 1, endIdx: 1 }, SPRINTS, WINDOW);
    expect(Math.round(geo.leftPct)).toBe(34);
    // Apr 27 – May 10 is 13/41 of the window.
    expect(Math.round(geo.widthPct)).toBe(32);
  });

  it('widens a sliver to the minimum, so a short sprint never reads as "no work"', () => {
    const long: TimelineSprint[] = [
      { name: 'One day', startISO: '2026-04-13', endISO: '2026-04-13' },
      { name: 'The rest', startISO: '2026-04-14', endISO: '2027-04-13' },
    ];
    const w = timelineWindow(long)!;
    expect(barGeometry({ startIdx: 0, endIdx: 0 }, long, w).widthPct).toBe(1.5);
  });

  it('keeps a widened bar at the far edge inside the track', () => {
    const long: TimelineSprint[] = [
      { name: 'The bulk', startISO: '2026-04-13', endISO: '2027-04-12' },
      { name: 'Last day', startISO: '2027-04-13', endISO: '2027-04-13' },
    ];
    const w = timelineWindow(long)!;
    const geo = barGeometry({ startIdx: 1, endIdx: 1 }, long, w);
    expect(geo.leftPct + geo.widthPct).toBeLessThanOrEqual(100);
  });

  it('is a zero-width no-op when the span points outside the sprint list', () => {
    expect(barGeometry({ startIdx: 9, endIdx: 9 }, SPRINTS, WINDOW)).toEqual({ leftPct: 0, widthPct: 0 });
  });
});
