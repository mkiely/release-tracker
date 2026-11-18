import { describe, expect, it } from 'vitest';
import { CHRONIC_SLIPS, carryOver, closingStale, historicContention, openingLate, scopeSeries, sprintReview } from './sprintHistory';
import { buildSprintReading } from './sprintReadings';
import { assessRelease } from './streamAssessment';
import { seed } from './seed';
import { todayISO } from './dates';
import { aRelease, aSprint, aStream, aTeamOf, anItem } from '../test/factories';
import type { Release, Sprint, Team, WorkItem } from '../types';

// sp1 Mon 13 – Sun 26 Apr, sp2 Mon 27 Apr – Sun 10 May, sp3 Mon 11 – Sun 24 May.
const sprints = () => [
  aSprint({ id: 'sp1', startISO: '2026-04-13', endISO: '2026-04-26' }),
  aSprint({ id: 'sp2', name: 'Sprint 2', startISO: '2026-04-27', endISO: '2026-05-10' }),
  aSprint({ id: 'sp3', name: 'Sprint 3', startISO: '2026-05-11', endISO: '2026-05-24' }),
];
const team = aTeamOf(3, 30);
const AFTER = '2026-06-01'; // every sprint ended

/** Give `sprintId` readings built from two snapshots of the items, the way the
 *  stamp would have taken them. */
function observe(
  release: Release,
  sprintId: string,
  open: { items: WorkItem[]; dateISO?: string; team?: Team },
  close: { items: WorkItem[]; dateISO?: string; team?: Team },
): Release {
  return {
    ...release,
    sprints: release.sprints.map((sp): Sprint =>
      sp.id !== sprintId
        ? sp
        : {
            ...sp,
            opening: buildSprintReading(release, open.team ?? team, sp, open.items, open.dateISO ?? sp.startISO),
            closing: buildSprintReading(release, close.team ?? team, sp, close.items, close.dateISO ?? sp.endISO),
          },
    ),
  };
}

const base = () => aRelease({ sprints: sprints(), workStreams: [aStream({ id: 'ws1', engineersRequired: 2 }), aStream({ id: 'ws2', name: 'UI', engineersRequired: 2 })] });
const sp = (r: Release, id: string) => r.sprints.find((s) => s.id === id)!;

describe('reading freshness', () => {
  it('lets an opening run one working day late before flagging it', () => {
    const on = observe(base(), 'sp1', { items: [], dateISO: '2026-04-14' }, { items: [] });
    const late = observe(base(), 'sp1', { items: [], dateISO: '2026-04-15' }, { items: [] });
    expect(openingLate(sp(on, 'sp1'))).toBe(false);
    expect(openingLate(sp(late, 'sp1'))).toBe(true);
  });

  it('does not count the weekend before a Sunday end as a gap', () => {
    const friday = observe(base(), 'sp1', { items: [] }, { items: [], dateISO: '2026-04-24' });
    const thursday = observe(base(), 'sp1', { items: [] }, { items: [], dateISO: '2026-04-23' });
    const wednesday = observe(base(), 'sp1', { items: [] }, { items: [], dateISO: '2026-04-22' });
    expect(closingStale(sp(friday, 'sp1'), AFTER)).toBe(false);
    expect(closingStale(sp(thursday, 'sp1'), AFTER)).toBe(false);
    expect(closingStale(sp(wednesday, 'sp1'), AFTER)).toBe(true);
  });

  it('never calls a running sprint stale — its closing is still being taken', () => {
    const r = observe(base(), 'sp1', { items: [] }, { items: [], dateISO: '2026-04-14' });
    expect(closingStale(sp(r, 'sp1'), '2026-04-22')).toBe(false);
  });

  it('flags nothing on an unobserved sprint', () => {
    expect(openingLate(sp(base(), 'sp1'))).toBe(false);
    expect(closingStale(sp(base(), 'sp1'), AFTER)).toBe(false);
  });
});

