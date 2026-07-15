import { describe, expect, it } from 'vitest';
import { releaseToTSV } from './exportRelease';
import type { AppState, Release, WorkItem } from '../types';

// Sprint 1: Apr 13 – Apr 26, Sprint 2: Apr 27 – May 10 (contiguous 14-day ranges).
const SPRINT_DATES: Record<number, [string, string]> = {
  1: ['2026-04-13', '2026-04-26'],
  2: ['2026-04-27', '2026-05-10'],
};
const sprint = (n: number) => ({
  id: `sp${n}`,
  name: `Sprint ${n}`,
  startISO: SPRINT_DATES[n][0],
  endISO: SPRINT_DATES[n][1],
  daysOff: 0,
  externalId: null,
  plannedVelocity: null,
});

const release = (): Release => ({
  id: 'rel',
  name: 'Orion 2.0',
  startISO: '2026-04-13',
  teamId: 't',
  workStreams: [
    { id: 'ws1', name: 'Payments', externalId: null, engineersRequired: null, build: null, externalUrl: null, planningMuted: false },
    { id: 'ws2', name: 'Auth', externalId: null, engineersRequired: null, build: null, externalUrl: null, planningMuted: false },
  ],
  events: [],
  sprints: [sprint(1), sprint(2)],
  externalId: null,
  connector: null,
  sync: null,
  sprintLengthDays: 14,
});

const item = (over: Partial<WorkItem>): WorkItem => ({
  id: Math.random().toString(),
  releaseId: 'rel',
  workStreamId: 'ws1',
  sprintId: 'sp1',
  key: 'ORN-100',
  subject: 'Item',
  description: '',
  status: 'Not Started',
  points: 1,
  itemType: null,
  externalId: null,
  assignedMemberId: null,
  build: null, externalUrl: null,
  dirtyFields: [],
  ...over,
});

const state = (items: WorkItem[]): AppState => ({
  version: 1,
  teams: [],
  releases: [release()],
  items,
  meta: { lastSyncISO: null },
});

// Split raw TSV into rows then columns, honouring RFC 4180 double-quoted fields
// (which may contain embedded newlines). This mirrors how Google Sheets parses
// pasted content, so the test assertions match what the user actually sees.
function parseRows(tsv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let i = 0;
  while (i < tsv.length) {
    if (tsv[i] === '"') {
      // Quoted field — consume until closing quote, treating "" as escaped ".
      i++;
      while (i < tsv.length) {
        if (tsv[i] === '"' && tsv[i + 1] === '"') { field += '"'; i += 2; }
        else if (tsv[i] === '"') { i++; break; }
        else { field += tsv[i++]; }
      }
    } else if (tsv[i] === '\t') {
      row.push(field); field = ''; i++;
    } else if (tsv[i] === '\n') {
      row.push(field); field = ''; rows.push(row); row = []; i++;
    } else {
      field += tsv[i++];
    }
  }
  row.push(field);
  rows.push(row);
  return rows;
}

// Row layout: header (0), Dates (1), Days off (2), Events (3), Capacity (4), Planned (5),
// then per-stream sections (stream header row + item rows).
const BODY = 6;

const tsvHasStream = (rows: string[][], name: string): boolean =>
  rows.some((row) => row[0].split('\n')[0] === name);

