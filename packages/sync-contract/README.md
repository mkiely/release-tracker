# @release-tracker/sync-contract

The app-owned, consumer-driven OpenAPI contract between Release Tracker and a local sync service.

## What it is

This package defines the HTTP interface a sync service must implement to connect Release Tracker to an external work tracking backend. **Release Tracker owns the spec; the service conforms to it.** The app never calls an external system directly — the sync service is an anti-corruption layer that authenticates, fetches, and maps backend data into the normalized shapes defined here.

A single sync service can expose multiple connectors (one per backend type). The app discovers available connectors at startup by calling `GET /connectors`.

## API surface

| Method | Path | Purpose | Errors |
|---|---|---|---|
| `GET` | `/connectors` | List available connectors and the config fields each requires | |
| `POST` | `/connectors/{type}/validate` | Validate a connector's config/credentials before saving | |
| `POST` | `/releases/sync` | Fetch and map external data for a release | |
| `POST` | `/releases/push` | Push locally-modified writeable fields back to the external system | `422 ValidationProblem` |
| `POST` | `/releases/items` | Create a work item; returns it mapped for reconciliation | `422 ValidationProblem` |

Full schema: [`openapi.yaml`](./openapi.yaml). **Reference implementation:** the
`acme` connector in the sibling `work-truck` repo (`src/connectors/acme/`) — a
self-contained dev backend exercising every capability below; build new
connectors against it.

## TypeScript types

Types are generated from the OpenAPI spec and re-exported from `src/index.ts` with ergonomic aliases:

```ts
import type {
  ConnectorMeta,       // A connector's id, label, config fields, item-type catalog + status vocabulary
  MappedRelease,       // Sync response: optional team + workStreams + sprints + items
  MappedTeam,          // Normalised team with its member roster (optional)
  MappedMember,        // Normalised team member
  MappedWorkStream,    // Normalised epic / track of work (+ optional attributes)
  MappedSprint,        // Normalised sprint with ISO date range
  MappedItem,          // Normalised work item; status coerced to ContractStatus (+ statusNative, attributes)
  ContractStatus,      // 'Not Started' | 'In Progress' | 'Under Review' | 'Blocked' | 'Complete'
  ConnectorItemType,   // A work-item type + its field catalog (FieldSpec[])
  FieldSpec,           // One field as DATA: kind/role/target + constraints + access flags
  StatusDef,           // One native workflow state mapped to a canonical category
  StatusRef,           // An item's native state, denormalized {id, label}
  AttributeBag,        // Vocabulary values keyed by FieldSpec.key (non-canonical fields)
  CreateItemRequest,   // POST /releases/items body
  PushItemChange,      // One item's dirty writeable fields: subject / description / points / extSprintId / extWorkStreamId / extAssigneeId / statusId / attributes
  PushResult,          // { pushed, failed, errors }
  FieldError,          // { field, message } — one 422 field verdict
  ValidationProblem,   // 422 body: { error, fieldErrors? }
  ValidateResult,      // { ok: boolean; error?: string }
} from '@release-tracker/sync-contract';
```

## Implementing a connector

Each `ConnectorMeta` describes one backend integration — both its routing config
and its **capability declaration** (the app derives create forms, edit locks,
push capability, table columns, and the bind-time capability summary from it):

```yaml
type: string          # unique id stored on the release, e.g. "acme"
label: string         # display name shown in the UI, e.g. "Acme (Dev)"
configFields: [...]   # fields the user fills in when creating a release
itemTypes:            # the work-item type catalog — every type the backend emits
  - id: acme_bug
    label: Bug
    fields:           # each field declared once, as DATA (see "Item types & fields")
      - { key: subject,  kind: string, role: subject, required: true, creatable: true }
      - { key: sprint,   kind: ref,    target: sprint, creatable: true, writeable: true }
      - { key: points,   kind: number, role: points,   creatable: true, writeable: true }
      - { key: status,   kind: enum,   enumRef: status, writeable: true }
      - { key: severity, kind: enum,   required: true, creatable: true, writeable: true,
          options: [{value: low, label: Low}, {value: critical, label: Critical}] }
statuses:             # the status vocabulary — native workflow states → categories
  - { id: todo,        label: To Do,     category: Not Started }
  - { id: in_review,   label: In Review, category: Under Review }
  - { id: qa,          label: QA Verify, category: Under Review }
```

Config values (project keys, board IDs, etc.) are stored on the release and passed back on every sync call. **Secrets such as API tokens should be managed by the sync service itself**, not stored in the release config.

### Checklist for a new connector

1. **Declare** `ConnectorMeta`: `type`, `label`, `configFields`, the `itemTypes`
   catalog (every type, every field, honest `creatable`/`writeable` flags), and
   the `statuses` vocabulary.
2. **Sync**: fetch + map to `MappedRelease`. Every item carries the coerced
   `status` category, `statusNative` when a vocabulary exists, refs as
   `ext*Id`s, and vocabulary values in `attributes` (filtered + coerced at the
   boundary).
3. **Push** (optional): apply `PushItemChange.fields` — `subject`,
   `description`, `points`, `extSprintId` (null = backlog), `extWorkStreamId`,
   `extAssigneeId` (null = unassigned), `statusId` (validate against the
   vocabulary), `attributes` (validate against the catalog). The app only sends
   a field when the item's type declares it `writeable`. Drop invalid values;
   report per-item failures in `PushResult.errors`.
4. **Create** (optional): validate (catalog constraints + your backend's own
   rules), persist, return the fully-mapped `MappedItem`. Reject with
   `422 ValidationProblem` carrying field-keyed errors.
5. Only declare what you implement — the app gates "New work item", edit locks,
   and push on the declarations, and surfaces missing concepts (no `role:
   points` field ⇒ "capacity math unavailable") at bind time.
6. **Run the conformance suite**: in work-truck, call
   `describeConnectorContract('<type>', YourConnector, { reset })` from
   `src/connectors/conformance.ts` in a `<type>/conformance.test.ts`. It checks
   the invariants above generically (canonical statuses, status-vocabulary
   membership, attribute-catalog membership, push/createItem round-trips and
   the 422 path) so you don't have to hand-write them per connector.

When `POST /releases/sync` is called, the service should:

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

When `POST /releases/items` is called, the service should create the item in
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

### Validation (the service is the authority)

The app validates client-side from `FieldSpec` constraints (`required`,
`options`, `min`/`max`, …) as a best effort, but the **service owns
validation**: it re-checks the catalog's declared constraints and applies its
backend's conditional/cross-field rules, which no declared schema can express
(e.g. "a critical bug requires reproduction steps"). On failure, `createItem`
and `push` return **422** with a `ValidationProblem` — a summary `error` plus
optional `fieldErrors: [{ field, message }]` keyed by `FieldSpec.key` so the
app's form marks the offending inputs inline.

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
