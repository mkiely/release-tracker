// A third seeded release whose only job is to carry the awkward shapes.
//
// Orion and Nexus are demos: they read like real releases and are tuned to tell a
// coherent story. That makes them bad at the other job a seed has — being the thing
// you validate against. Verifying the timeline's gap handling meant hand-editing
// localStorage, because no seeded stream has a gap; verifying muting meant creating
// a muted stream through the UI first. Neither shape existed.
//
// So this release is the opposite of a demo. Every stream is one edge case, named
// for what it exercises, and the whole thing is declared as a table rather than
// written out item by item: the point is to be able to SEE the coverage, and to add
// the next case in one line.
//
// Deterministic by construction — no randomness — so `seed.test.ts` can assert
// against it and the assertions can't flake.

import {
  SPRINT_LEN_DAYS,
  type ItemType,
  type PlanningState,
  type Release,
  type Sprint,
  type Status,
  type WorkItem,
  type WorkStream,
} from '../types';
import { addDays, uid } from './dates';

/** Sprints in the edge-case release. Eight, uniform, so an occupancy string is
 *  readable at a glance and every index maps to an obvious position. */
const SPRINT_COUNT = 8;

const SPRINT_NAMES = ['Sprint 1', 'Sprint 2', 'Sprint 3', 'Sprint 4', 'Sprint 5', 'Sprint 6', 'Sprint 7', 'Sprint 8'];

/** The code freeze lands inside sprint 7, so a stream can have work both sides of it. */
const FREEZE_SPRINT_INDEX = 6;

/**
 * One edge case, as data.
 *
 * `occupancy` is the heart of it: one character per sprint, a digit for "this many
 * items here" and `.` for a deliberately empty sprint. `'22....11'` is the shape
 * that broke the timeline — two sprints of work, a four-sprint gap, then work again.
 * Reading the coverage is reading this column.
 */
interface EdgeCase {
  name: string;
  /** What this row is for. Not rendered — it's for whoever is validating, and for
   *  the next person wondering whether a case is already covered. */
  covers: string;
  /** One char per sprint: digit = that many items, '.' = deliberately empty. */
  occupancy: string;
  engineersRequired: number | null;
  planningState?: PlanningState;
  muted?: boolean;
  /** Non-null marks the stream as carried in from a prior build. */
  build?: string | null;
  /** Points per generated item. `null` exercises the unestimated path, where a
   *  stream has real work but nothing measurable. */
  points?: number | null;
  /** Cycled across the stream's items. */
  statuses?: Status[];
  /** Offset in days from the release start; overrides the release freeze. */
  freezeOffsetDays?: number;
}

/**
 * The coverage table. Engineer reservations are chosen so the muted stream's
 * exclusion is *visible*: as seeded the release reads WITHIN capacity, and
 * un-muting the roll-up alone tips it over. That contrast is the fastest way to
 * confirm muting is wired into the capacity maths and not just into the export.
 *
 * Only streams with work REMAINING contend (a finished stream's reservation isn't
 * taken from anyone — see assessStreams), so the contending set here is smaller
 * than the reserving set: Scope Complete Surplus is fully complete, Reserved,
 * Nothing Planned has no items, and Unestimated Only has no points to remain. That
 * is the rule working, not a gap in the table.
 */
