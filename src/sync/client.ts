// SyncClient — the app's single seam to the local sync service. Two interchangeable
// implementations behind one interface: FixtureSyncClient (now) and HttpSyncClient
// (once the service exists). Because both return the same types, swapping them
// changes no other app code. The store and UI depend only on this interface.

import type { ConnectorType, ReleaseConnector } from '../types';
import type { ConnectorMeta, MappedRelease, PushItemChange, PushResult, ValidateResult } from '@release-tracker/sync-contract';
import { FIXTURE_CONNECTORS, fixtureMappedRelease } from './fixtures';

// Wire types come from the app-owned Sync Contract; re-export so app code can keep
// importing them from the client module.
export type { ConnectorMeta, ValidateResult, PushItemChange, PushResult } from '@release-tracker/sync-contract';

export interface SyncClient {
  /** GET /connectors — available connectors + their required config. */
  listConnectors(): Promise<ConnectorMeta[]>;
  /** POST /connectors/{type}/validate — check config/creds before saving. */
  validate(type: ConnectorType, config: Record<string, string>): Promise<ValidateResult>;
  /** POST /releases/{id}/sync — fetch + map external data for this release. */
  sync(connector: ReleaseConnector): Promise<MappedRelease>;
  /** POST /releases/{id}/push — write locally-dirty writeable fields back to the external system. */
  push(connector: ReleaseConnector, changes: PushItemChange[]): Promise<PushResult>;
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
}

/** REST client for the real local sync service. Activated once VITE_SYNC_BASE_URL is set. */
export class HttpSyncClient implements SyncClient {
  constructor(private readonly baseUrl: string) {}

  private async json<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: { 'content-type': 'application/json' },
      ...init,
    });
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
