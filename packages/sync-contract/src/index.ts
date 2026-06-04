// @release-tracker/sync-contract — the app-owned, consumer-driven Sync Contract.
//
// SOURCE OF TRUTH: ../openapi.yaml. Run `npm run generate` after editing it to
// refresh ./generated.ts (do not hand-edit generated.ts). This barrel re-exports
// ergonomic type aliases extracted from the generated `components.schemas`, so
// both the app and the sync service consume the same names without reaching into
// `components["schemas"][...]`.

import type { components } from './generated';

type Schemas = components['schemas'];

/** The app's four canonical work-item statuses (service coerces to one of these). */
export type ContractStatus = Schemas['Status'];

export type MappedMember = Schemas['MappedMember'];
export type MappedTeam = Schemas['MappedTeam'];
export type MappedWorkStream = Schemas['MappedWorkStream'];
export type MappedSprint = Schemas['MappedSprint'];
export type MappedItem = Schemas['MappedItem'];
export type MappedRelease = Schemas['MappedRelease'];

export type ConnectorConfigField = Schemas['ConnectorConfigField'];
export type ConnectorMeta = Schemas['ConnectorMeta'];
export type ValidateResult = Schemas['ValidateResult'];

/** Request bodies (primarily for the service side). */
export type ReleaseConnectorPayload = Schemas['ReleaseConnector'];
export type SyncRequest = Schemas['SyncRequest'];
export type ValidateRequest = Schemas['ValidateRequest'];
export type PushItemChange = Schemas['PushItemChange'];
export type PushRequest = Schemas['PushRequest'];
export type PushResult = Schemas['PushResult'];

/** Raw generated paths/components, for codegen-heavy consumers (e.g. typed fetch). */
export type { paths, components, operations } from './generated';

/**
 * Contract version. Must match `info.version` in openapi.yaml. Distinct from the
 * app's localStorage SCHEMA_VERSION — this versions the wire contract between the
 * app and the sync service.
 */
export const SYNC_CONTRACT_VERSION = '0.4.0';
