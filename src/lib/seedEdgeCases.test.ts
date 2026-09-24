import { describe, expect, it } from 'vitest';
import { seed } from './seed';
import { EDGE_CASE_NAMES, EDGE_CASE_OCCUPANCY, EDGE_RELEASE_ID, EDGE_TEAM_ID, buildEdgeCaseRelease } from './seedEdgeCases';
import { segmentsOfItems, sprintIndex } from './streamTimeline';
import { assessStreams } from './streamAssessment';
import { todayISO } from './dates';

const built = () => buildEdgeCaseRelease(todayISO());

describe('edge-case release', () => {
  it('ships in the seed, after the two demos', () => {
    const s = seed();
    expect(s.releases.map((r) => r.id)).toEqual(['rel_demo', 'rel_nexus', EDGE_RELEASE_ID]);
    expect(s.teams.some((t) => t.id === EDGE_TEAM_ID)).toBe(true);
  });

  it('carries one work stream per declared case, in table order', () => {
    // Asserted against the table itself rather than a re-listed copy, so adding a
    // case can't leave the coverage claim behind.
    expect(built().release.workStreams.map((w) => w.name)).toEqual([...EDGE_CASE_NAMES]);
  });

  it('places every item in its declared sprint, and only there', () => {
    const { release, items } = built();
    const byId = sprintIndex(release.sprints);
    for (const ws of release.workStreams) {
      const occupancy = EDGE_CASE_OCCUPANCY.get(ws.name)!;
      const mine = items.filter((i) => i.workStreamId === ws.id);
      const perSprint = release.sprints.map((sp) => mine.filter((i) => i.sprintId === sp.id).length);
      expect(perSprint, ws.name).toEqual([...occupancy].map((c) => (c === '.' ? 0 : Number(c))));
      expect(byId.size).toBe(occupancy.length);
    }
  });
});