describe('sprintReview', () => {
  const a = anItem({ id: 'a', key: 'K-1', points: 3 });
  const b = anItem({ id: 'b', key: 'K-2', points: 5 });
  const c = anItem({ id: 'c', key: 'K-3', points: 2 });

  it('splits a sprint into committed, added, removed, completed and unfinished', () => {
    const r = observe(base(), 'sp1',
      { items: [a, b] },
      { items: [{ ...a, status: 'Complete' }, { ...b, sprintId: 'sp2' }, c] });
    const review = sprintReview(r, sp(r, 'sp1'), AFTER)!;
    expect(review.committed.map((i) => i.id)).toEqual(['a', 'b']);
    expect(review.added.map((i) => i.id)).toEqual(['c']);
    expect(review.removed.map((i) => i.id)).toEqual(['b']);
    expect(review.completed.map((i) => i.id)).toEqual(['a']);
    expect(review.unfinished.map((i) => i.id)).toEqual(['c']);
    expect(review.pts).toEqual({ committed: 8, added: 2, removed: 5, completed: 3, unfinished: 2, committedCompleted: 3 });
    expect(review.commitmentMetPct).toBe(38);
    expect(review.final).toBe(true);
  });

  it('measures the kept promise at opening points — a re-estimate cannot move it', () => {
    const r = observe(base(), 'sp1', { items: [a] }, { items: [{ ...a, points: 8, status: 'Complete' }] });
    const review = sprintReview(r, sp(r, 'sp1'), AFTER)!;
    expect(review.pts.completed).toBe(8);
    expect(review.pts.committedCompleted).toBe(3);
    expect(review.commitmentMetPct).toBe(100);
  });

  it('is interim while the sprint runs', () => {
    const r = observe(base(), 'sp1', { items: [a] }, { items: [a], dateISO: '2026-04-20' });
    expect(sprintReview(r, sp(r, 'sp1'), '2026-04-20')!.final).toBe(false);
  });

  it('has nothing to say about an unobserved sprint, or one with nothing committed', () => {
    expect(sprintReview(base(), sp(base(), 'sp1'), AFTER)).toBeNull();
    const r = observe(base(), 'sp1', { items: [] }, { items: [c] });
    expect(sprintReview(r, sp(r, 'sp1'), AFTER)!.commitmentMetPct).toBeNull();
  });

  it("leaves a muted stream's items out, as every other total does", () => {
    const muted = { ...base(), workStreams: [aStream({ id: 'ws1' }), aStream({ id: 'ws2', muted: true })] };
    const r = observe(muted, 'sp1', { items: [a, { ...b, workStreamId: 'ws2' }] }, { items: [a] });
    const review = sprintReview(r, sp(r, 'sp1'), AFTER)!;
    expect(review.committed.map((i) => i.id)).toEqual(['a']);
    expect(review.removed).toEqual([]);
  });
});

describe('carryOver', () => {
  const x = anItem({ id: 'x', key: 'K-10' });
  const y = anItem({ id: 'y', key: 'K-2' });

  /** x slips sp1 and sp3 (sp2 unobserved), y slips sp3 only. */
  const history = () => {
    let r = observe(base(), 'sp1', { items: [x] }, { items: [{ ...x, status: 'In Progress' }] });
    r = observe(r, 'sp3', { items: [{ ...x, sprintId: 'sp3' }, { ...y, sprintId: 'sp3' }] },
      { items: [{ ...x, sprintId: 'sp3' }, { ...y, sprintId: 'sp3' }] });
    return r;
  };

  it('counts every ended sprint an open item finished unfinished — a gap is unknown, not a recovery', () => {
    const out = carryOver(history(), [x, y], AFTER);
    expect(out.map((c) => [c.key, c.slips, c.chronic])).toEqual([['K-10', 2, true], ['K-2', 1, false]]);
    expect(out[0].sprintIds).toEqual(['sp1', 'sp3']);
    expect(CHRONIC_SLIPS).toBe(2);
  });

  it('reports only work still open today', () => {
    expect(carryOver(history(), [{ ...x, status: 'Complete' }, y], AFTER).map((c) => c.id)).toEqual(['y']);
  });

  it('ignores the sprint still running — it has not finished anything yet', () => {
    expect(carryOver(history(), [x, y], '2026-05-20').map((c) => [c.id, c.slips])).toEqual([['x', 1]]);
  });

  it('orders keys numerically when slips tie', () => {
    const r = observe(base(), 'sp1', { items: [x, y] }, { items: [x, y] });
    expect(carryOver(r, [x, y], AFTER).map((c) => c.key)).toEqual(['K-2', 'K-10']);
  });
});

describe('scopeSeries', () => {
  const ws1 = (pts: number, status: WorkItem['status'] = 'Not Started') => anItem({ workStreamId: 'ws1', points: pts, status });
  const ws2 = (pts: number) => anItem({ workStreamId: 'ws2', points: pts });

  const grown = () => {
    let r = observe(base(), 'sp1', { items: [ws1(10), ws2(10)] }, { items: [ws1(10, 'Complete'), ws2(10)] });
    r = observe(r, 'sp2', { items: [ws1(10, 'Complete'), ws2(10), ws2(5)] }, { items: [ws1(10, 'Complete'), ws2(10), ws2(5)] });
    return r;
  };

  it('measures growth from the earliest reading to the latest', () => {
    const s = scopeSeries(grown());
    expect(s.baseline).toMatchObject({ sprintId: 'sp1', scopePts: 20, remainingPts: 20 });
    expect(s.latest).toMatchObject({ sprintId: 'sp2', scopePts: 25, remainingPts: 15 });
    expect([s.growthPts, s.growthPct]).toEqual([5, 25]);
    expect(s.perSprint.map((p) => p.closing?.remainingPts ?? null)).toEqual([10, 15, null]);
  });

  it('narrows to one stream', () => {
    const s = scopeSeries(grown(), 'ws2');
    expect([s.baseline?.scopePts, s.latest?.scopePts, s.growthPct]).toEqual([10, 15, 50]);
  });

  it('narrows to the no-stream bucket with null', () => {
    const r = observe(base(), 'sp1', { items: [anItem({ workStreamId: null, points: 4 })] }, { items: [] });
    expect(scopeSeries(r, null).baseline?.scopePts).toBe(4);
  });

  it('leaves muted streams out of the release total', () => {
    const r = { ...grown(), workStreams: grown().workStreams.map((ws) => (ws.id === 'ws2' ? { ...ws, muted: true } : ws)) };
    expect(scopeSeries(r).latest?.scopePts).toBe(10);
  });

  it('has no baseline before anything was observed', () => {
    expect(scopeSeries(base())).toMatchObject({ baseline: null, latest: null, growthPts: 0, growthPct: null });
  });
});

