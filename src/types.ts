// Domain types for Release Tracker. Mirrors the schema in proto-store.jsx.

import type { ConnectorItemType } from './sync/schema';

export const STATUSES = ['Not Started', 'In Progress', 'Under Review', 'Blocked', 'Complete'] as const;
export type Status = (typeof STATUSES)[number];

/** A connector-vocabulary attribute value (scalars only; mirrors the wire AttributeBag). */
export type AttrValue = string | number | boolean | null;

// Reference value: working days in a standard 2-week sprint. No longer used in
// derivations — capacity now uses workdaysInRange() over a sprint's actual range
// to support variable-length (connector) sprints. Kept for documentation.
export const WORKDAYS = 10;
export const SPRINT_LEN_DAYS = 14;
export const DEFAULT_SPRINT_COUNT = 8;
export const SCHEMA_VERSION = 13;

/** A person on a team. Members supply the per-sprint capacity (person-days). */
export interface Member {
  id: string;
  name: string;
  externalId: string | null;
  /** When true, excluded from capacity calculations (e.g. EMs, PMs who don't contribute velocity). */
  nonContributing: boolean;
}

/** Work item type. For connector releases, supplied by the connector and read-only.
 *  For local releases, chosen from LOCAL_ITEM_TYPES and editable. */
export interface ItemType {
  /** Connector-assigned type ID; null for locally-set types. */
  id: string | null;
  /** Display label. */
  label: string;
}

/** Predefined type choices for local (non-connector) work items. */
export const LOCAL_ITEM_TYPES = ['Bug', 'User Story', 'Investigation'] as const;
export type LocalItemType = (typeof LOCAL_ITEM_TYPES)[number];

/** A delivery team. `velocity` is points completed at full capacity; it scales
 *  down per sprint by the capacity fraction (see derive.sprintVel). */
export interface Team {
  id: string;
  name: string;
  velocity: number;
  members: Member[];
  externalId: string | null;
}

export interface WorkStream {
  id: string;
  name: string;
  externalId: string | null;
  /** App-owned enrichment: engineers the stream needs to progress. Drives the
   *  capacity-fit health forecast. Survives connector sync (sync only owns name).
   *  null = not yet configured. */
  engineersRequired: number | null;
  /** Connector-owned provenance: the build/release this stream was carried in from,
   *  when it differs from this release. null = native to this release. Drives the
   *  "on-build only" lens (hide carried-in streams). Mirrors WorkItem.build; set by
   *  sync (external wins), null for locally-created streams. */
  build: string | null;
  /** Connector vocabulary values keyed by FieldSpec.key (see WorkItem.attributes).
   *  Absence means none. Connector-owned: external wins on sync. */
  attributes?: Record<string, AttrValue>;
}

/** A dated milestone on the release calendar (e.g. code freeze). Rendered on the
 *  sprint row whose date range contains `dateISO`. */
export interface ReleaseEvent {
  id: string;
  label: string;
  dateISO: string;
  externalId: string | null;
}

/** One sprint in a release. `daysOff` is person-days lost (holidays, PTO) and
 *  reduces the sprint's effective capacity. Dates are inclusive ISO (YYYY-MM-DD). */
export interface Sprint {
  id: string;
  name: string;
  startISO: string;
  endISO: string;
  daysOff: number;
  externalId: string | null;
}

/** Connector type id, e.g. 'jira'. The set is defined by the local sync service. */
export type ConnectorType = string;

/**
 * A release's binding to an external system. Held on the release so sync knows
 * what to pull. `config` carries only non-secret routing params (which
 * project/board/version) — credentials live in the sync service, never here.
 * A "Local" release has `connector === null` and never syncs.
 */
export interface ReleaseConnector {
  type: ConnectorType;
  config: Record<string, string>;
}

/** Per-release sync state, surfaced in the UI (badge + toast). */
export interface SyncStatus {
  lastISO: string | null;
  state: 'idle' | 'ok' | 'error';
  message: string | null;
}

/** A release cycle: a team, a sprint schedule, and the work streams/events
 *  planned across it. Work items reference it by id (they live in AppState.items,
 *  not nested here). A connector-backed release also carries sync state. */
export interface Release {
  id: string;
  name: string;
  startISO: string;
  teamId: string;
  workStreams: WorkStream[];
  events: ReleaseEvent[];
  sprints: Sprint[];
  externalId: string | null;
  connector: ReleaseConnector | null;
  sync: SyncStatus | null;
  /** Snapshot of the connector's itemTypes catalog, taken at each sync. Lets the
   *  app interpret synced items' attributes (labels, enum options, lock state)
   *  offline and keeps already-synced items stable if the connector's live catalog
   *  changes between syncs. null/absent = never synced or Local release. */
  catalog?: ConnectorItemType[] | null;
}

/** A single piece of work. Belongs to one release, optionally assigned to a work
 *  stream and a sprint (null sprint = backlog). Synced items track a dirty/baseline
 *  pair so local edits can be previewed and pushed back to the external system. */
export interface WorkItem {
  id: string;
  releaseId: string;
  workStreamId: string | null;
  sprintId: string | null;
  key: string;
  subject: string;
  description: string;
  status: Status;
  points: number;
  externalId: string | null;
  assignedMemberId: string | null;
  /** The build/release label this item originated from, if it was pulled from a prior release. Set by the connector. */
  build: string | null;
  /** Format of the description field. Absence or 'text' means plain text; 'html' means sanitized HTML from a connector. */
  descriptionFormat?: 'text' | 'html';
  /** Writeable fields edited locally since last sync/push, awaiting push. Empty for clean items. */
  dirtyFields: string[];
  /**
   * Last value seen from the connector for the writeable fields (points, sprint).
   * This is the baseline a dirty edit diverges from — used to preview a pending
   * push (old → new) and to revert an item back to its synced value. Null for
   * local (never-synced) items, where no synced baseline exists.
   */
  syncedValues?: { points: number; sprintId: string | null } | null;
  /** Work item type (Bug, Story, Task, etc.). Connector-supplied and read-only. Null for local items or when unset. */
  itemType: ItemType | null;
  /**
   * Connector vocabulary values keyed by FieldSpec.key — fields the connector's
   * catalog declares but that don't map to a canonical concept (e.g. a Bug's
   * severity). Interpreted via the release's catalog snapshot; rendered read-only.
   * Absence means none. Connector-owned: external wins on sync.
   */
  attributes?: Record<string, AttrValue>;
}

/** The entire persisted application state — the single object the store holds
 *  and serializes to localStorage. `version` drives schema migrations on load. */
export interface AppState {
  version: number;
  teams: Team[];
  releases: Release[];
  items: WorkItem[];
  meta: { lastSyncISO: string | null };
}

/** A status segment for the segmented bar: status key + count. */
export interface StatusSeg {
  k: Status;
  v: number;
}
