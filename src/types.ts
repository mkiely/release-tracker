// Domain types for Release Tracker. Mirrors the schema in proto-store.jsx.

import type { ConnectorItemType, FieldSpec, StatusDef } from './sync/schema';

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
export const SCHEMA_VERSION = 22;

/** Sync-time snapshot of a connector's vocabulary: its item-type catalog, its
 *  status vocabulary (native workflow states mapped to canonical categories),
 *  and its work-stream field catalog (describes MappedWorkStream.attributes).
 *  Stored on the release so synced data stays interpretable offline. */
export interface ReleaseCatalog {
  itemTypes: ConnectorItemType[];
  statuses: StatusDef[];
  workStreamFields: FieldSpec[];
}

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
  /** App-owned enrichment: the user has muted the planning-runway proactive-creation
   *  alarm for this stream (e.g. tickets intentionally deferred while research is
   *  pending). Silences the alarm only — the stream still reads as un-judgeable, never
   *  green, when it has unclaimed runway (see derive.streamRunway). Survives connector
   *  sync. Defaults to false. */
  planningMuted: boolean;
  /** Connector-owned provenance: the build/release this stream was carried in from,
   *  when it differs from this release. null = native to this release. Drives the
   *  "on-build only" lens (hide carried-in streams). Mirrors WorkItem.build; set by
   *  sync (external wins), null for locally-created streams. */
  build: string | null;
  /** Connector-owned deep link: absolute URL to this work stream (epic) in the
   *  external system, opened in a new tab. Set by sync (external wins), null for
   *  locally-created streams or when the backend exposes no addressable page. */
  externalUrl: string | null;
  /** Connector vocabulary values keyed by FieldSpec.key (see WorkItem.attributes).
   *  Absence means none. Connector-owned: external wins on sync. */
  attributes?: Record<string, AttrValue>;
  /** App-owned enrichment: overrides the release's code freeze for this stream alone
   *  (e.g. an infra stream that must lock down ahead of feature streams). null/unset =
   *  inherits Release.codeFreezeISO. Survives connector sync. See derive.effectiveCodeFreeze. */
  codeFreezeISO?: string | null;
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
  /** Point-in-time planned-velocity baseline, in points (the fully-computed
   *  capacity-adjusted `sprintVel` captured when the sprint started). App-owned,
   *  survives connector sync. null = not yet frozen → planned velocity derives
   *  live from the current team velocity (future sprints). Once a sprint's window
   *  begins it is stamped (see stampStartedSprints) and becomes immutable, so
   *  later edits to `team.velocity` can never retroactively rewrite a started
   *  sprint's commitment — the foundation that makes attainment history stable
   *  and the velocity "Apply" action safe. See docs/metrics.md. */
  plannedVelocity: number | null;
}

/** Connector type id, e.g. 'acme'. The set is defined by the local sync service. */
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
  /** App-owned code check-in deadline. null = defaults to the last sprint's endISO
   *  (no artificial cutoff). Feeds the capacity-fit forecast/burndown (see
   *  derive.effectiveCodeFreeze) and renders as a critical-tone calendar chip on the
   *  sprint whose range contains it. Individual work streams may override via
   *  WorkStream.codeFreezeISO. */
  codeFreezeISO: string | null;
  externalId: string | null;
  connector: ReleaseConnector | null;
  sync: SyncStatus | null;
  /** Calendar length (in days) of every sprint in this release. Uniform across the
   *  release and fixed at creation — not editable. For local releases this drives
   *  buildSprints; for connector releases sprints come from the external system and
   *  may vary, so this holds a nominal value only and is not used for generation. */
  sprintLengthDays: number;
  /** Snapshot of the connector's vocabulary (item-type catalog + status
   *  vocabulary), taken at each sync. Lets the app interpret synced items'
   *  attributes and native statuses (labels, enum options, lock state) offline,
   *  and keeps already-synced items stable if the connector's live catalog
   *  changes between syncs. null/absent = never synced or Local release. */
  catalog?: ReleaseCatalog | null;
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
  points: number | null;
  externalId: string | null;
  assignedMemberId: string | null;
  /** The build/release label this item originated from, if it was pulled from a prior release. Set by the connector. */
  build: string | null;
  /** Connector-owned deep link: absolute URL to this item in the external system
   *  (e.g. its issue page), opened in a new tab. Set by sync (external wins), null
   *  for local items or when the backend exposes no addressable page. */
  externalUrl: string | null;
  /** Format of the description field. Absence or 'text' means plain text; 'html' means sanitized HTML from a connector. */
  descriptionFormat?: 'text' | 'html';
  /** Writeable fields edited locally since last sync/push, awaiting push. Empty for clean items. */
  dirtyFields: string[];
  /**
   * Last value seen from the connector for this item's writeable fields, keyed by
   * the same local field names used in {@link dirtyFields}: 'points' (number),
   * 'sprint' (local sprintId | null), and any writeable vocabulary keys
   * (FieldSpec.key → AttrValue). This is the baseline a dirty edit diverges from —
   * used to preview a pending push (old → new) and to revert an item back to its
   * synced value. Null for local (never-synced) items, where no baseline exists.
   */
  syncedValues?: Record<string, AttrValue> | null;
  /** Work item type (Bug, Story, Task, etc.). Connector-supplied and read-only. Null for local items or when unset. */
  itemType: ItemType | null;
  /**
   * The item's native workflow state — the connector's real status (e.g. "QA
   * Verify"), denormalized as {id, label} like itemType. `status` carries this
   * state's canonical *category*, which is what every derivation computes over;
   * this adds the true state for display/edit. Null for local items or when the
   * backend has no richer workflow than the canonical five.
   */
  statusNative?: { id: string; label: string } | null;
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
