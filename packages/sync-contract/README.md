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
| `POST` | `/releases/{id}/push` | Push locally-modified writeable fields back to the external system |
| `POST` | `/releases/{id}/items` | Create a work item; returns it mapped for reconciliation |

Full schema: [`openapi.yaml`](./openapi.yaml).

## TypeScript types

Types are generated from the OpenAPI spec and re-exported from `src/index.ts` with ergonomic aliases:

```ts
import type {
  ConnectorMeta,       // A connector's id, label, and required config fields
  MappedRelease,       // Sync response: optional team + workStreams + sprints + items
  MappedTeam,          // Normalised team with its member roster (optional)
  MappedMember,        // Normalised team member
  MappedWorkStream,    // Normalised epic / track of work
  MappedSprint,        // Normalised sprint with ISO date range
  MappedItem,          // Normalised work item; status coerced to ContractStatus
  ContractStatus,      // 'Not Started' | 'In Progress' | 'Under Review' | 'Blocked' | 'Complete'
  ConnectorItemType,   // A work-item type + its field catalog (FieldSpec[])
  FieldSpec,           // One field as DATA: kind/role/target + constraints + access flags
  CreateItemRequest,   // POST /releases/{id}/items body
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
2. Fetch work streams (epics), sprints, and items from the backend — and optionally the team + member roster.
3. Return a `MappedRelease` with the lists (and optional `team`) normalized to the contract shapes.

The app's `applySync` function handles merging the response into local state — the service only needs to produce the payload.

### Status coercion

External statuses must be coerced to one of the five `ContractStatus` values before returning:

| Value | Meaning |
|---|---|
| `Not Started` | Work has not begun |
| `In Progress` | Actively being worked |
| `Under Review` | In review / awaiting verification |
| `Blocked` | Impeded |
| `Complete` | Done |

### Unscheduled items

If an item has no external sprint assignment, set `extSprintId: null`. The app places such items into the release backlog.

### Item types & fields

A connector describes its work-item types in **one catalog**: `ConnectorMeta.itemTypes`,
a list of `ConnectorItemType` (`id`, `label`, `fields`). List every type the
connector emits — the app derives the create form, push capability, and edit
lock-state from this single source. Absent or empty ⇒ nothing is creatable (the
app hides "New work item") and nothing is writeable.

Each `FieldSpec` describes a field as **data**, never as a UI control — the app
owns the data→control mapping. Access is per field: `creatable` (shown on the
create form) and `writeable` (pushable on an existing item). A field with
`creatable: true, writeable: false` is set once at creation and immutable after.

| `kind` | Meaning | Create/push mapping |
|---|---|---|
| `string` | text (hints: `multiline`, `sensitive`) | `fields[key]` |
| `number` | numeric (use `role: points` for an estimate) | `fields[key]` |
| `boolean` | flag | `fields[key]` |
| `date` | ISO date | `fields[key]` |
| `enum` | choices — `options[]`, or `enumRef: status` (app supplies the set) | `fields[key]` |
| `ref` + `target: workStream` | a work stream | `extWorkStreamId` |
| `ref` + `target: sprint` | a sprint | `extSprintId` (null = backlog) |
| `ref` + `target: member` | an assignee | `extAssigneeId` |

`role` (`subject | description | points | status`) tags a field that maps to a
well-known app concept, so the app recognizes it regardless of `key` (e.g. Jira's
`customfield_10016` with `role: points`) — used for serialization, control choice,
and edit-lock derivation. Validation hints: `required`, `options`, `min`/`max`/`step`,
`maxLength`/`pattern`. The app validates client-side before calling the service.

When `POST /releases/{id}/items` is called, the service should create the item in
the backend, assign its key/id, and return a fully-normalized **`MappedItem`** (the
same shape sync returns). The app reconciles it as a synced item — no follow-up
sync required.

### Status vocabulary

The five canonical statuses are **categories** — the buckets the app's
derivations (capacity, health, segments) compute over. A backend with a richer
workflow declares its native states in `ConnectorMeta.statuses`
(`[{ id, label, category }]`; several states may share a category) and tags each
item with `fields.statusNative: { id, label }` alongside the coerced
`fields.status` category. The app displays the native label everywhere while
computing on the category.

When an item type declares a writeable status field (`enumRef: status` or
`role: status` with `writeable: true`), the app offers the vocabulary as edit
options and pushes transitions as `PushItemChange.fields.statusId` — a
`StatusDef.id` the service must validate against its vocabulary before writing.
No vocabulary declared ⇒ items carry no `statusNative` and status stays
read-only in the app.

### Attributes (connector vocabulary)

Catalog fields that do **not** map to a canonical concept — no `role`, not
`kind: ref`, not an app-canonical enum — are *vocabulary* fields (e.g. a Bug's
`severity`). Their values round-trip in `attributes` on `MappedItem` /
`MappedWorkStream`, keyed by `FieldSpec.key`. Rules for the service:

- **Filter at the boundary**: emit only keys declared in the catalog; never
  leak raw backend fields the catalog doesn't describe.
- **Coerce to the declared `kind`**: scalars only — strings stay strings,
  numbers parse or are dropped, enum values must be one of `options[]`.
- **Never duplicate canonical data**: subject/status/points/refs travel in
  `fields` and the `ext*Id` refs, never in `attributes`.

The app stores attributes verbatim. A vocabulary field with `writeable: true`
is editable in the app and pushes back through `PushItemChange.fields.attributes`
(same key discipline); the service validates each pushed value against its
catalog — declared key, coercible kind, enum membership — before writing to the
backend. Fields without `writeable` render read-only.

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
