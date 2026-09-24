import { describe, expect, it } from 'vitest';
import { aConnectorRelease, aMember, aSprint, aStream, aTeam, anEvent, anItem } from '../test/factories';
import type { Release, Team, WorkItem } from '../types';
import {
  SNAPSHOT_PARAM,
  SNAPSHOT_VERSION,
  buildSnapshot,
  buildSnapshotUrl,
  decodeSnapshot,
  encodeSnapshot,
} from './releaseSnapshot';
import { MAX_URL_LENGTH } from './urlCodec';

const NOW = '2026-04-20'; // inside Sprint 1

const release = (overrides: Partial<Release> = {}): Release =>
  aConnectorRelease({
    id: 'rel_atlas',
    name: 'Atlas 4.0',
    teamId: 'team_atlas',
    externalId: null,
    workStreams: [
      aStream({ id: 'ws_pay', name: 'Payments', externalId: 'EPIC-1', engineersRequired: 2 }),
      aStream({ id: 'ws_auth', name: 'Auth', externalId: 'EPIC-2' }),
    ],
    events: [anEvent({ id: 'ev1', label: 'GA', dateISO: '2026-04-24' })],
    sprints: [
      aSprint({ id: 'sp1', name: 'Sprint 1', startISO: '2026-04-13', endISO: '2026-04-26', daysOff: 2 }),
      aSprint({ id: 'sp2', name: 'Sprint 2', startISO: '2026-04-27', endISO: '2026-05-10' }),
    ],
    ...overrides,
  });

const team = (overrides: Partial<Team> = {}): Team =>
  aTeam({
    id: 'team_atlas',
    name: 'Atlas Team',
    members: [aMember({ id: 'm1', name: 'Ada' }), aMember({ id: 'm2', name: 'Pete' })],
    ...overrides,
  });

// Subject and description carry deliberately identifiable text: several tests
// assert the snapshot does NOT leak work-item detail.
const item = (overrides: Partial<WorkItem> = {}): WorkItem =>
  anItem({
    releaseId: 'rel_atlas',
    workStreamId: 'ws_pay',
    key: 'ATL-100',
    subject: 'Secret subject line',
    description: 'Confidential description body',
    status: 'In Progress',
    points: 5,
    ...overrides,
  });

