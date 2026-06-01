// Domain types for Release Tracker. Mirrors the schema in proto-store.jsx.

export const STATUSES = ['Not Started', 'Active', 'Blocked', 'Complete'] as const;
export type Status = (typeof STATUSES)[number];

export const WORKDAYS = 10; // working days per 2-week sprint
export const SPRINT_LEN_DAYS = 14;
export const SPRINT_COUNT = 8;
export const SCHEMA_VERSION = 1;

export interface Member {
  id: string;
  name: string;
}

export interface Team {
  id: string;
  name: string;
  velocity: number;
  members: Member[];
}

export interface WorkStream {
  id: string;
  name: string;
}

export interface ReleaseEvent {
  id: string;
  label: string;
  dateISO: string;
}

export interface Sprint {
  n: number;
  name: string;
  startISO: string;
  endISO: string;
  daysOff: number;
}

export interface Release {
  id: string;
  name: string;
  startISO: string;
  teamId: string;
  workStreams: WorkStream[];
  events: ReleaseEvent[];
  sprints: Sprint[];
}

export interface WorkItem {
  id: string;
  releaseId: string;
  workStreamId: string;
  sprintN: number;
  key: string;
  subject: string;
  description: string;
  status: Status;
  points: number;
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
