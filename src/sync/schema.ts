// The app's view of the Sync Contract.
//
// The wire types (MappedRelease & friends) are owned by the app-published OpenAPI
// package @release-tracker/sync-contract — source of truth:
// packages/sync-contract/openapi.yaml. This module re-exports them for app code and
// adds SyncResult, which is app-internal (the outcome of applySync) and NOT part of
// the wire contract.

export type {
  MappedRelease,
  MappedItem,
  MappedWorkStream,
  MappedSprint,
  MappedTeam,
  MappedMember,
  ContractStatus,
  PushItemChange,
  PushResult,
} from '@release-tracker/sync-contract';

/** Outcome of applying a MappedRelease to local state. App-internal; never on the wire. */
export interface SyncResult {
  created: number;
  updated: number;
  skipped: number; // unresolved refs; overflow sprints (local releases only)
  warnings: string[];
}