describe('buildSnapshot', () => {
  it('summarizes release meta, sprints, and streams', () => {
    const items = [
      item({ workStreamId: 'ws_pay', sprintId: 'sp1', status: 'Complete', points: 3 }),
      item({ workStreamId: 'ws_pay', sprintId: 'sp2', status: 'In Progress', points: 5 }),
      item({ workStreamId: 'ws_auth', sprintId: 'sp1', status: 'Blocked', points: 2 }),
    ];
    const snap = buildSnapshot(release(), team(), items, { now: NOW, connectorLabel: 'Acme' });

    expect(snap.v).toBe(SNAPSHOT_VERSION);
    expect(snap.summaryId).toBe('rel_atlas');
    expect(snap.name).toBe('Atlas 4.0');
    expect(snap.teamName).toBe('Atlas Team');
    expect(snap.connectorLabel).toBe('Acme');
    expect(snap.sprints).toHaveLength(2);
    expect(snap.sprints[0].isActive).toBe(true); // NOW is inside Sprint 1
    expect(snap.sprints[1].isActive).toBe(false);
    // Sprint 1 has days off → effective capacity below 100; Sprint 2 has none → 100.
    expect(snap.sprints[0].capacityPct).toBeLessThan(100);
    expect(snap.sprints[1].capacityPct).toBe(100);
    // Streams are alphabetical: Auth before Payments.
    expect(snap.streams.map((s) => s.name)).toEqual(['Auth', 'Payments']);
    expect(snap.overall.totalItems).toBe(3);
    expect(snap.overall.totalPts).toBe(10);
    expect(snap.overall.donePts).toBe(3);
  });

  it('carries each stream\'s connector deep link (externalUrl)', () => {
    const rel = release({
      workStreams: [
        aStream({ id: 'ws_pay', name: 'Payments', externalId: 'EPIC-1', engineersRequired: 2, externalUrl: 'https://acme.example/epic/1' }),
        aStream({ id: 'ws_auth', name: 'Auth', externalId: 'EPIC-2' }),
      ],
    });
    const snap = buildSnapshot(rel, team(), [item()], { now: NOW });
    expect(snap.streams.find((s) => s.name === 'Payments')!.externalUrl).toBe('https://acme.example/epic/1');
    expect(snap.streams.find((s) => s.name === 'Auth')!.externalUrl).toBeNull();
  });

  it('carries per-status counts, never item identity fields', () => {
    const items = [
      item({ status: 'Complete', subject: 'LEAKY SUBJECT', key: 'LEAK-1', description: 'LEAKY DESC' }),
      item({ status: 'Blocked' }),
    ];
    const snap = buildSnapshot(release(), team(), items, { now: NOW });
    const pay = snap.streams.find((s) => s.name === 'Payments')!;
    expect(pay.segs).toEqual([
      { k: 'Blocked', v: 1 },
      { k: 'Complete', v: 1 },
    ]);

    // The whole serialized payload must not contain any item subject/key/description.
    const json = JSON.stringify(snap);
    expect(json).not.toContain('LEAKY SUBJECT');
    expect(json).not.toContain('LEAK-1');
    expect(json).not.toContain('LEAKY DESC');
  });

  it('includes an Unassigned bucket only for stream-less, native items', () => {
    const withUnassigned = buildSnapshot(
      release(),
      team(),
      [item({ workStreamId: null, build: null }), item({ workStreamId: null, build: 'other-release' })],
      { now: NOW },
    );
    expect(withUnassigned.streams.map((s) => s.name)).toContain('Unassigned');

    const noUnassigned = buildSnapshot(release(), team(), [item({ workStreamId: 'ws_pay' })], { now: NOW });
    expect(noUnassigned.streams.map((s) => s.name)).not.toContain('Unassigned');
  });

  it('embeds a velocity suggestion computed from recent delivery', () => {
    // NOW (2026-04-20) sits in Sprint 1, so no sprint has fully elapsed → null.
    const early = buildSnapshot(release(), team(), [item()], { now: NOW });
    expect(early.velocity.suggestion).toBeNull();

    // A date past both sprints makes them elapsed, so a suggestion is produced.
    const late = buildSnapshot(
      release(),
      team({ velocity: 40 }),
      [item({ sprintId: 'sp1', status: 'Complete', points: 8 })],
      { now: '2026-05-20' },
    );
    expect(late.velocity.suggestion).not.toBeNull();
    expect(late.velocity.suggestion!.currentVelocity).toBe(40);
  });

  it('counts completed vs. total work items per stream', () => {
    const snap = buildSnapshot(
      release(),
      team(),
      [
        item({ workStreamId: 'ws_pay', status: 'Complete' }),
        item({ workStreamId: 'ws_pay', status: 'In Progress' }),
        item({ workStreamId: 'ws_pay', status: 'Blocked' }),
      ],
      { now: NOW },
    );
    const pay = snap.streams.find((s) => s.name === 'Payments')!;
    expect(pay.itemCount).toBe(3);
    expect(pay.doneItems).toBe(1); // 2 open
  });

  it('reports release capacity and strips the per-stream overbook restatement', () => {
    // Two streams each want 2 engineers (total 4) with work left, but the team has
    // only 2 contributing → over-allocated, effective staffing scaled to 50%.
    const overRel = release({
      workStreams: [
        aStream({ id: 'ws_pay', name: 'Payments', engineersRequired: 2 }),
        aStream({ id: 'ws_auth', name: 'Auth', engineersRequired: 2 }),
      ],
    });
    const snap = buildSnapshot(
      overRel,
      team(),
      [item({ workStreamId: 'ws_pay', points: 20 }), item({ workStreamId: 'ws_auth', points: 20 })],
      { now: NOW },
    );
    expect(snap.capacity.overAllocated).toBe(true);
    expect(snap.capacity.totalRequired).toBe(4);
    expect(snap.capacity.contributingCount).toBe(2);
    expect(snap.capacity.over).toBe(2);
    expect(snap.capacity.scale).toBeCloseTo(0.5);
    expect(snap.capacity.activeStreams).toHaveLength(2);
    expect(snap.capacity.activeStreams[0].effectiveEngineers).toBeCloseTo(1);
    // Each capacity row carries the same forecast verdict as its status card.
    for (const a of snap.capacity.activeStreams) {
      const card = snap.streams.find((s) => s.name === a.name)!;
      expect(a.verdict).toBe(card.forecast.verdict);
    }

    // The redundant "· team overbooked (…)" clause is gone from each stream's why-line.
    for (const s of snap.streams) {
      expect(s.forecast.summary).not.toMatch(/team overbooked/);
    }
  });

  it('respects visibleStreamIds — the active stream facets — like the TSV export', () => {
    const items = [
      item({ workStreamId: 'ws_pay', status: 'Complete', points: 5 }),
      item({ workStreamId: 'ws_auth', status: 'In Progress', points: 8 }),
      item({ workStreamId: null, build: null, points: 2 }), // unassigned, never filtered
    ];
    // Only the Payments stream is visible (e.g. build facet hides Auth).
    const snap = buildSnapshot(release(), team(), items, { now: NOW, visibleStreamIds: new Set(['ws_pay']) });

    const streamNames = snap.streams.map((s) => s.name);
    expect(streamNames).toContain('Payments');
    expect(streamNames).not.toContain('Auth'); // hidden stream dropped
    expect(streamNames).toContain('Unassigned'); // bucket survives the filter

    // Overall completion is scoped to visible streams (+ unassigned): 5 done of 7 pts,
    // the Auth stream's 8 points are excluded.
    expect(snap.overall.totalPts).toBe(7);
    expect(snap.overall.donePts).toBe(5);
  });

  it('lists the contributing team members, excluding non-contributors', () => {
    const t = team({
      members: [
        { id: 'm1', name: 'Ada', externalId: null, nonContributing: false },
        { id: 'm2', name: 'Pete', externalId: null, nonContributing: false },
        { id: 'm3', name: 'Morgan (EM)', externalId: null, nonContributing: true },
      ],
    });
    const snap = buildSnapshot(release(), t, [item()], { now: NOW });
    expect(snap.contributingMembers).toEqual(['Ada', 'Pete']);
  });

  it('works for a local (non-connector) release', () => {
    const snap = buildSnapshot(release({ connector: null }), team(), [item()], { now: NOW });
    expect(snap.connectorLabel).toBeNull();
    expect(snap.streams.length).toBeGreaterThan(0);
  });

  describe('wholeRelease block', () => {
    it('counts a completed stream, where the capacity block drops it', () => {
      const items = [
        item({ workStreamId: 'ws_pay', sprintId: 'sp1', status: 'Complete', points: 5 }),
        item({ workStreamId: 'ws_auth', sprintId: 'sp1', points: 8 }),
      ];
      const snap = buildSnapshot(release(), team(), items, { now: NOW });
      // Payments (2 eng) has no work left, so the forward capacity block excludes it…
      expect(snap.capacity.totalRequired).toBe(0);
      // …but it still ran, so the whole-release reading keeps its reservation.
      expect(snap.wholeRelease!.totalRequired).toBe(2);
    });

    it('carries the ledger and scope figures, unscaled by completion', () => {
      const items = [
        item({ workStreamId: 'ws_pay', sprintId: 'sp1', status: 'Complete', points: 30 }),
        item({ workStreamId: 'ws_auth', sprintId: 'sp2', points: 20 }),
      ];
      const wr = buildSnapshot(release(), team(), items, { now: NOW }).wholeRelease!;
      expect(wr.totalPts).toBe(50);
      expect(wr.donePts).toBe(30);
      expect(wr.sprintCount).toBe(2);
      expect(wr.scopeGap).toBe(wr.totalPts - wr.totalCap);
      expect(wr.overCommitted).toBe(wr.totalPts > wr.totalCap);
    });

    it('emits a per-sprint entry for every sprint, index-aligned with `sprints`', () => {
      const items = [item({ workStreamId: 'ws_pay', sprintId: 'sp1', points: 5 })];
      const snap = buildSnapshot(release(), team(), items, { now: NOW });
      expect(snap.wholeRelease!.perSprint).toHaveLength(snap.sprints.length);
      // sp1 carries work, sp2 does not — the alignment the viewer relies on to
      // label each segment without the payload repeating sprint names.
      expect(snap.wholeRelease!.perSprint.map((s) => s.idle)).toEqual([false, true]);
      expect(snap.sprints.map((s) => s.name)).toEqual(['Sprint 1', 'Sprint 2']);
    });

    it('assesses contention over every stream but lists only the shared ones', () => {
      const items = [
        item({ workStreamId: 'ws_pay', sprintId: 'sp1', points: 5 }),
        item({ workStreamId: 'ws_auth', sprintId: 'sp1', points: 8 }),
      ];
      const r = release({
        workStreams: [
          aStream({ id: 'ws_pay', name: 'Payments', externalId: 'EPIC-1', engineersRequired: 2 }),
          aStream({ id: 'ws_auth', name: 'Auth', externalId: 'EPIC-2', engineersRequired: 3 }),
        ],
      });
      const wr = buildSnapshot(r, team(), items, { now: NOW, visibleStreamIds: new Set(['ws_pay']) }).wholeRelease!;
      // The headline counts both streams — a scoped share must not understate what
      // the whole team was committed to.
      expect(wr.totalRequired).toBe(5);
      // But only the shared stream is listed…
      expect(wr.streams.map((s) => s.name)).toEqual(['Payments']);
      // …so this is what reconciles the headline against its own rows.
      expect(wr.outOfScopeRequired).toBe(3);
    });

    it('reports no out-of-scope reservation on an unscoped share', () => {
      const items = [item({ workStreamId: 'ws_pay', sprintId: 'sp1', points: 5 })];
      expect(buildSnapshot(release(), team(), items, { now: NOW }).wholeRelease!.outOfScopeRequired).toBe(0);
    });
  });

  it('emits burn props only for streams with engineers and estimated work', () => {
    const snap = buildSnapshot(
      release(),
      team(),
      [item({ workStreamId: 'ws_pay', points: 8 }), item({ workStreamId: 'ws_auth', points: 3 })],
      { now: NOW },
    );
    expect(snap.streams.find((s) => s.name === 'Payments')!.burn).not.toBeNull(); // engineersRequired: 2
    expect(snap.streams.find((s) => s.name === 'Auth')!.burn).toBeNull(); // engineersRequired: null
  });
});

