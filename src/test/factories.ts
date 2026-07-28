// Entity factories for tests.
//
// Ten test files each used to define their own item()/release()/team() literal.
// That made adding a field to a domain type a ten-file edit, and it had already
// been paid for once (see docs/REARCHITECTURE.md, where itemType and
// nonContributing broke several fixtures at once when they were introduced).
// One of those literals ended in `as WorkItem`, silently papering over the fields
// it was missing.
//
// Every factory here returns a COMPLETE, valid entity — no casts — and takes a
// Partial override. A new required field is added in exactly one place.
//
// These are deliberately bland: a test that cares about a value states it in its
// own overrides, so the assertion and the value that drives it stay next to each
// other. Test files are still expected to wrap these with their own domain-shaped
// helpers (`aTeamOf(5, 40)`, a particular release under test); the point is that
// the wrapper supplies meaning, not the twenty fields underneath it.

import type {
  AppState,
  ItemType,
  Member,
  Release,
  ReleaseCatalog,
  ReleaseConnector,
  ReleaseEvent,
  Sprint,
  Status,
  Team,
  WorkItem,
  WorkStream,
} from '../types';
import { SCHEMA_VERSION } from '../types';

/** Monotonic suffix for factories that must not collide within a test. Reset it
 *  in a beforeEach when a test asserts on generated ids. */
let seq = 0;
export const nextId = (prefix: string): string => `${prefix}_${++seq}`;
export const resetIds = (): void => {
  seq = 0;
};

export function aMember(over: Partial<Member> = {}): Member {
  return {
    id: nextId('m'),
    name: 'Member',
    externalId: null,
    nonContributing: false,
    ...over,
  };
}

export function aTeam(over: Partial<Team> = {}): Team {
  return {
    id: 'team_1',
    name: 'Team',
    velocity: 40,
    externalId: null,
    members: [aMember({ id: 'm1', name: 'Ada' }), aMember({ id: 'm2', name: 'Marco' })],
    ...over,
  };
}

/** A team of `contributing` capacity-bearing members plus, optionally, some who
 *  don't count toward capacity (EMs, PMs). The shape most capacity maths needs. */
export function aTeamOf(contributing: number, velocity: number, nonContributing = 0): Team {
  return aTeam({
    velocity,
    members: [
      ...Array.from({ length: contributing }, (_, i) => aMember({ id: `c${i}`, name: `C${i}` })),
      ...Array.from({ length: nonContributing }, (_, i) =>
        aMember({ id: `nc${i}`, name: `NC${i}`, nonContributing: true }),
      ),
    ],
  });
}

export function aStream(over: Partial<WorkStream> = {}): WorkStream {
  return {
    id: 'ws1',
    name: 'API',
    externalId: null,
    engineersRequired: null,
    planningState: 'open',
    build: null,
    externalUrl: null,
    attributes: {},
    ...over,
  };
}

/** Default span is Mon 13 Apr – Sun 26 Apr 2026: a standard 14-day sprint with
 *  exactly 10 business days, which most capacity expectations are written against. */
export function aSprint(over: Partial<Sprint> = {}): Sprint {
  return {
    id: 'sp1',
    name: 'Sprint 1',
    startISO: '2026-04-13',
    endISO: '2026-04-26',
    daysOff: 0,
    externalId: null,
    plannedVelocity: null,
    ...over,
  };
}

export function anEvent(over: Partial<ReleaseEvent> = {}): ReleaseEvent {
  return {
    id: nextId('ev'),
    label: 'Milestone',
    dateISO: '2026-04-24',
    externalId: null,
    ...over,
  };
}

export function aCatalog(over: Partial<ReleaseCatalog> = {}): ReleaseCatalog {
  return { itemTypes: [], statuses: [], workStreamFields: [], ...over };
}

export function anItemType(over: Partial<ItemType> = {}): ItemType {
  return { id: null, label: 'Story', ...over };
}

/** A Local release (no connector) with two sprints and one work stream. */
export function aRelease(over: Partial<Release> = {}): Release {
  return {
    id: 'rel_1',
    name: 'Orion 2.0',
    startISO: '2026-04-13',
    teamId: 'team_1',
    workStreams: [aStream()],
    events: [],
    sprints: [
      aSprint({ id: 'sp1', name: 'Sprint 1', startISO: '2026-04-13', endISO: '2026-04-26' }),
      aSprint({ id: 'sp2', name: 'Sprint 2', startISO: '2026-04-27', endISO: '2026-05-10' }),
    ],
    codeFreezeISO: null,
    externalId: null,
    connector: null,
    sync: null,
    catalog: null,
    sprintLengthDays: 14,
    ...over,
  };
}

/** The same release bound to a connector — the shape sync, push and share tests
 *  need. Pass `connector` to change which one. */
export function aConnectorRelease(over: Partial<Release> = {}): Release {
  const connector: ReleaseConnector = { type: 'acme', config: {} };
  return aRelease({ connector, externalId: 'EXT-REL-1', ...over });
}

export function anItem(over: Partial<WorkItem> = {}): WorkItem {
  return {
    id: nextId('it'),
    releaseId: 'rel_1',
    workStreamId: 'ws1',
    sprintId: 'sp1',
    key: 'K-1',
    subject: 'Subject',
    description: '',
    descriptionFormat: 'text',
    status: 'Not Started' as Status,
    points: 3,
    externalId: null,
    assignedMemberId: null,
    build: null,
    externalUrl: null,
    dirtyFields: [],
    syncedValues: null,
    itemType: null,
    statusNative: null,
    attributes: {},
    ...over,
  };
}

/**
 * A synced item: has an externalId and a baseline, so the dirty/revert/push paths
 * apply to it. `syncedValues` defaults to matching the item — i.e. clean.
 *
 * Tests the absence of a baseline by passing `syncedValues: null`, which is a
 * meaningfully different state from "not specified" (a synced item that predates
 * baselines can't be reverted). Hence the `in` check rather than `??`, which
 * would silently overwrite an explicit null with a default baseline.
 */
export function aSyncedItem(over: Partial<WorkItem> = {}): WorkItem {
  const base = anItem({ externalId: 'EXT-1', key: 'EXT-1', ...over });
  if ('syncedValues' in over) return { ...base, syncedValues: over.syncedValues };
  return { ...base, syncedValues: { points: base.points, sprint: base.sprintId } };
}

/** A whole store snapshot at the current schema version. */
export function aState(over: Partial<AppState> = {}): AppState {
  return {
    version: SCHEMA_VERSION,
    teams: [aTeam()],
    releases: [aRelease()],
    items: [],
    meta: { lastSyncISO: null },
    ...over,
  };
}
