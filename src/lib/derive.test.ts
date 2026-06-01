import { describe, expect, it } from 'vitest';
import { capPct, eventsIn, fullCap, sprintVel, statusSegs } from './derive';
import { buildSprints } from './dates';
import type { Release, Team, WorkItem } from '../types';

const team = (members: number, velocity: number): Team => ({
  id: 't',
  name: 'T',
  velocity,
  members: Array.from({ length: members }, (_, i) => ({ id: `m${i}`, name: `M${i}` })),
});

describe('fullCap', () => {
  it('is members × 10 workdays', () => {
    expect(fullCap(team(5, 40))).toBe(50);
    expect(fullCap(team(3, 24))).toBe(30);
  });
  it('is 0 for undefined team', () => {
    expect(fullCap(undefined)).toBe(0);
  });
});

describe('capPct', () => {
  it('is 1 at no days off', () => {
    expect(capPct(team(5, 40), 0)).toBe(1);
  });
  it('scales linearly with days off', () => {
    // full = 50; 10 off → 40/50 = 0.8
    expect(capPct(team(5, 40), 10)).toBeCloseTo(0.8);
  });
  it('clamps at 0, never negative', () => {
    expect(capPct(team(5, 40), 999)).toBe(0);
  });
  it('is 0 when team has no capacity', () => {
    expect(capPct(team(0, 40), 0)).toBe(0);
  });
});

describe('sprintVel', () => {
  it('is velocity at full capacity', () => {
    expect(sprintVel(team(5, 40), 0)).toBe(40);
  });
  it('rounds velocity × capacity%', () => {
    // 40 × 0.8 = 32
    expect(sprintVel(team(5, 40), 10)).toBe(32);
    // full = 50; 5 off → 45/50 = 0.9; 40 × 0.9 = 36
    expect(sprintVel(team(5, 40), 5)).toBe(36);
  });
  it('rounds to nearest integer', () => {
    // full = 30; 5 off → 25/30 = 0.8333; 24 × 0.8333 = 20 (19.999→20)
    expect(sprintVel(team(3, 24), 5)).toBe(20);
  });
  it('is 0 for undefined team', () => {
    expect(sprintVel(undefined, 0)).toBe(0);
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
      { id: 'e3', label: 'C', dateISO: '2026-04-25' },
      { id: 'e1', label: 'A', dateISO: '2026-04-13' },
      { id: 'e2', label: 'B', dateISO: '2026-04-20' },
      { id: 'e4', label: 'D', dateISO: '2026-05-01' }, // outside sprint 1
    ],
    sprints: buildSprints('2026-04-13', {}),
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

describe('statusSegs', () => {
  const item = (status: WorkItem['status']): WorkItem => ({
    id: Math.random().toString(),
    releaseId: 'r',
    workStreamId: 'w',
    sprintN: 1,
    key: 'K',
    subject: 's',
    description: '',
    status,
    points: 1,
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