describe('backward compatibility', () => {
  it('decodes a payload with no wholeRelease block, as pre-v6 links have', async () => {
    const built = buildSnapshot(release(), team(), [item({ sprintId: 'sp1' })], { now: NOW });
    // Exactly what a link shared before v6 carries: everything else, minus the block.
    const { wholeRelease: _omitted, ...legacy } = built;
    const decoded = await decodeSnapshot(await encodeSnapshot({ ...legacy, v: 5 }));
    expect(decoded).not.toBeNull();
    expect(decoded!.wholeRelease).toBeUndefined();
    // The rest of the payload is unaffected, so the viewer renders every other section.
    expect(decoded!.capacity).toBeDefined();
    expect(decoded!.streams.length).toBeGreaterThan(0);
  });
});

describe('encode/decode round-trip', () => {
  it('preserves a payload through encode → decode', async () => {
    const snap = buildSnapshot(release(), team(), [item()], { now: NOW });
    const decoded = await decodeSnapshot(await encodeSnapshot(snap));
    expect(decoded).toEqual(snap);
  });

  it('returns null for malformed input', async () => {
    // Valid base64url but not a deflate stream, then invalid base64url, then empty.
    await expect(decodeSnapshot('bm90LWEtcmVhbC1wYXlsb2Fk')).resolves.toBeNull();
    await expect(decodeSnapshot('not-a-real-payload!!!')).resolves.toBeNull();
    await expect(decodeSnapshot('')).resolves.toBeNull();
  });

  it('rejects a decoded object missing required fields (version/shape guard)', async () => {
    const bad = await encodeSnapshot({ v: 99 } as never);
    await expect(decodeSnapshot(bad)).resolves.toBeNull();
  });
});

