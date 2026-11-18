import { describe, expect, it } from 'vitest';
import { readingCaveats, recordedBurn, reviewReadout, scopeChangeReadout } from './historyReadouts';
import { buildSprintReading } from './sprintReadings';
import { sprintReview, type ScopeChange, type SprintInjection } from './sprintHistory';
import { freezeSprintX } from './derive';
import { aRelease, aSprint, aStream, aTeamOf, anItem } from '../test/factories';
import type { Release, Sprint, WorkItem } from '../types';

// sp1 Mon 13 – Sun 26 Apr, sp2 Mon 27 Apr – Sun 10 May, sp3 Mon 11 – Sun 24 May.
const team = aTeamOf(3, 30);
const AFTER = '2026-06-01';
const base = (): Release =>
  aRelease({
    workStreams: [aStream({ id: 'ws1' })],
    sprints: [
      aSprint({ id: 'sp1', name: 'Sprint 1', startISO: '2026-04-13', endISO: '2026-04-26' }),
      aSprint({ id: 'sp2', name: 'Sprint 2', startISO: '2026-04-27', endISO: '2026-05-10' }),
      aSprint({ id: 'sp3', name: 'Sprint 3', startISO: '2026-05-11', endISO: '2026-05-24' }),
    ],
  });

function observe(r: Release, id: string, open: WorkItem[], close: WorkItem[], dates: { open?: string; close?: string } = {}): Release {
  return {
    ...r,
    sprints: r.sprints.map((sp): Sprint =>
      sp.id !== id
        ? sp
        : {
            ...sp,
            opening: buildSprintReading(r, team, sp, open, dates.open ?? sp.startISO),
            closing: buildSprintReading(r, team, sp, close, dates.close ?? sp.endISO),
          },
    ),
  };
}
const sp = (r: Release, id: string) => r.sprints.find((s) => s.id === id)!;

describe('reviewReadout', () => {
  const a = anItem({ id: 'a', points: 3 });
  const b = anItem({ id: 'b', points: 1 });
  const c = anItem({ id: 'c', points: 2 });

  it('reads an ended sprint as met / added / moved out / carried over', () => {
    const r = observe(base(), 'sp1', [a, b], [{ ...a, status: 'Complete' }, c]);
    const out = reviewReadout(sprintReview(r, sp(r, 'sp1'), AFTER)!, AFTER);
    expect(out.label).toBe('75% of commitment · +1 added · −1 removed · 1 carried over');
    expect(out.sentence).toBe(
      'Committed 4 pts; 3 pts of that were done (75%). 1 item (2 pts) added mid-sprint; 1 item (1 pt) moved out. 1 item (2 pts) carried over.',
    );
    expect(out.caveated).toBe(false);
  });

  it('marks a running sprint as so far, and says what is still open rather than carried', () => {
    const r = observe(base(), 'sp1', [a], [a], { close: '2026-04-20' });
    const out = reviewReadout(sprintReview(r, sp(r, 'sp1'), '2026-04-20')!, '2026-04-20');
    expect(out.label).toBe('0% of commitment · so far');
    expect(out.sentence).toBe('In progress, as of Apr 20: Committed 3 pts; 0 pts of that are done (0%). 1 item (3 pts) still open.');
  });

  it('says nothing was committed rather than reporting 0%', () => {
    const r = observe(base(), 'sp1', [], [{ ...c, status: 'Complete' }]);
    const out = reviewReadout(sprintReview(r, sp(r, 'sp1'), AFTER)!, AFTER);
    expect(out.label).toBe('nothing committed · +1 added');
    expect(out.sentence).toContain('Nothing was committed when the sprint opened.');
    expect(out.sentence).toContain('Nothing carried over.');
  });

  it('carries the caveat when a reading is late', () => {
    const r = observe(base(), 'sp1', [a], [a], { open: '2026-04-16' });
    expect(reviewReadout(sprintReview(r, sp(r, 'sp1'), AFTER)!, AFTER).caveated).toBe(true);
  });
});

describe('readingCaveats', () => {
  it('names the day and the distance, in working days', () => {
    const r = observe(base(), 'sp1', [], [], { open: '2026-04-16', close: '2026-04-21' });
    expect(readingCaveats(sp(r, 'sp1'), AFTER)).toEqual([
      'Commitment first recorded Apr 16, 3 working days in — work may have moved before then.',
      'Last seen Apr 21, 3 working days before it ended — the end of the sprint was not observed.',
    ]);
  });

  it('is empty for sound readings', () => {
    const r = observe(base(), 'sp1', [], []);
    expect(readingCaveats(sp(r, 'sp1'), AFTER)).toEqual([]);
  });
});