const EDGE_CASES: EdgeCase[] = [
  {
    name: 'Gapped Delivery',
    covers: 'Timeline: two bars with a gap, not one bar spanning it.',
    occupancy: '22....11',
    engineersRequired: 1,
    points: 3,
    statuses: ['Complete', 'Complete', 'Not Started'],
  },
  {
    name: 'Muted Roll-up',
    covers: 'Muting: greyscale row, sorts last, and its points + 4 engineers leave every release-level figure.',
    occupancy: '11111111',
    engineersRequired: 4,
    muted: true,
    points: 13,
    statuses: ['Not Started'],
  },
  {
    name: 'Unestimated Only',
    covers: 'Unestimated work: a bar that draws (items exist) but never fills (no points).',
    occupancy: '..333...',
    engineersRequired: 1,
    points: null,
    statuses: ['In Progress', 'Not Started'],
  },
  {
    name: 'Post-Freeze Tail',
    covers: 'Work scheduled past the code freeze — the "N pts after freeze" chip and the freeze tick mid-bar.',
    occupancy: '2222..22',
    engineersRequired: 1,
    points: 5,
    statuses: ['Complete', 'In Progress', 'Not Started'],
  },
  {
    name: 'Reserved, Nothing Planned',
    covers: 'Capacity held against no work at all: the unplanned verdict and the proactive-creation alarm.',
    occupancy: '........',
    engineersRequired: 2,
  },
  {
    name: 'Scope Complete Surplus',
    covers: 'planningState complete with engineers held beyond the defined scope: over-reserved + the rebalance suggestion.',
    occupancy: '11......',
    engineersRequired: 1,
    planningState: 'complete',
    points: 2,
    statuses: ['Complete'],
  },
  {
    name: 'Deferred Planning',
    covers: "planningState deferred — reads under-planned but the alarm is silenced. The state 'muted' is NOT.",
    occupancy: '1.......',
    engineersRequired: null,
    planningState: 'deferred',
    points: 1,
    statuses: ['Not Started'],
  },
  {
    name: 'Carried In 0.9',
    covers: 'Off-build stream: the build facet, and the current-build export scope excluding it.',
    occupancy: '....11..',
    engineersRequired: null,
    build: 'Edge 0.9',
    points: 3,
    statuses: ['In Progress', 'Not Started'],
  },
  {
    name: 'Single Sprint Blip',
    covers: 'One item in one late sprint: the timeline bar’s minimum width, so a sliver never reads as "no work".',
    occupancy: '.......1',
    engineersRequired: null,
    points: 8,
    statuses: ['Not Started'],
  },
  {
    name: 'Own Freeze Override',
    covers: 'A per-stream code freeze earlier than the release’s — header "+N", the freeze editor, per-sprint chips.',
    occupancy: '111.....',
    engineersRequired: 1,
    points: 2,
    statuses: ['Complete', 'In Progress'],
    freezeOffsetDays: 3 * SPRINT_LEN_DAYS,
  },
];

const TYPE_POOL: ItemType[] = [
  { id: 'acme_story', label: 'Story' },
  { id: 'acme_bug', label: 'Bug' },
  { id: 'acme_task', label: 'Task' },
];

const SITE = 'acme.atlassian.net';
const edgeUrl = (extId: string) => `https://${SITE}/browse/${extId}`;

/** Deterministic created/updated instants, anchored before the item's sprint and
 *  clamped to now so nothing claims to have been modified in the future. */
function stampsFor(anchorISO: string, n: number): { createdISO: string; updatedISO: string } {
  const created = new Date(`${addDays(anchorISO, -(2 + (n % 5)))}T09:00:00`);
  created.setHours(9 + (n % 8), (n * 17) % 60, 0, 0);
  const updated = new Date(created.getTime() + ((1 + (n % 7)) * 24 + (n % 6)) * 3_600_000);
  const now = Date.now();
  return {
    createdISO: new Date(Math.min(created.getTime(), now)).toISOString(),
    updatedISO: new Date(Math.min(updated.getTime(), now)).toISOString(),
  };
}

export const EDGE_RELEASE_ID = 'rel_edge';
export const EDGE_TEAM_ID = 'team_edge';

/**
 * Build the edge-case release and its items.
 *
 * `todayISO` anchors it so sprint 5 is active — mid-release, with elapsed sprints
 * behind (for velocity attainment) and unplanned ones ahead (for the runway).
 */