describe('buildSnapshotUrl', () => {
  it('builds a hash-carried summary URL against the given base', async () => {
    const res = await buildSnapshotUrl(release(), team(), [item()], 'https://user.github.io/release-tracker/', {
      now: NOW,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.url.startsWith(`https://user.github.io/release-tracker/summary.html#${SNAPSHOT_PARAM}=`)).toBe(true);
      // Round-trips back out of the hash.
      const encoded = res.url.split(`#${SNAPSHOT_PARAM}=`)[1];
      expect((await decodeSnapshot(encoded))!.summaryId).toBe('rel_atlas');
    }
  });

  it('reports too-long instead of producing a truncatable link', async () => {
    const many = Array.from({ length: 4000 }, (_, i) => item({ id: `x${i}`, key: `K-${i}` }));
    const res = await buildSnapshotUrl(release(), team(), many, 'https://x.example', { now: NOW });
    // Aggregates stay small, so confirm the guard fires when it should by asserting
    // the length branch explicitly against a tiny cap via a hand-built long base.
    if (!res.ok) {
      expect(res.reason).toBe('too-long');
      expect(res.length).toBeGreaterThan(MAX_URL_LENGTH);
      // The raw encoded value is still returned so the too-long path can copy it for
      // the viewer's manual paste loader; it must decode back to the same release.
      expect((await decodeSnapshot(res.encoded))?.summaryId).toBe('rel_atlas');
    } else {
      // Aggregation keeps this well under the cap — that's the point.
      expect(res.url.length).toBeLessThan(MAX_URL_LENGTH);
    }
  });

  it('returns the encoded value on too-long (for the manual paste loader)', async () => {
    // Force the length branch deterministically with an oversized base.
    const longBase = `https://x.example/${'p'.repeat(MAX_URL_LENGTH)}`;
    const res = await buildSnapshotUrl(release(), team(), [item()], longBase, { now: NOW });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe('too-long');
      expect((await decodeSnapshot(res.encoded))?.summaryId).toBe('rel_atlas');
    }
  });
});

