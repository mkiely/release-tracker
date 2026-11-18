import { describe, expect, it } from 'vitest';
import { CHRONIC_SLIPS, carryOver, closingStale, historicContention, openingLate, scopeChange, scopeSeries, sprintInjection, sprintReview } from './sprintHistory';
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

  it('records scope and remaining at every reading, gaps as nulls', () => {
    const r = observe(base(), 'sp1', { items: [ws1(10), ws2(10)] }, { items: [ws1(10, 'Complete'), ws2(10)] });
    expect(scopeSeries(r).map((p) => [p.opening?.scopePts ?? null, p.closing?.remainingPts ?? null])).toEqual([
      [20, 10],
      [null, null],
      [null, null],
    ]);
  });

  it('narrows to one stream, or to the no-stream bucket with null', () => {
    const r = observe(base(), 'sp1', { items: [ws1(3), ws2(5), anItem({ workStreamId: null, points: 4 })] }, { items: [] });
    expect(scopeSeries(r, 'ws2')[0].opening?.scopePts).toBe(5);
    expect(scopeSeries(r, null)[0].opening?.scopePts).toBe(4);
  });

  it('leaves muted streams out of the release total', () => {
    const r = observe(base(), 'sp1', { items: [ws1(3), ws2(5)] }, { items: [] });
    const muted = { ...r, workStreams: r.workStreams.map((ws) => (ws.id === 'ws2' ? { ...ws, muted: true } : ws)) };
    expect(scopeSeries(muted)[0].opening?.scopePts).toBe(3);
  });
});