describe('releaseToTSV', () => {
  it('has a header row of Work Stream + sprint names', () => {
    const rows = parseRows(releaseToTSV(state([]), 'rel'));
    expect(rows[0]).toEqual(['', 'Sprint 1', 'Sprint 2']);
  });

  it('emits sprint metadata rows (dates, days off, events) below the header', () => {
    const r = release();
    r.sprints[0].daysOff = 3;
    r.events = [
      { id: 'ev1', label: 'Code freeze', dateISO: r.sprints[0].startISO, externalId: null },
      { id: 'ev2', label: 'Release', dateISO: r.sprints[1].endISO, externalId: null },
    ];
    const st: AppState = { version: 1, teams: [], releases: [r], items: [], meta: { lastSyncISO: null } };
    const rows = parseRows(releaseToTSV(st, 'rel'));
    expect(rows[1]).toEqual(['Dates', 'Apr 13 – Apr 26', 'Apr 27 – May 10']);
    expect(rows[2]).toEqual(['Days off', '3', '0']);
    expect(rows[3]).toEqual(['Events', 'Code freeze (Apr 13)', 'Release (May 10)']);
  });

  it('emits capacity and planned rows below the event row', () => {
    const r = release();
    const team = { id: 't', name: 'Core', velocity: 20, members: [{ id: 'm1', name: 'Alice', externalId: null, nonContributing: false }], externalId: null };
    r.sprints[0].daysOff = 0;
    const st: AppState = {
      version: 1,
      teams: [team],
      releases: [r],
      items: [item({ workStreamId: 'ws1', sprintId: 'sp1', points: 3 }), item({ workStreamId: 'ws1', sprintId: 'sp2', points: 5 })],
      meta: { lastSyncISO: null },
    };
    const rows = parseRows(releaseToTSV(st, 'rel'));
    expect(rows[4][0]).toBe('Capacity');
    expect(rows[4][1]).toBe('20');
    expect(rows[4][2]).toBe('20');
    expect(rows[5][0]).toBe('Planned');
    expect(rows[5][1]).toBe('3');
    expect(rows[5][2]).toBe('5');
  });

  it('emits a stream header row with stats in col 0 and empty sprint columns', () => {
    const rows = parseRows(releaseToTSV(state([]), 'rel'));
    // Col 0 of the stream header starts with the stream name.
    expect(rows[BODY][0]).toMatch(/^Payments\n/);
    // Sprint columns on the header row are empty.
    expect(rows[BODY][1]).toBe('');
    expect(rows[BODY][2]).toBe('');
  });

  it('stream header cell contains name, separator, health, forecast, and runway lines', () => {
    const tsv = releaseToTSV(
      state([item({ workStreamId: 'ws1', sprintId: 'sp1', points: 5, status: 'Complete' })]),
      'rel',
    );
    const rows = parseRows(tsv);
    const cellLines = rows[BODY][0].split('\n');
    expect(cellLines[0]).toBe('Payments');
    expect(cellLines[1]).toBe('----');
    expect(cellLines[2]).toMatch(/1 items/);
    expect(cellLines[2]).toMatch(/100% done/);
    expect(cellLines[2]).toMatch(/5\/5pt/);
    expect(cellLines[3]).toMatch(/^Forecast:/);
    expect(cellLines[4]).toMatch(/^Runway:/);
  });

  it('places items in sprint columns on rows below the stream header', () => {
    const tsv = releaseToTSV(
      state([
        item({ workStreamId: 'ws1', sprintId: 'sp1', key: 'ORN-100', subject: 'Login' }),
        item({ workStreamId: 'ws1', sprintId: 'sp2', key: 'ORN-101', subject: 'Logout' }),
      ]),
      'rel',
    );
    const rows = parseRows(tsv);
    // Row BODY is the stream header (stats, empty sprint cols).
    // Row BODY+1 is the first item row.
    expect(rows[BODY + 1]).toEqual(['', 'ORN-100 Login', 'ORN-101 Logout']);
  });

  it('stacks multiple items per sprint into extra rows below the header', () => {
    const tsv = releaseToTSV(
      state([
        item({ workStreamId: 'ws1', sprintId: 'sp1', key: 'ORN-100', subject: 'A' }),
        item({ workStreamId: 'ws1', sprintId: 'sp1', key: 'ORN-101', subject: 'B' }),
      ]),
      'rel',
    );
    const rows = parseRows(tsv);
    expect(rows[BODY + 1]).toEqual(['', 'ORN-100 A', '']);
    expect(rows[BODY + 2]).toEqual(['', 'ORN-101 B', '']);
  });

  it('sorts items within a sprint column numerically by key', () => {
    const tsv = releaseToTSV(
      state([
        item({ key: 'ORN-100', subject: 'A' }),
        item({ key: 'ORN-9', subject: 'B' }),
      ]),
      'rel',
    );
    const rows = parseRows(tsv);
    expect(rows[BODY + 1][1]).toBe('ORN-9 B');
    expect(rows[BODY + 2][1]).toBe('ORN-100 A');
  });

  it('emits a stream header row with no item rows when the stream is empty', () => {
    const rows = parseRows(releaseToTSV(state([]), 'rel'));
    // header + 5 metadata rows + 1 stream header per stream (no item rows)
    expect(rows).toHaveLength(BODY + 2);
    expect(rows[BODY][0]).toMatch(/^Payments\n/);
    expect(rows[BODY + 1][0]).toMatch(/^Auth\n/);
  });

  it('visibleStreamIds drops filtered-out streams, and their items', () => {
    const st: AppState = {
      version: 1,
      teams: [],
      releases: [release()],
      items: [
        item({ workStreamId: 'ws1', key: 'ORN-100', subject: 'Native' }),
        item({ workStreamId: 'ws2', key: 'ORN-200', subject: 'Carried in' }),
      ],
      meta: { lastSyncISO: null },
    };
    const rows = parseRows(releaseToTSV(st, 'rel', new Set(['ws1'])));
    // Only the visible stream's section is present.
    expect(rows).toHaveLength(BODY + 2);
    expect(rows[BODY][0]).toMatch(/^Payments\n/);
    expect(rows[BODY + 1]).toEqual(['', 'ORN-100 Native', '']);
    expect(tsvHasStream(rows, 'Auth')).toBe(false);
  });

  it('visibleStreamIds keeps the unassigned bucket even though it is not a stream', () => {
    const st: AppState = {
      version: 1,
      teams: [],
      releases: [release()],
      items: [item({ workStreamId: null, key: 'ORN-300', subject: 'Loose' })],
      meta: { lastSyncISO: null },
    };
    const rows = parseRows(releaseToTSV(st, 'rel', new Set(['ws1'])));
    expect(tsvHasStream(rows, 'Unassigned')).toBe(true);
  });

  it('without visibleStreamIds, every stream is exported (default behaviour unchanged)', () => {
    const st: AppState = { version: 1, teams: [], releases: [release()], items: [], meta: { lastSyncISO: null } };
    const rows = parseRows(releaseToTSV(st, 'rel'));
    expect(tsvHasStream(rows, 'Auth')).toBe(true);
    expect(tsvHasStream(rows, 'Payments')).toBe(true);
  });

  it('drops an excluded stream from the contention math behind forecast lines', () => {
    // Both streams demand engineers against a 1-engineer team; excluding one
    // changes the contention scale behind the visible stream's effective
    // capacity, so its forecast shortfall differs — proof the forecast/runway
    // lines are computed over the filtered set, matching the on-screen facets.
    // Sprints must lie in the future (contention is inert once no sprints
    // remain) and remaining points must exceed capacity in both scenarios so
    // the at-risk line carries the (different) shortfall numbers.
    const r = release();
    r.sprints = [
      { id: 'sp1', name: 'Sprint 1', startISO: '2027-04-13', endISO: '2027-04-26', daysOff: 0, externalId: null, plannedVelocity: null },
      { id: 'sp2', name: 'Sprint 2', startISO: '2027-04-27', endISO: '2027-05-10', daysOff: 0, externalId: null, plannedVelocity: null },
    ];
    r.workStreams = r.workStreams.map((ws) => ({ ...ws, engineersRequired: 2 }));
    const st: AppState = {
      version: 1,
      teams: [{ id: 't', name: 'Core', velocity: 20, members: [{ id: 'm1', name: 'Alice', externalId: null, nonContributing: false }], externalId: null }],
      releases: [r],
      items: [
        item({ workStreamId: 'ws1', key: 'ORN-100', subject: 'A', points: 100 }),
        item({ workStreamId: 'ws2', key: 'ORN-200', subject: 'B', points: 100 }),
      ],
      meta: { lastSyncISO: null },
    };
    const all = releaseToTSV(st, 'rel');
    const filtered = releaseToTSV(st, 'rel', new Set(['ws1']));
    expect(tsvHasStream(parseRows(filtered), 'Auth')).toBe(false);
    // The Payments header cell differs once Auth's engineer demand leaves the pool.
    const paymentsCell = (tsv: string) => parseRows(tsv).find((row) => row[0].startsWith('Payments'))?.[0];
    expect(paymentsCell(filtered)).not.toBe(paymentsCell(all));
  });

  it('strips tabs/newlines from item labels so the grid stays intact', () => {
    const tsv = releaseToTSV(
      state([item({ key: 'ORN-100', subject: 'Multi\tline\nsubject' })]),
      'rel',
    );
    expect(parseRows(tsv)[BODY + 1][1]).toBe('ORN-100 Multi line subject');
  });

  it('returns empty string for an unknown release', () => {
    expect(releaseToTSV(state([]), 'nope')).toBe('');
  });
});
