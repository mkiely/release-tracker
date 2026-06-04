// Domain types for Release Tracker. Mirrors the schema in proto-store.jsx.

export const STATUSES = ['Not Started', 'Active', 'Blocked', 'Complete'] as const;
export type Status = (typeof STATUSES)[number];

// Reference value: working days in a standard 2-week sprint. No longer used in
// derivations — capacity now uses workdaysInRange() over a sprint's actual range
// to support variable-length (connector) sprints. Kept for documentation.
export const WORKDAYS = 10;
export const SPRINT_LEN_DAYS = 14;
export const DEFAULT_SPRINT_COUNT = 8;
export const SCHEMA_VERSION = 4;

export interface Member {
  id: string;
  name: string;
  externalId: string | null;
}

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
}

export interface ReleaseEvent {
  id: string;
  label: string;
  dateISO: string;
  externalId: string | null;
}

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
}

export interface WorkItem {
  id: string;
  releaseId: string;
  workStreamId: string;
  sprintId: string | null;
  key: string;
  subject: string;
  description: string;
  status: Status;
  points: number;
  externalId: string | null;
  assignedMemberId: string | null;
  /** Writeable fields edited locally since last sync/push, awaiting push. Empty for clean items. */
  dirtyFields: string[];
}

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