describe('historicContention', () => {
  const retroOf = (r: Release, items: WorkItem[], t: Team = team) => assessRelease(r, t, items);

  it('judges an observed sprint by its own record: reservations and roster as they were', () => {
    const items = [anItem({ workStreamId: 'ws1' }), anItem({ workStreamId: 'ws2' })];
    // Recorded while each stream wanted 2 engineers of a 3-person team: overbooked.
    const r = observe(base(), 'sp1', { items }, { items });
    // Since then the reservations were cut to 1 each — today's plan fits.
    const now = { ...r, workStreams: r.workStreams.map((ws) => ({ ...ws, engineersRequired: 1 })) };
    const h = historicContention(now, retroOf(now, items));
    expect(h.perSprint[0]).toMatchObject({ source: 'recorded', contributingCount: 3, contention: { totalRequired: 4, overAllocated: true } });
    expect(h.recordedSprints).toBe(1);
  });

  it('falls back to the final-plan reading, labelled, for sprints nobody observed', () => {
    const items = [anItem({ workStreamId: 'ws1', sprintId: 'sp2' })];
    const h = historicContention(base(), retroOf(base(), items));
    expect(h.perSprint.map((s) => s.source)).toEqual(['estimated', 'estimated', 'estimated']);
    expect(h.perSprint[1]).toMatchObject({ contention: { totalRequired: 2 }, idle: false });
  });

  it('counts a stream deleted since — it held work then', () => {
    const items = [anItem({ workStreamId: 'ws1' }), anItem({ workStreamId: 'ws2' })];
    const r = observe(base(), 'sp1', { items }, { items });
    const pruned = { ...r, workStreams: r.workStreams.filter((ws) => ws.id === 'ws1') };
    expect(historicContention(pruned, retroOf(pruned, [items[0]])).perSprint[0].streamCount).toBe(2);
  });

  it('drops a muted stream from the record too', () => {
    const items = [anItem({ workStreamId: 'ws1' }), anItem({ workStreamId: 'ws2' })];
    const r = observe(base(), 'sp1', { items }, { items });
    const muted = { ...r, workStreams: r.workStreams.map((ws) => (ws.id === 'ws2' ? { ...ws, muted: true } : ws)) };
    expect(historicContention(muted, retroOf(muted, items)).perSprint[0]).toMatchObject({
      streamCount: 1,
      contention: { totalRequired: 2, overAllocated: false },
    });
  });

  it('tallies overbooked over judged sprints, idle ones excluded', () => {
    const items = [anItem({ workStreamId: 'ws1' }), anItem({ workStreamId: 'ws2' })];
    const r = observe(base(), 'sp1', { items }, { items });
    const h = historicContention(r, retroOf(r, items));
    expect([h.overbookedSprints, h.judgedSprints]).toEqual([1, 1]);
  });
});

describe('the seeded story, read back', () => {
  const s = seed();
  const today = todayISO();
  const rel = (id: string) => s.releases.find((r) => r.id === id)!;
  const itemsOf = (id: string) => s.items.filter((i) => i.releaseId === id);

  it('Nexus: the rate-limiting item is chronic carry-over', () => {
    const chronic = carryOver(rel('rel_nexus'), itemsOf('rel_nexus'), today).filter((c) => c.chronic);
    const subject = (id: string) => s.items.find((i) => i.id === id)!.subject;
    expect(chronic.map((c) => subject(c.id))).toEqual(['Per-tenant rate limiting on the edge']);
  });

  it('Orion: the cookie plan shows as added in its sprint review', () => {
    const orion = rel('rel_demo');
    const review = sprintReview(orion, orion.sprints[2], today)!;
    const cookie = s.items.find((i) => i.subject === 'Define third-party cookie deprecation plan')!;
    expect(review.added.map((i) => i.id)).toContain(cookie.id);
    expect(review.committed.map((i) => i.id)).not.toContain(cookie.id);
  });

  it('every elapsed demo sprint is recorded, not estimated', () => {
    for (const id of ['rel_demo', 'rel_nexus']) {
      const r = rel(id);
      const team = s.teams.find((t) => t.id === r.teamId);
      const h = historicContention(r, assessRelease(r, team, itemsOf(id)));
      const elapsed = r.sprints.filter((x) => x.startISO <= today).length;
      expect(h.recordedSprints).toBe(elapsed);
    }
  });
});