describe('scopeChange', () => {
  const pts = (ws: string, n: number) => anItem({ workStreamId: ws, points: n });
  /** `base()` with ws2's planning posture set — readings take it from the release. */
  const posture = (state: 'open' | 'complete') => {
    const r = base();
    return { ...r, workStreams: r.workStreams.map((ws) => (ws.id === 'ws2' ? { ...ws, planningState: state } : ws)) };
  };
  /** Readings for `id` taken while ws2 held `state`, written onto `onto`. */
  const observeAs = (onto: Release, id: string, state: 'open' | 'complete', open: WorkItem[], close: WorkItem[]) => {
    const taken = observe(posture(state), id, { items: open }, { items: close });
    return { ...onto, sprints: onto.sprints.map((sp) => (sp.id === id ? taken.sprints.find((t) => t.id === id)! : sp)) };
  };

  it('counts points written while a stream is open as planning, not growth', () => {
    const r = observeAs(base(), 'sp1', 'open', [pts('ws2', 5)], [pts('ws2', 5), pts('ws2', 8)]);
    const c = scopeChange(r);
    expect([c.planningPts, c.grownPts, c.cutPts, c.everDeclared]).toEqual([8, 0, 0, false]);
  });

  it('counts points that arrive after the stream declared complete as growth — by the posture it held then', () => {
    // Open through sp1; declared complete by sp2's opening; then gains 3 and loses 2.
    let r = observeAs(base(), 'sp1', 'open', [pts('ws2', 5)], [pts('ws2', 5), pts('ws2', 8)]);
    r = observeAs(r, 'sp2', 'complete', [pts('ws2', 5), pts('ws2', 8), pts('ws2', 2)], [pts('ws2', 5), pts('ws2', 8), pts('ws2', 3)]);
    const c = scopeChange(r);
    // sp1 close → sp2 open: +2 written while sp1's closing still read 'open' → planning.
    // sp2 open → close: +1 net while 'complete' → growth.
    expect([c.planningPts, c.grownPts, c.cutPts]).toEqual([10, 1, 0]);
    expect(c.everDeclared).toBe(true);
    expect(c.byStream[0]).toMatchObject({ workStreamId: 'ws2', grownPts: 1 });
  });

  it('records a cut after completion separately from growth', () => {
    const r = observeAs(base(), 'sp1', 'complete', [pts('ws2', 5), pts('ws2', 3)], [pts('ws2', 5)]);
    expect(scopeChange(r)).toMatchObject({ grownPts: 0, cutPts: 3, planningPts: 0 });
  });

  it('reads a reading taken before planning states were recorded as not yet complete', () => {
    let r = observeAs(base(), 'sp1', 'complete', [pts('ws2', 5)], [pts('ws2', 5)]);
    // Strip the field from sp1's closing, as an early v32 reading would lack it.
    r = {
      ...r,
      sprints: r.sprints.map((sp) =>
        sp.id === 'sp1' && sp.closing
          ? { ...sp, closing: { ...sp.closing, streams: sp.closing.streams.map(({ planningState: _drop, ...rest }) => rest) } }
          : sp,
      ),
    };
    r = observeAs(r, 'sp2', 'complete', [pts('ws2', 5), pts('ws2', 4)], [pts('ws2', 5), pts('ws2', 4)]);
    expect(scopeChange(r)).toMatchObject({ planningPts: 4, grownPts: 0 });
  });

  it('leaves muted streams out', () => {
    let r = observeAs(base(), 'sp1', 'complete', [pts('ws2', 5)], [pts('ws2', 5), pts('ws2', 9)]);
    r = { ...r, workStreams: r.workStreams.map((ws) => (ws.id === 'ws2' ? { ...ws, muted: true } : ws)) };
    expect(scopeChange(r)).toMatchObject({ grownPts: 0, planningPts: 0, everDeclared: false });
  });

  it('treats a sprint with no reading fields at all as unobserved — not a crash', () => {
    // The shape a dev browser actually held: v32 data whose untouched sprints were
    // written without the fields, beside one stamped sprint.
    const r = observeAs(base(), 'sp2', 'open', [pts('ws2', 5)], [pts('ws2', 5), pts('ws2', 3)]);
    const bare = {
      ...r,
      sprints: r.sprints.map((sp) => {
        if (sp.id === 'sp2') return sp;
        const { opening: _o, closing: _c, ...rest } = sp;
        return rest as Sprint;
      }),
    };
    expect(scopeChange(bare)).toMatchObject({ planningPts: 3, from: { sprintId: 'sp2' } });
    expect(sprintInjection(bare, AFTER).observedSprints).toBe(1);
    expect(carryOver(bare, [], AFTER)).toEqual([]);
  });

  it('names where the record begins, and has nothing to say before it does', () => {
    const r = observeAs(base(), 'sp2', 'open', [], []);
    expect(scopeChange(r).from).toEqual({ sprintId: 'sp2', dateISO: '2026-04-27', phase: 'opening' });
    expect(scopeChange(base()).from).toBeNull();
  });
});

describe('sprintInjection', () => {
  it('totals what was pulled into running sprints against what they committed', () => {
    const a = anItem({ id: 'a', points: 10 });
    const b = anItem({ id: 'b', points: 2 });
    let r = observe(base(), 'sp1', { items: [a] }, { items: [a, b] });
    r = observe(r, 'sp2', { items: [{ ...a, sprintId: 'sp2' }] }, { items: [{ ...a, sprintId: 'sp2' }] });
    expect(sprintInjection(r, AFTER)).toEqual({ addedPts: 2, committedPts: 20, pct: 10, sprintsWithAdds: 1, observedSprints: 2 });
  });

  it('is empty with no observed sprint', () => {
    expect(sprintInjection(base(), AFTER)).toEqual({ addedPts: 0, committedPts: 0, pct: null, sprintsWithAdds: 0, observedSprints: 0 });
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

  it('Nexus: growth is API Gateway after it declared complete; the rest is planning', () => {
    const nexus = rel('rel_nexus');
    const c = scopeChange(nexus);
    const gateway = nexus.workStreams.find((w) => w.name === 'API Gateway')!;
    expect(c.byStream.filter((e) => e.grownPts > 0).map((e) => e.workStreamId)).toEqual([gateway.id]);
    expect(c.planningPts).toBeGreaterThan(c.grownPts * 10);
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
