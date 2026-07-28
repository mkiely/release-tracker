// SyncClient — the app's single seam to the local sync service. The store and UI
// depend only on this interface, never on a concrete client, so a different
// transport can be slotted in without touching app code.

import type { ConnectorType, ReleaseConnector } from '../types';
import type { ConnectorItemType, ConnectorMeta, CreateItemRequest, MappedItem, MappedRelease, PushItemChange, PushResult, ValidateResult } from '@release-tracker/sync-contract';

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

/** REST client for the local sync service — the only implementation. */
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

/** Display label for a connector type id (e.g. 'acme' → 'Acme'); '' → 'Local'. */
export function connectorLabel(type: string): string {
  if (!type) return 'Local';
  return type.charAt(0).toUpperCase() + type.slice(1);
}

/** The base URL defaults to '' (relative / same-origin) so a bundled build talks to
 *  whatever host serves it; set VITE_SYNC_BASE_URL for the cross-origin dev path
 *  (e.g. vite :5173 → work-truck :8787). When the service is absent, calls reject and
 *  the UI degrades to local mode: the store surfaces the error and `/connectors`
 *  failures hide connector controls. */
export function createSyncClient(): SyncClient {
  const base = (import.meta.env?.VITE_SYNC_BASE_URL as string | undefined) ?? '';
  return new HttpSyncClient(base);
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