export function buildEdgeCaseRelease(todayISO: string): { release: Release; items: WorkItem[] } {
  // Land today inside sprint 5, a third of the way through it.
  const startISO = addDays(todayISO, -(4 * SPRINT_LEN_DAYS + 4));

  const sprints: Sprint[] = SPRINT_NAMES.slice(0, SPRINT_COUNT).map((name, i) => ({
    id: uid('sp'),
    name,
    startISO: addDays(startISO, i * SPRINT_LEN_DAYS),
    endISO: addDays(startISO, (i + 1) * SPRINT_LEN_DAYS - 1),
    // A couple of sprints lose days, so effective-capacity % isn't uniformly 100.
    daysOff: i === 2 ? 3 : i === 5 ? 2 : 0,
    externalId: `EDG-SP-${i + 1}`,
    plannedVelocity: null,
  }));

  const streams: WorkStream[] = EDGE_CASES.map((c, i) => ({
    id: uid('ws'),
    name: c.name,
    externalId: `EPIC-EDG-${i + 1}`,
    engineersRequired: c.engineersRequired,
    planningState: c.planningState ?? 'open',
    muted: c.muted ?? false,
    build: c.build ?? null,
    externalUrl: edgeUrl(`EPIC-EDG-${i + 1}`),
    codeFreezeISO: c.freezeOffsetDays != null ? addDays(startISO, c.freezeOffsetDays) : null,
  }));

  const release: Release = {
    id: EDGE_RELEASE_ID,
    name: 'Edge Cases 1.0',
    startISO,
    teamId: EDGE_TEAM_ID,
    workStreams: streams,
    events: [
      { id: uid('ev'), label: 'Kickoff', dateISO: addDays(startISO, 0), externalId: 'EDG-EV-1' },
      { id: uid('ev'), label: 'Checkpoint', dateISO: addDays(startISO, 3 * SPRINT_LEN_DAYS + 2), externalId: 'EDG-EV-2' },
      { id: uid('ev'), label: 'Ship', dateISO: addDays(startISO, SPRINT_COUNT * SPRINT_LEN_DAYS - 1), externalId: 'EDG-EV-3' },
    ],
    sprints,
    // Inside sprint 7, so Post-Freeze Tail has work on both sides of it.
    codeFreezeISO: addDays(startISO, FREEZE_SPRINT_INDEX * SPRINT_LEN_DAYS + 6),
    externalId: 'EDGE',
    connector: { type: 'acme', config: { projectKey: 'EDG', boardId: '99', fixVersion: '1.0', siteUrl: SITE } },
    sync: { lastISO: `${addDays(todayISO, -1)}T08:00:00.000Z`, state: 'ok', message: null },
    sprintLengthDays: SPRINT_LEN_DAYS,
  };

  const items: WorkItem[] = [];
  let keyN = 1;
  let typeI = 0;

  EDGE_CASES.forEach((c, streamIdx) => {
    const ws = streams[streamIdx];
    if (c.occupancy.length !== SPRINT_COUNT) {
      // A mis-typed occupancy string would silently under-cover the very case it
      // was added for, so it fails loudly at build time instead.
      throw new Error(`Edge case "${c.name}": occupancy must be ${SPRINT_COUNT} characters, got ${c.occupancy.length}`);
    }
    const statuses = c.statuses ?? ['Not Started'];
    let nth = 0;
    [...c.occupancy].forEach((ch, sprintIdx) => {
      if (ch === '.') return;
      const count = Number(ch);
      for (let i = 0; i < count; i++) {
        const sprint = sprints[sprintIdx];
        const key = `EDG-${100 + keyN++}`;
        items.push({
          id: uid('it'),
          releaseId: EDGE_RELEASE_ID,
          workStreamId: ws.id,
          sprintId: sprint.id,
          key,
          subject: `${c.name} — item ${nth + 1}`,
          description: '',
          status: statuses[nth % statuses.length],
          points: c.points ?? null,
          externalId: key,
          externalUrl: edgeUrl(key),
          assignedMemberId: null,
          build: c.build ?? null,
          dirtyFields: [],
          itemType: TYPE_POOL[typeI++ % TYPE_POOL.length],
          ...stampsFor(sprint.startISO, nth + streamIdx * 7),
        });
        nth++;
      }
    });
  });

  // Two more shapes that aren't streams at all: items with no work stream (the
  // Unassigned bucket) and an item with no sprint (the backlog).
  const unassigned: { subject: string; sprintIdx: number | null; status: Status; pts: number | null }[] = [
    { subject: 'Triage: unrouted defect from support', sprintIdx: 4, status: 'Not Started', pts: 3 },
    { subject: 'Triage: duplicate of an unknown epic', sprintIdx: 5, status: 'In Progress', pts: 2 },
    { subject: 'Backlog: no sprint, no stream', sprintIdx: null, status: 'Not Started', pts: null },
  ];
  unassigned.forEach(({ subject, sprintIdx, status, pts }, i) => {
    const key = `EDG-${100 + keyN++}`;
    const anchor = sprintIdx == null ? startISO : sprints[sprintIdx].startISO;
    items.push({
      id: uid('it'),
      releaseId: EDGE_RELEASE_ID,
      workStreamId: null,
      sprintId: sprintIdx == null ? null : sprints[sprintIdx].id,
      key,
      subject,
      description: '',
      status,
      points: pts,
      externalId: key,
      externalUrl: edgeUrl(key),
      assignedMemberId: null,
      build: null,
      dirtyFields: [],
      itemType: TYPE_POOL[typeI++ % TYPE_POOL.length],
      ...stampsFor(anchor, 90 + i),
    });
  });

  return { release, items };
}

/** The coverage table, exported so tests can assert every declared case is present
 *  rather than re-listing the cases they happen to remember. */
export const EDGE_CASE_NAMES: readonly string[] = EDGE_CASES.map((c) => c.name);

/** Occupancy by stream name — what the timeline should segment into. */
export const EDGE_CASE_OCCUPANCY: ReadonlyMap<string, string> = new Map(EDGE_CASES.map((c) => [c.name, c.occupancy]));
