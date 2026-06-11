// SyncClient — the app's single seam to the local sync service. Two interchangeable
// implementations behind one interface: FixtureSyncClient (now) and HttpSyncClient
// (once the service exists). Because both return the same types, swapping them
// changes no other app code. The store and UI depend only on this interface.

import type { ConnectorType, ReleaseConnector } from '../types';
import type { ConnectorItemType, ConnectorMeta, CreateItemRequest, MappedItem, MappedRelease, PushItemChange, PushResult, ValidateResult } from '@release-tracker/sync-contract';
import { FIXTURE_CONNECTORS, fixtureCreatedItem, fixtureMappedRelease } from './fixtures';

// Wire types come from the app-owned Sync Contract; re-export so app code can keep
// importing them from the client module.
export type { ConnectorMeta, ValidateResult, PushItemChange, PushResult, ConnectorItemType, FieldSpec, FieldError } from '@release-tracker/sync-contract';

/** A 422 from the sync service: the request failed the connector's validation.
 *  Carries field-keyed errors so forms can mark the offending inputs inline. */
export class SyncValidationError extends Error {
  readonly fieldErrors: { field: string; message: string }[];
  constructor(message: string, fieldErrors: { field: string; message: string }[] = []) {
    super(message);
    this.name = 'SyncValidationError';
    this.fieldErrors = fieldErrors;
  }
}

/** Create-item request body minus `connector` (the client supplies that). */
export type CreateItemInput = Omit<CreateItemRequest, 'connector'>;

export interface SyncClient {
  /** GET /connectors — available connectors + their required config. */
  listConnectors(): Promise<ConnectorMeta[]>;
  /** POST /connectors/{type}/validate — check config/creds before saving. */
  validate(type: ConnectorType, config: Record<string, string>): Promise<ValidateResult>;
  /** POST /releases/sync — fetch + map external data for this release. */
  sync(connector: ReleaseConnector): Promise<MappedRelease>;
  /** POST /releases/push — write locally-dirty writeable fields back to the external system. */
  push(connector: ReleaseConnector, changes: PushItemChange[]): Promise<PushResult>;
  /** POST /releases/items — create a work item; returns it mapped for reconciliation. */
  createItem(connector: ReleaseConnector, req: CreateItemInput): Promise<MappedItem>;
}

/** Shared helper: confirm all required config fields for a connector are filled. */
function checkRequired(meta: ConnectorMeta | undefined, config: Record<string, string>): ValidateResult {
  if (!meta) return { ok: false, error: 'Unknown connector' };
  const missing = meta.configFields
    .filter((f) => f.required && !config[f.key]?.trim())
    .map((f) => f.label);
  return missing.length ? { ok: false, error: `Missing: ${missing.join(', ')}` } : { ok: true };
}

/** In-process client backed by local fixtures — no network. Used until the service exists. */
export class FixtureSyncClient implements SyncClient {
  async listConnectors(): Promise<ConnectorMeta[]> {
    return FIXTURE_CONNECTORS;
  }

  async validate(type: ConnectorType, config: Record<string, string>): Promise<ValidateResult> {
    return checkRequired(FIXTURE_CONNECTORS.find((c) => c.type === type), config);
  }

  async sync(connector: ReleaseConnector): Promise<MappedRelease> {
    const v = await this.validate(connector.type, connector.config);
    if (!v.ok) throw new Error(v.error ?? 'Invalid connector config');
    return fixtureMappedRelease();
  }

  async push(_connector: ReleaseConnector, changes: PushItemChange[]): Promise<PushResult> {
    return { pushed: changes.length, failed: 0, errors: [] };
  }

  async createItem(connector: ReleaseConnector, req: CreateItemInput): Promise<MappedItem> {
    return fixtureCreatedItem(connector, req);
  }
}

/** REST client for the real local sync service. Activated once VITE_SYNC_BASE_URL is set. */
export class HttpSyncClient implements SyncClient {
  constructor(private readonly baseUrl: string) {}

  private async json<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: { 'content-type': 'application/json' },
      ...init,
    });
    if (res.status === 422) {
      // Contract ValidationProblem: a summary + optional field-keyed errors.
      const body = (await res.json().catch(() => null)) as { error?: string; fieldErrors?: { field: string; message: string }[] } | null;
      throw new SyncValidationError(body?.error ?? 'Validation failed', body?.fieldErrors ?? []);
    }
    if (!res.ok) throw new Error(`Sync service ${res.status}: ${await res.text()}`);
    return res.json() as Promise<T>;
  }

  listConnectors(): Promise<ConnectorMeta[]> {
    return this.json<ConnectorMeta[]>('/connectors');
  }

  validate(type: ConnectorType, config: Record<string, string>): Promise<ValidateResult> {
    return this.json<ValidateResult>(`/connectors/${type}/validate`, {
      method: 'POST',
      body: JSON.stringify({ config }),
    });
  }

  sync(connector: ReleaseConnector): Promise<MappedRelease> {
    return this.json<MappedRelease>('/releases/sync', {
      method: 'POST',
      body: JSON.stringify({ connector }),
    });
  }

  push(connector: ReleaseConnector, changes: PushItemChange[]): Promise<PushResult> {
    return this.json<PushResult>('/releases/push', {
      method: 'POST',
      body: JSON.stringify({ connector, changes }),
    });
  }

  createItem(connector: ReleaseConnector, req: CreateItemInput): Promise<MappedItem> {
    return this.json<MappedItem>('/releases/items', {
      method: 'POST',
      body: JSON.stringify({ connector, ...req }),
    });
  }
}

/** Display label for a connector type id (e.g. 'jira' → 'Jira'); '' → 'Local'. */
export function connectorLabel(type: string): string {
  if (!type) return 'Local';
  return type.charAt(0).toUpperCase() + type.slice(1);
}

/** Pick the client by environment: real service if configured, else fixtures. */
export function createSyncClient(): SyncClient {
  const base = import.meta.env?.VITE_SYNC_BASE_URL as string | undefined;
  return base ? new HttpSyncClient(base) : new FixtureSyncClient();
}

/** App-wide singleton. */
export const syncClient: SyncClient = createSyncClient();

// Memoized connector list — a single fetch shared across the app so render-time
// capability checks (e.g. "can this connector create items?") don't refetch.
let connectorsPromise: Promise<ConnectorMeta[]> | null = null;
export function getConnectors(): Promise<ConnectorMeta[]> {
  if (!connectorsPromise) connectorsPromise = syncClient.listConnectors();
  return connectorsPromise;
}

/** The item types that have at least one creatable field; empty when creation is disabled. */
export function connectorCreateTypes(meta: ConnectorMeta | undefined): ConnectorItemType[] {
  return (meta?.itemTypes ?? []).filter((t) => t.fields.some((f) => f.creatable));
}