// The timeline's payload (v7). Spans ride as sprint INDICES so the URL carries two
// small numbers per stream instead of duplicating dates the payload already holds.
describe('buildSnapshot — timeline segments', () => {
  // The two-sprint default can't express a gap, so the gap cases get their own.
  const fourSprints = (): Release =>
    release({
      sprints: [
        aSprint({ id: 'sp1', name: 'S1', startISO: '2026-04-13', endISO: '2026-04-26' }),
        aSprint({ id: 'sp2', name: 'S2', startISO: '2026-04-27', endISO: '2026-05-10' }),
        aSprint({ id: 'sp3', name: 'S3', startISO: '2026-05-11', endISO: '2026-05-24' }),
        aSprint({ id: 'sp4', name: 'S4', startISO: '2026-05-25', endISO: '2026-06-07' }),
      ],
    });

  it('merges adjacent sprints into one segment', () => {
    const snap = buildSnapshot(
      release(),
      team(),
      [
        anItem({ id: 'i1', releaseId: 'rel_atlas', workStreamId: 'ws_pay', sprintId: 'sp1', points: 3 }),
        anItem({ id: 'i2', releaseId: 'rel_atlas', workStreamId: 'ws_pay', sprintId: 'sp2', points: 5 }),
        anItem({ id: 'i3', releaseId: 'rel_atlas', workStreamId: 'ws_auth', sprintId: 'sp2', points: 2 }),
      ],
      { now: NOW },
    );
    expect(snap.streams.find((s) => s.name === 'Payments')!.segments).toEqual([[0, 1, 8, 0]]);
    expect(snap.streams.find((s) => s.name === 'Auth')!.segments).toEqual([[1, 1, 2, 0]]);
  });

  // The reported bug, at the payload level: a single late ticket must not stretch
  // one bar across the whole release.
  it('emits a separate segment either side of a gap', () => {
    const snap = buildSnapshot(
      fourSprints(),
      team(),
      [
        anItem({ id: 'i1', releaseId: 'rel_atlas', workStreamId: 'ws_pay', sprintId: 'sp1', points: 5 }),
        anItem({ id: 'i2', releaseId: 'rel_atlas', workStreamId: 'ws_pay', sprintId: 'sp4', points: 1 }),
      ],
      { now: NOW },
    );
    expect(snap.streams.find((s) => s.name === 'Payments')!.segments).toEqual([
      [0, 0, 5, 0],
      [3, 3, 1, 0],
    ]);
  });

  it('carries each segment\'s completed points, so runs fill independently', () => {
    const snap = buildSnapshot(
      fourSprints(),
      team(),
      [
        anItem({ id: 'i1', releaseId: 'rel_atlas', workStreamId: 'ws_pay', sprintId: 'sp1', points: 4, status: 'Complete' }),
        anItem({ id: 'i2', releaseId: 'rel_atlas', workStreamId: 'ws_pay', sprintId: 'sp4', points: 6 }),
      ],
      { now: NOW },
    );
    // First run done, later run untouched — averaging them would show neither.
    expect(snap.streams.find((s) => s.name === 'Payments')!.segments).toEqual([
      [0, 0, 4, 4],
      [3, 3, 6, 0],
    ]);
  });

  it('carries a segment for a stream whose items are all unestimated', () => {
    // The reason `segments` exists rather than being read off `series`: series is
    // POINTS per sprint, so this stream's would be all zeroes and its bar would vanish.
    const snap = buildSnapshot(
      release(),
      team(),
      [anItem({ id: 'i1', releaseId: 'rel_atlas', workStreamId: 'ws_pay', sprintId: 'sp2', points: null })],
      { now: NOW },
    );
    const pay = snap.streams.find((s) => s.name === 'Payments')!;
    expect(pay.series.every((n) => n === 0)).toBe(true);
    expect(pay.segments).toEqual([[1, 1, 0, 0]]);
  });

  it('gives a stream with no sprinted work no segments, not a zero-width bar', () => {
    const snap = buildSnapshot(
      release(),
      team(),
      [anItem({ id: 'i1', releaseId: 'rel_atlas', workStreamId: 'ws_pay', sprintId: null, points: 3 })],
      { now: NOW },
    );
    expect(snap.streams.find((s) => s.name === 'Payments')!.segments).toEqual([]);
  });

  it('carries each stream\'s effective freeze, honouring a per-stream override', () => {
    const r = release({ codeFreezeISO: '2026-05-05' });
    r.workStreams[1] = aStream({ id: 'ws_auth', name: 'Auth', externalId: 'EPIC-2', codeFreezeISO: '2026-04-20' });
    const snap = buildSnapshot(r, team(), [], { now: NOW });
    expect(snap.streams.find((s) => s.name === 'Payments')!.freezeISO).toBe('2026-05-05');
    expect(snap.streams.find((s) => s.name === 'Auth')!.freezeISO).toBe('2026-04-20');
  });

  it('marks the unassigned bucket so the timeline can skip it — it is not a work stream', () => {
    const snap = buildSnapshot(
      release(),
      team(),
      [anItem({ id: 'i1', releaseId: 'rel_atlas', workStreamId: null, build: null, sprintId: 'sp1', points: 3 })],
      { now: NOW },
    );
    expect(snap.streams.find((s) => s.name === 'Unassigned')!.unassigned).toBe(true);
    // The flag costs nothing on real streams: absent, so it never reaches the URL.
    expect(snap.streams.find((s) => s.name === 'Payments')!.unassigned).toBeUndefined();
  });

  it('survives an encode/decode round-trip at the current version', async () => {
    const snap = buildSnapshot(
      fourSprints(),
      team(),
      [
        anItem({ id: 'i1', releaseId: 'rel_atlas', workStreamId: 'ws_pay', sprintId: 'sp1', points: 3 }),
        anItem({ id: 'i2', releaseId: 'rel_atlas', workStreamId: 'ws_pay', sprintId: 'sp4', points: 3 }),
      ],
      { now: NOW },
    );
    expect(snap.v).toBe(SNAPSHOT_VERSION);
    const decoded = await decodeSnapshot(await encodeSnapshot(snap));
    expect(decoded!.streams.find((s) => s.name === 'Payments')!.segments).toEqual([
      [0, 0, 3, 0],
      [3, 3, 3, 0],
    ]);
  });
});
