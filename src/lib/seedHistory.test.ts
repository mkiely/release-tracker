import { describe, expect, it } from 'vitest';
import { seed } from './seed';
import { todayISO } from './dates';
import { EDGE_RELEASE_ID } from './seedEdgeCases';
import type { AppState, Release } from '../types';

const releaseOf = (s: AppState, id: string): Release => s.releases.find((r) => r.id === id)!;
const idOf = (s: AppState, subject: string) => s.items.find((i) => i.subject === subject)!.id;
const ids = (r: { items: { id: string }[] } | null) => (r ? r.items.map((i) => i.id) : []);

describe('seeded sprint history', () => {
  const s = seed();
  const today = todayISO();

  it.each(['rel_demo', 'rel_nexus'])('%s: elapsed sprints carry both readings, dated to their own ends', (id) => {
    for (const sp of releaseOf(s, id).sprints.filter((x) => x.endISO < today)) {
      expect(sp.opening?.dateISO).toBe(sp.startISO);
      expect(sp.closing?.dateISO).toBe(sp.endISO);
    }
  });

  it.each(['rel_demo', 'rel_nexus'])('%s: the sprint underway has its opening, and leaves its closing to the live stamp', (id) => {
    const active = releaseOf(s, id).sprints.find((x) => x.startISO <= today && today <= x.endISO)!;
    expect(active.opening?.dateISO).toBe(active.startISO);
    expect(active.closing).toBeNull();
  });

  it('leaves future sprints, and the whole edge-case release, unobserved', () => {
    for (const r of s.releases) {
      const unread = r.id === EDGE_RELEASE_ID ? r.sprints : r.sprints.filter((x) => x.startISO > today);
      for (const sp of unread) expect(sp).toMatchObject({ opening: null, closing: null });
    }
  });

  it('Nexus: the rate-limiting item slipped through two sprints, unfinished at each close', () => {
    const nexus = releaseOf(s, 'rel_nexus');
    const id = idOf(s, 'Per-tenant rate limiting on the edge');
    for (const k of [3, 4]) {
      expect(ids(nexus.sprints[k].opening)).toContain(id);
      expect(nexus.sprints[k].closing!.items.find((i) => i.id === id)?.status).toBe('In Progress');
    }
    // ...and arrived in the active sprint already under way.
    expect(nexus.sprints[5].opening!.items.find((i) => i.id === id)?.status).toBe('In Progress');
  });

  it('Orion: the cookie plan was pulled into its sprint after planning', () => {
    const orion = releaseOf(s, 'rel_demo');
    const id = idOf(s, 'Define third-party cookie deprecation plan');
    expect(ids(orion.sprints[2].opening)).not.toContain(id);
    expect(ids(orion.sprints[2].closing)).toContain(id);
  });

  it('never reads an item before it was created', () => {
    const created = new Map(s.items.map((i) => [i.id, i.createdISO?.slice(0, 10)]));
    for (const r of s.releases) {
      for (const sp of r.sprints) {
        for (const reading of [sp.opening, sp.closing]) {
          for (const it of reading?.items ?? []) expect(created.get(it.id)! <= reading!.dateISO).toBe(true);
        }
      }
    }
  });

  it('scope never shrinks across the seeded past — the seed adds work, it never removes it', () => {
    for (const id of ['rel_demo', 'rel_nexus']) {
      const totals = releaseOf(s, id)
        .sprints.flatMap((sp) => [sp.opening, sp.closing])
        .filter((r) => r !== null)
        .map((r) => r!.streams.reduce((a, x) => a + x.scopePts, 0));
      expect(totals).toEqual([...totals].sort((a, b) => a - b));
    }
  });
});
