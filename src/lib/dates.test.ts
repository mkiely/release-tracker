import { describe, expect, it } from 'vitest';
import { addDays, between, buildSprints, dOf, fmtShort, isoOf } from './dates';

describe('isoOf / dOf', () => {
  it('round-trips a date without timezone drift', () => {
    const d = new Date(2026, 3, 13); // Apr 13 local
    expect(isoOf(d)).toBe('2026-04-13');
    expect(dOf('2026-04-13').getMonth()).toBe(3);
    expect(dOf('2026-04-13').getDate()).toBe(13);
  });

  it('handles month/year boundaries', () => {
    expect(isoOf(new Date(2026, 11, 31))).toBe('2026-12-31');
    expect(dOf('2026-12-31').getFullYear()).toBe(2026);
    expect(dOf('2026-12-31').getMonth()).toBe(11);
    expect(dOf('2026-12-31').getDate()).toBe(31);
  });
});

describe('addDays', () => {
  it('adds positive days within a month', () => {
    expect(addDays('2026-04-13', 7)).toBe('2026-04-20');
  });

  it('crosses month boundaries', () => {
    expect(addDays('2026-04-26', 1)).toBe('2026-04-27');
    expect(addDays('2026-04-30', 1)).toBe('2026-05-01');
  });

  it('crosses year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('subtracts days with negative n', () => {
    expect(addDays('2026-04-13', -1)).toBe('2026-04-12');
    expect(addDays('2026-05-01', -1)).toBe('2026-04-30');
  });

  it('returns the same date for n = 0', () => {
    expect(addDays('2026-04-13', 0)).toBe('2026-04-13');
  });
});

describe('fmtShort', () => {
  it('formats as "Mon D" without zero-padding', () => {
    expect(fmtShort('2026-04-13')).toBe('Apr 13');
    expect(fmtShort('2026-01-05')).toBe('Jan 5');
    expect(fmtShort('2026-12-01')).toBe('Dec 1');
  });
});

describe('between', () => {
  it('returns true when the date is inside the range', () => {
    expect(between('2026-04-20', '2026-04-13', '2026-04-26')).toBe(true);
  });

  it('is inclusive on both boundaries', () => {
    expect(between('2026-04-13', '2026-04-13', '2026-04-26')).toBe(true);
    expect(between('2026-04-26', '2026-04-13', '2026-04-26')).toBe(true);
  });

  it('returns false when outside the range', () => {
    expect(between('2026-04-12', '2026-04-13', '2026-04-26')).toBe(false);
    expect(between('2026-04-27', '2026-04-13', '2026-04-26')).toBe(false);
  });

  it('works for a single-day range', () => {
    expect(between('2026-04-13', '2026-04-13', '2026-04-13')).toBe(true);
    expect(between('2026-04-14', '2026-04-13', '2026-04-13')).toBe(false);
  });
});

describe('buildSprints', () => {
  it('builds the requested number of sprints', () => {
    expect(buildSprints('2026-04-13', {}, 4)).toHaveLength(4);
    expect(buildSprints('2026-04-13', {}, 8)).toHaveLength(8);
  });

  it('names sprints sequentially from 1', () => {
    const sprints = buildSprints('2026-04-13', {}, 3);
    expect(sprints.map((s) => s.name)).toEqual(['Sprint 1', 'Sprint 2', 'Sprint 3']);
  });

  it('produces contiguous 14-day windows', () => {
    const sprints = buildSprints('2026-04-13', {}, 3);
    expect(sprints[0].startISO).toBe('2026-04-13');
    expect(sprints[0].endISO).toBe('2026-04-26');
    expect(sprints[1].startISO).toBe('2026-04-27');
    expect(sprints[1].endISO).toBe('2026-05-10');
    expect(sprints[2].startISO).toBe('2026-05-11');
  });

  it('applies daysOff overrides by 1-based position', () => {
    const sprints = buildSprints('2026-04-13', { 1: 3, 3: 5 }, 4);
    expect(sprints[0].daysOff).toBe(3);
    expect(sprints[1].daysOff).toBe(0);
    expect(sprints[2].daysOff).toBe(5);
    expect(sprints[3].daysOff).toBe(0);
  });

  it('gives each sprint a unique id', () => {
    const sprints = buildSprints('2026-04-13', {}, 4);
    const ids = new Set(sprints.map((s) => s.id));
    expect(ids.size).toBe(4);
  });

  it('sets externalId to null for all sprints', () => {
    const sprints = buildSprints('2026-04-13', {}, 3);
    expect(sprints.every((s) => s.externalId === null)).toBe(true);
  });
});
