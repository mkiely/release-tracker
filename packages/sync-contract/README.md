# @release-tracker/sync-contract

The app-owned, consumer-driven OpenAPI contract between Release Tracker and a local sync service.

## What it is

This package defines the HTTP interface a sync service must implement to connect Release Tracker to an external work tracking backend. **Release Tracker owns the spec; the service conforms to it.** The app never calls an external system directly — the sync service is an anti-corruption layer that authenticates, fetches, and maps backend data into the normalized shapes defined here.

A single sync service can expose multiple connectors (one per backend type). The app discovers available connectors at startup by calling `GET /connectors`.

## API surface

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/connectors` | List available connectors and the config fields each requires |
| `POST` | `/connectors/{type}/validate` | Validate a connector's config/credentials before saving |
| `POST` | `/releases/{id}/sync` | Fetch and map external data for a release |

Full schema: [`openapi.yaml`](./openapi.yaml).

## TypeScript types

Types are generated from the OpenAPI spec and re-exported from `src/index.ts` with ergonomic aliases:

```ts
import type {
  ConnectorMeta,       // A connector's id, label, and required config fields
  MappedRelease,       // Sync response: workStreams + sprints + items
  MappedWorkStream,    // Normalised epic / track of work
  MappedSprint,        // Normalised sprint with ISO date range
  MappedItem,          // Normalised work item; status coerced to ContractStatus
  ContractStatus,      // 'Not Started' | 'Active' | 'Blocked' | 'Complete'
  ValidateResult,      // { ok: boolean; error?: string }
} from '@release-tracker/sync-contract';
```

## Implementing a connector

Each `ConnectorMeta` describes one backend integration:

```yaml
type: string          # unique id shown in the URL and stored on the release, e.g. "jira"
label: string         # display name shown in the UI, e.g. "Jira"
configFields: [...]   # fields the user fills in when creating a release
```

Config values (project keys, board IDs, etc.) are stored on the release and passed back on every sync call. **Secrets such as API tokens should be managed by the sync service itself**, not stored in the release config.

When `POST /releases/{id}/sync` is called, the service should:

1. Read the connector `type` and `config` from the request body.
2. Fetch work streams (epics), sprints, and items from the backend.
3. Return a `MappedRelease` with all three lists normalized to the contract shapes.

The app's `applySync` function handles merging the response into local state — the service only needs to produce the payload.

### Status coercion

External statuses must be coerced to one of the four `ContractStatus` values before returning:

| Value | Meaning |
|---|---|
| `Not Started` | Work has not begun |
| `Active` | In progress |
| `Blocked` | Impeded |
| `Complete` | Done |

### Unscheduled items

If an item has no external sprint assignment, set `extSprintId: null`. The app places such items into the release backlog.

## Regenerating types

After editing `openapi.yaml`, regenerate the TypeScript bindings from the repo root:

```bash
npm run gen:contract
```

Or from this package directory:

```bash
npm run generate
```

Do not hand-edit `src/generated.ts` — it is overwritten on every run.

## Contract versioning

`SYNC_CONTRACT_VERSION` (exported from `src/index.ts`) matches `info.version` in `openapi.yaml`. This versions the wire contract independently of the app's `localStorage` schema version. Increment it when making breaking changes to the API surface.
