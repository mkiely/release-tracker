import { describe, expect, it } from 'vitest';
import { releaseToTSV } from './exportRelease';
import type { AppState, Release, WorkItem } from '../types';

// Sprint 1: Apr 13 – Apr 26, Sprint 2: Apr 27 – May 10 (contiguous 14-day ranges).
const SPRINT_DATES: Record<number, [string, string]> = {
  1: ['2026-04-13', '2026-04-26'],
  2: ['2026-04-27', '2026-05-10'],
};
const sprint = (n: number) => ({
  n,
  name: `Sprint ${n}`,
  startISO: SPRINT_DATES[n][0],
  endISO: SPRINT_DATES[n][1],
  daysOff: 0,
  externalId: null,
});

const release = (): Release => ({
  id: 'rel',
  name: 'Orion 2.0',
  startISO: '2026-04-13',
  teamId: 't',
  workStreams: [
    { id: 'ws1', name: 'Payments', externalId: null },
    { id: 'ws2', name: 'Auth', externalId: null },
  ],
  events: [],
  sprints: [sprint(1), sprint(2)],
  externalId: null,
  connector: null,
  sync: null,
});

const item = (over: Partial<WorkItem>): WorkItem => ({
  id: Math.random().toString(),
  releaseId: 'rel',
  workStreamId: 'ws1',
  sprintN: 1,
  key: 'ORN-100',
  subject: 'Item',
  description: '',
  status: 'Not Started',
  points: 1,
  externalId: null,
  ...over,
});

const state = (items: WorkItem[]): AppState => ({
  version: 1,
  teams: [],
  releases: [release()],
  items,
  meta: { lastSyncISO: null },
});

const lines = (tsv: string) => tsv.split('\n').map((l) => l.split('\t'));

// Row layout: header (0), Dates (1), Days off (2), Events (3), then work streams.
const BODY = 4;

describe('releaseToTSV', () => {
  it('has a header of Work Stream + sprint names', () => {
    const [header] = lines(releaseToTSV(state([]), 'rel'));
    expect(header).toEqual(['Work Stream', 'Sprint 1', 'Sprint 2']);
  });

  it('emits sprint metadata rows (dates, days off, events) below the header', () => {
    const r = release();
    r.sprints[0].daysOff = 3;
    r.events = [
      { id: 'ev1', label: 'Code freeze', dateISO: r.sprints[0].startISO, externalId: null },
      { id: 'ev2', label: 'Release', dateISO: r.sprints[1].endISO, externalId: null },
    ];
    const st: AppState = { version: 1, teams: [], releases: [r], items: [], meta: { lastSyncISO: null } };
    const rows = lines(releaseToTSV(st, 'rel'));
    expect(rows[1]).toEqual(['Dates', 'Apr 13 – Apr 26', 'Apr 27 – May 10']);
    expect(rows[2]).toEqual(['Days off', '3', '0']);
    expect(rows[3]).toEqual(['Events', 'Code freeze (Apr 13)', 'Release (May 10)']);
  });

  it('places items in the column for their sprint as "KEY Subject"', () => {
    const tsv = releaseToTSV(
      state([
        item({ workStreamId: 'ws1', sprintN: 1, key: 'ORN-100', subject: 'Login' }),
        item({ workStreamId: 'ws1', sprintN: 2, key: 'ORN-101', subject: 'Logout' }),
      ]),
      'rel',
    );
    const rows = lines(tsv);
    expect(rows[BODY]).toEqual(['Payments', 'ORN-100 Login', 'ORN-101 Logout']);
  });

  it('stacks multiple items in one cell into extra rows, label only on first', () => {
    const tsv = releaseToTSV(
      state([
        item({ workStreamId: 'ws1', sprintN: 1, key: 'ORN-100', subject: 'A' }),
        item({ workStreamId: 'ws1', sprintN: 1, key: 'ORN-101', subject: 'B' }),
      ]),
      'rel',
    );
    const rows = lines(tsv);
    expect(rows[BODY]).toEqual(['Payments', 'ORN-100 A', '']);
    expect(rows[BODY + 1]).toEqual(['', 'ORN-101 B', '']);
  });

  it('sorts items within a cell by key numerically', () => {
    const tsv = releaseToTSV(
      state([
        item({ key: 'ORN-100', subject: 'A' }),
        item({ key: 'ORN-9', subject: 'B' }),
      ]),
      'rel',
    );
    const rows = lines(tsv);
    expect(rows[BODY][1]).toBe('ORN-9 B');
    expect(rows[BODY + 1][1]).toBe('ORN-100 A');
  });

  it('emits a single label-only row for a work stream with no items', () => {
    const rows = lines(releaseToTSV(state([]), 'rel'));
    // header + 3 metadata rows + one row per work stream
    expect(rows).toHaveLength(BODY + 2);
    expect(rows[BODY]).toEqual(['Payments', '', '']);
    expect(rows[BODY + 1]).toEqual(['Auth', '', '']);
  });

  it('strips tabs/newlines from fields so the grid stays intact', () => {
    const tsv = releaseToTSV(
      state([item({ key: 'ORN-100', subject: 'Multi\tline\nsubject' })]),
      'rel',
    );
    expect(lines(tsv)[BODY][1]).toBe('ORN-100 Multi line subject');
  });

  it('returns empty string for an unknown release', () => {
    expect(releaseToTSV(state([]), 'nope')).toBe('');
  });
});
