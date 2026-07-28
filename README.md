# Release Tracker

A frontend application for planning and tracking software release cycles across teams and work streams.

## Overview

Release Tracker helps engineering teams organize sprint-based releases. You define a release with a start date and a team; the app generates a sequence of sprints, lets you assign work items to streams and sprints, and visualizes capacity versus planned points across the whole release.

**Key concepts:**
- **Releases** — a named release cycle with a start date, a team, and a sequence of sprints (count and length chosen at creation, or driven by a connector)
- **Teams** — a group of members with a velocity that drives per-sprint capacity
- **Work streams** — parallel tracks of work within a release (analogous to epics)
- **Work items** — individual units of work with a status, point estimate, and sprint assignment

## Features

- Release plan view — sprint or work-stream rows with inline capacity meters, status bars, and event markers; switch the row axis and toggle a card or table layout
- Sprint view — group by work stream or status; filter by member, status, type, build; drag work items between sprints
- Work stream view — columns by sprint for a single stream
- Backlog and Unassigned lists — every incomplete item in the release, and items on this build not yet organized into a stream; flat or grouped by sprint
- Work-stream health — forward capacity-fit forecast (on-track / at-risk) with a burndown-vs-capacity detail modal
- Release analysis — velocity attainment against per-sprint planned baselines, team over-allocation, planning runway, and a rebalancing suggestion when a scope-complete stream is holding capacity an at-risk stream needs
- Code freeze — a release-wide check-in deadline (overridable per work stream) that caps forward capacity in the forecast and marks the sprint it lands in
- Connector sync — pull teams, sprints, streams, and work items from an external system via the [sync contract](./packages/sync-contract/README.md); edit writeable fields (points, sprint, status, connector-declared custom fields), review pending changes as old → new diffs, and push them back
- Connector vocabulary — custom fields a connector declares (e.g. a Bug's severity) round-trip, edit in the detail modal, and surface as table columns automatically; native workflow states (e.g. "QA Verify") display everywhere while capacity/health math computes on the five canonical status categories
- Item creation on connector releases through a catalog-driven form, with the service's field-level validation verdicts (422) shown inline under the offending inputs
- Capability handshake — when binding a connector the app summarizes what it supports, and releases flag "Connector limits" when a backend can't express a concept the app computes with (e.g. no story-points field)
- TSV export for pasting a release plan into a spreadsheet, and a share link that hands a connector release's configuration to a teammate
- Executive summary — a frozen, read-only analysis of a release encoded into a link, opened by a **standalone viewer** (`summary.html`) that needs no server and no app state; carries outputs, never work-item detail
- The two actions that emit work-item data — TSV export and the summary link — take an explicit scope (current build / all builds / current filters), chosen in the Share menu rather than inherited from whatever the view happens to be filtered to. The connector share link carries no work items, so it isn't governed by that choice
- Multiple color themes (light + dark variants), a text-size preference, and a presentation mode that composes with it, all persisted across sessions
- All data persists in `localStorage`, migrated forward on load through a versioned schema

## Stack

| Layer | Choice |
|---|---|
| UI | React 18 + TypeScript |
| Build | Vite |
| Routing | React Router v6 |
| State | Zustand |
| Styling | CSS Modules + CSS custom-property design tokens (`src/styles/tokens.css`) |
| Testing | Vitest (593 tests), jsdom opt-in per file |
| Sync contract | OpenAPI 3.0 + generated TypeScript types |

## Getting started

```bash
npm install
npm run dev
```

The app seeds demo data on first run. Use the settings control (sliders icon) in the top bar to switch the color theme, the card/table view style, and the text size.

## Connecting an external backend

Release Tracker can pull data from an external work tracking system through a local sync service that implements the [sync contract](./packages/sync-contract/README.md). Point the app at a running service with:

```
VITE_SYNC_BASE_URL=http://localhost:8787 npm run dev
```

When no `VITE_SYNC_BASE_URL` is set the app runs in local mode — all data is created and managed within the app. If the sync service returns no connectors, the app stays in local mode automatically and no connector UI is shown.

The reference sync service is **work-truck** (sibling repo): its `acme` connector is a self-contained dev backend exercising every contract capability, and the template for implementing new connectors.

## Project structure

```
src/
  routes/         # Thin route wrappers — bind URL params to a view hook + presenter
  hooks/          # Per-screen view-model hooks (useReleaseView, useSprintView, …)
  views/          # Presenters — card + table renderers for each screen
    table/        # The shared item-table module (headers, sprint bands, rows, sorting)
  components/     # Shared UI; *Chrome components own each screen's header
  modals/         # Modal dialogs + the modal host
  store/          # migrate | storage | actions | selectors, wired together in store.ts
                  # plus persisted.ts — the factory behind every UI preference
  sync/           # SyncClient, applySync, push — the connector seam
  lib/            # Pure domain logic: dates, capacity/health derivations, seed, export
  summary/        # The standalone summary viewer (second Vite entry, summary.html)
  test/           # factories.ts — the one place test entities are constructed
  styles/         # Global tokens.css + base.css (the type scale and role classes)
  types.ts        # The persisted domain model
packages/
  sync-contract/  # OpenAPI spec + generated TypeScript types (the sync wire contract)
scripts/          # Repo tooling (e.g. check-typography.mjs — the type-token guard)
docs/             # Architecture and design notes (not tracked in git)
documents/        # Local design references (not tracked in git)
```

The layering is strict and worth knowing before editing a screen: **routes** bind a
URL to a hook and a presenter; **hooks** own *all* store access, derivation and
handler binding; **views** are pure functions of their props. If a file in `views/`
needs the store, the logic belongs in that screen's hook.

## Typography

All UI text is driven by one type scale defined in [`src/styles/tokens.css`](./src/styles/tokens.css), with role-based utility classes in [`src/styles/base.css`](./src/styles/base.css). Prefer these tokens/classes over hardcoded `font-size`/`font-weight` so text stays proportional as the design is tuned.

### The global lever

`--rt-type-scale` (default `1`) multiplies **every** size token, so changing it once rescales all UI text proportionally — the master knob for dialing the overall type "feel":

```css
:root { --rt-type-scale: 1.05; } /* 5% larger everywhere */
```

### Size ramp — `--rt-fs-*`

Each step is `calc(<px> * var(--rt-type-scale))`. Sizes snap to this 7-step ramp (+ display) rather than ad-hoc values.

| Token | Size | Role |
|---|---|---|
| `--rt-fs-micro` | 10px | counts, tiny labels |
| `--rt-fs-xs` | 11.5px | meta, dates, tags |
| `--rt-fs-sm` | 12.5px | secondary text |
| `--rt-fs-base` | 13.5px | body |
| `--rt-fs-md` | 15px | inputs, emphasized |
| `--rt-fs-lg` | 17px | card / section titles |
| `--rt-fs-xl` | 22px | screen titles |
| `--rt-fs-display` | 26px | home hero |

### Weights — `--rt-fw-*`

`normal` 400 · `medium` 500 · `semibold` 600 · `bold` 700 · `heading` 750 · `display` 800

### Line heights — `--rt-lh-*`

`tight` 1.15 · `snug` 1.3 · `normal` 1.5

### Role classes — `.t-*`

Apply a complete role (size + weight + line-height, sometimes colour) with a single class instead of setting each property:

`.t-display` · `.t-title` · `.t-heading` · `.t-subhead` · `.t-body` · `.t-body-sm` · `.t-meta` · `.t-micro` · `.t-label` · `.t-num`

For example, `className="t-meta"` replaces `style={{ fontSize: 11.5, color: 'var(--rt-t3)' }}`. CSS Modules reference the raw `var(--rt-fs-*)` / `var(--rt-fw-*)` tokens directly.

### Enforcement

`npm run lint:type` — part of `npm run check`, which `build` and `test` both run — fails if a raw px `font-size` / numeric `font-weight` lands in CSS, or a numeric `fontSize` / `fontWeight` lands in TSX, keeping the token ramp the single source of truth. Relative `em` sizes (the prose heading scale) and `var()` references are allowed.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Type-check + production build (runs `check` first) |
| `npm test` | Run unit tests (Vitest) (runs `check` first) |
| `npm run test:watch` | Vitest in watch mode |
| `npm run check` | `lint:type` + `lint` — the gate `build` and `test` run |
| `npm run lint` | ESLint |
| `npm run lint:type` | Guard against hardcoded type values (enforces the token ramp) |
| `npm run preview` | Serve the production build locally |
| `npm run gen:contract` | Regenerate TypeScript types from the OpenAPI spec |
| `npm run prepack` | Stage the flattened sync contract for the release tarball |

Both `build` and `test` run `check` first, so a lint error fails the build rather
than accumulating quietly.

**Note on verifying UI work:** CSS Module imports and rendering aren't
type-checked, so a broken import passes both `tsc` and the entire test suite. A
change to a screen needs a browser check, not just a green run.