describe('scopeChangeReadout', () => {
  // Derived results, not entities: the wording is what's under test here.
  const change = (over: Partial<ScopeChange> = {}): ScopeChange => ({
    from: { sprintId: 'sp2', dateISO: '2026-04-27', phase: 'opening' },
    planningPts: 0, grownPts: 0, cutPts: 0, everDeclared: true, byStream: [], ...over,
  });
  const injection = (over: Partial<SprintInjection> = {}): SprintInjection => ({
    addedPts: 0, committedPts: 0, pct: null, sprintsWithAdds: 0, observedSprints: 1, ...over,
  });
  const r = base();

  it('names where the record begins', () => {
    expect(scopeChangeReadout(r, change(), injection())!.since).toBe('Since Sprint 2 opened');
  });

  it('states growth and cuts per stream, after completion only', () => {
    const out = scopeChangeReadout(r, change({
      grownPts: 8, cutPts: 1,
      byStream: [{ workStreamId: 'ws1', planningPts: 0, grownPts: 8, cutPts: 1 }],
    }), injection())!;
    expect(out.growth).toBe('After streams declared their scope complete, scope grew by 8 pts (API +8) and was cut by 1 pt (API \u22121).');
  });

  it('says why there is no growth when nothing was ever declared complete — not a clean bill', () => {
    expect(scopeChangeReadout(r, change({ everDeclared: false }), injection())!.growth).toBe(
      'No stream has declared its scope complete yet, so every new ticket counts as planning, not growth.',
    );
    expect(scopeChangeReadout(r, change(), injection())!.growth).toBe('No scope was added after a stream declared it complete.');
  });

  it('reports work pulled into running sprints against the commitment', () => {
    expect(scopeChangeReadout(r, change(), injection({ addedPts: 3, committedPts: 114, pct: 3, sprintsWithAdds: 1 }))!.injection).toBe(
      '3 pts were added to sprints already under way — 3% of the 114 pts committed, in 1 sprint.',
    );
    expect(scopeChangeReadout(r, change(), injection())!.injection).toBe('Nothing was added to a sprint once it was under way.');
    expect(scopeChangeReadout(r, change(), injection({ observedSprints: 0 }))!.injection).toBeNull();
  });

  it('calls ticket-writing planning progress, and says nothing when there was none', () => {
    expect(scopeChangeReadout(r, change({ planningPts: 221 }), injection())!.planning).toBe(
      '221 pts of tickets were written while planning was still open — planning progress, not growth.',
    );
    expect(scopeChangeReadout(r, change({ planningPts: -4 }), injection())!.planning).toBe(
      '4 pts of tickets were removed while planning was still open.',
    );
    expect(scopeChangeReadout(r, change(), injection())!.planning).toBeNull();
  });

  it('is null with nothing recorded', () => {
    expect(scopeChangeReadout(r, change({ from: null }), injection())).toBeNull();
  });
});

describe('recordedBurn', () => {
  const open = anItem({ id: 'a', points: 8 });
  const done = { ...open, status: 'Complete' as const };

  it('places each reading on the day it was taken and breaks the line at an unobserved sprint', () => {
    let r = observe(base(), 'sp1', [open], [open]);
    r = observe(r, 'sp3', [open], [done]);
    const out = recordedBurn(r, 'ws1', AFTER);
    expect(out.map((p) => (p ? p.pts : null))).toEqual([8, 8, null, 8, 0]);
    // Scope stays put as the work completes — the faint line doesn't move with it.
    expect(out.map((p) => (p ? p.scope : null))).toEqual([8, 8, null, 8, 8]);
    expect(out[0]!.x).toBe(freezeSprintX(r.sprints, '2026-04-13'));
    expect(out[4]!.x).toBe(freezeSprintX(r.sprints, '2026-05-24'));
  });

  it('draws incomplete readings hollow', () => {
    const r = observe(base(), 'sp1', [open], [open], { open: '2026-04-16' });
    expect(recordedBurn(r, 'ws1', AFTER).map((p) => p!.hollow)).toEqual([true, false]);
  });

  it('stops at today and leaves no trailing gap', () => {
    const r = observe(base(), 'sp1', [open], [open]);
    expect(recordedBurn(r, 'ws1', '2026-05-20').filter((p) => p === null)).toEqual([]);
  });

  it('is empty when nothing was recorded, so the chart skips the line', () => {
    expect(recordedBurn(base(), 'ws1', AFTER)).toEqual([]);
  });
});