describe('edge-case release — the shapes it exists to cover', () => {
  it('has a stream whose work is split by a real gap', () => {
    // The case that motivated the whole release: hand-editing localStorage was the
    // only way to produce it before.
    const { release, items } = built();
    const ws = release.workStreams.find((w) => w.name === 'Gapped Delivery')!;
    const segs = segmentsOfItems(items.filter((i) => i.workStreamId === ws.id), sprintIndex(release.sprints));
    expect(segs).toHaveLength(2);
    expect(segs[0].startIdx).toBe(0);
    expect(segs[1].startIdx).toBeGreaterThan(segs[0].endIdx + 1);
  });

  it('has a muted stream that is heavy enough to matter', () => {
    const { release, items } = built();
    const ws = release.workStreams.find((w) => w.name === 'Muted Roll-up')!;
    expect(ws.muted).toBe(true);
    // Muting is only demonstrable if the stream would otherwise move the numbers.
    expect(ws.engineersRequired).toBeGreaterThan(0);
    expect(items.filter((i) => i.workStreamId === ws.id).length).toBeGreaterThan(0);
  });

  it('is within capacity as seeded, and over it if the muted stream were counted', () => {
    // The fastest check that muting is wired into the maths rather than only into
    // the export: the streams that still have work fit inside the team, and the
    // muted roll-up alone would blow through it.
    const s = seed();
    const release = s.releases.find((r) => r.id === EDGE_RELEASE_ID)!;
    const team = s.teams.find((t) => t.id === EDGE_TEAM_ID)!;
    const items = s.items.filter((i) => i.releaseId === EDGE_RELEASE_ID);
    const contributing = team.members.filter((m) => !m.nonContributing).length;

    const a = assessStreams(release, team, items, { today: todayISO() });
    expect(a.contention.overAllocated).toBe(false);
    expect(a.contention.totalRequired).toBeLessThanOrEqual(contributing);

    // Un-muting the roll-up alone would tip it over — which is the whole point of
    // seeding a muted stream heavy enough to matter.
    const mutedReservation = release.workStreams.find((w) => w.muted)!.engineersRequired!;
    expect(a.contention.totalRequired + mutedReservation).toBeGreaterThan(contributing);
  });

  it('has a stream with items but no estimates', () => {
    const { release, items } = built();
    const ws = release.workStreams.find((w) => w.name === 'Unestimated Only')!;
    const mine = items.filter((i) => i.workStreamId === ws.id);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((i) => i.points === null)).toBe(true);
  });

  it('has work scheduled on both sides of the code freeze', () => {
    const { release, items } = built();
    const ws = release.workStreams.find((w) => w.name === 'Post-Freeze Tail')!;
    const after = release.sprints.filter((sp) => sp.startISO > release.codeFreezeISO!).map((sp) => sp.id);
    const mine = items.filter((i) => i.workStreamId === ws.id);
    expect(mine.some((i) => after.includes(i.sprintId!))).toBe(true);
    expect(mine.some((i) => !after.includes(i.sprintId!))).toBe(true);
  });

  it('has a stream holding engineers against no work at all', () => {
    const { release, items } = built();
    const ws = release.workStreams.find((w) => w.name === 'Reserved, Nothing Planned')!;
    expect(ws.engineersRequired).toBeGreaterThan(0);
    expect(items.filter((i) => i.workStreamId === ws.id)).toHaveLength(0);
  });

  it('distinguishes a deferred stream from a muted one — they are not the same state', () => {
    const { release } = built();
    const deferred = release.workStreams.find((w) => w.name === 'Deferred Planning')!;
    const muted = release.workStreams.find((w) => w.name === 'Muted Roll-up')!;
    expect(deferred.planningState).toBe('deferred');
    expect(deferred.muted).toBe(false);
    expect(muted.planningState).toBe('open');
    expect(muted.muted).toBe(true);
  });

  it('has an off-build stream and a per-stream freeze override', () => {
    const { release } = built();
    expect(release.workStreams.find((w) => w.name === 'Carried In 0.9')!.build).toBe('Edge 0.9');
    const override = release.workStreams.find((w) => w.name === 'Own Freeze Override')!;
    expect(override.codeFreezeISO).toBeTruthy();
    expect(override.codeFreezeISO! < release.codeFreezeISO!).toBe(true);
  });

  it('has unassigned items, including one with no sprint', () => {
    const { items } = built();
    const orphans = items.filter((i) => i.workStreamId === null);
    expect(orphans.length).toBeGreaterThan(0);
    expect(orphans.some((i) => i.sprintId === null)).toBe(true);
  });

  it('has a single-item stream late in the release, for the bar minimum width', () => {
    const { release, items } = built();
    const ws = release.workStreams.find((w) => w.name === 'Single Sprint Blip')!;
    const mine = items.filter((i) => i.workStreamId === ws.id);
    expect(mine).toHaveLength(1);
    const segs = segmentsOfItems(mine, sprintIndex(release.sprints));
    expect(segs).toHaveLength(1);
    expect(segs[0].startIdx).toBe(segs[0].endIdx);
  });

  it('is anchored so a sprint is active — mid-release, with elapsed and future sprints', () => {
    const { release } = built();
    const today = todayISO();
    const active = release.sprints.findIndex((sp) => sp.startISO <= today && sp.endISO >= today);
    expect(active).toBeGreaterThan(0);
    expect(active).toBeLessThan(release.sprints.length - 1);
  });

  it('rejects a mis-typed occupancy string rather than under-covering silently', () => {
    // The table is the coverage claim, so a row that doesn't match the sprint count
    // must fail loudly — a short string would quietly drop the sprints it omits.
    expect(EDGE_CASE_OCCUPANCY.size).toBe(EDGE_CASE_NAMES.length);
    for (const [name, occ] of EDGE_CASE_OCCUPANCY) {
      expect(occ.length, name).toBe(built().release.sprints.length);
    }
  });
});
