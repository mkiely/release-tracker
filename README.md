# Release Tracker

A frontend application for planning and tracking software release cycles across teams and work streams.

## Overview

Release Tracker helps engineering teams organize sprint-based releases. You define a release with a start date and a team; the app generates a sequence of sprints, lets you assign work items to streams and sprints, and visualizes capacity versus planned points across the whole release.

**Key concepts:**
- **Releases** — a named release cycle with a start date, a team, and a sequence of two-week sprints (count configurable, or driven by a connector)
- **Teams** — a group of members with a velocity that drives per-sprint capacity
- **Work streams** — parallel tracks of work within a release (analogous to epics)
- **Work items** — individual units of work with a status, point estimate, and sprint assignment

## Features

- Release plan view — sprint or work-stream rows with inline capacity meters, status bars, and event markers; switch the row axis and toggle a card or table layout
- Sprint view — group by work stream or status; filter by member, status, type, build; drag work items between sprints
- Work stream view — columns by sprint for a single stream
- Work-stream health — forward capacity-fit forecast (on-track / at-risk) with a burndown-vs-capacity detail modal
- Connector sync — pull work items, sprints, and streams from an external system via the [sync contract](./packages/sync-contract/README.md), review pending local edits, and push them back
- TSV export for pasting a release plan into a spreadsheet
- Multiple color themes (light + dark variants) and a presentation mode, persisted across sessions
- All data persists in `localStorage`

## Stack

| Layer | Choice |
|---|---|
| UI | React 18 + TypeScript |
| Build | Vite |
| Routing | React Router v6 |
| State | Zustand |
| Styling | CSS Modules + CSS custom-property design tokens (`src/styles/tokens.css`) |
| Sync contract | OpenAPI 3.0 + generated TypeScript types |

## Getting started

```bash
npm install
npm run dev
```

The app seeds demo data on first run. Use the settings control (sliders icon) in the top bar to switch the color theme and the card/table view style.

## Connecting an external backend

Release Tracker can pull data from an external work tracking system through a local sync service that implements the [sync contract](./packages/sync-contract/README.md). Point the app at a running service with:

```
VITE_SYNC_BASE_URL=http://localhost:8787 npm run dev
```

When no `VITE_SYNC_BASE_URL` is set the app runs in local mode — all data is created and managed within the app. If the sync service returns no connectors, the app stays in local mode automatically and no connector UI is shown.

## Project structure

```
src/
  routes/         # Thin route wrappers — bind URL params to a view hook + presenter
  hooks/          # Per-screen view-model hooks (useReleaseView, useSprintView, …)
  views/          # Presenters — card + table renderers for each screen
  components/     # Shared UI primitives (buttons, inputs, modal, badges, filter chips, dnd)
  modals/         # Modal dialogs + the modal host
  store/          # Zustand store, typed data model, localStorage persistence + migrations
  sync/           # SyncClient interface, fixture client, applySync + push
  lib/            # Pure utilities: dates, capacity/health derivations, seed, TSV export
  styles/         # Global tokens.css + base.css (the type scale and role classes)
packages/
  sync-contract/  # OpenAPI spec + generated TypeScript types (the sync wire contract)
scripts/          # Repo tooling (e.g. check-typography.mjs — the type-token guard)
documents/        # Local design references (not tracked in git)
```

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

`npm run lint:type` (run automatically before `build` and `test`) fails if a raw px `font-size` / numeric `font-weight` lands in CSS, or a numeric `fontSize` / `fontWeight` lands in TSX — keeping the token ramp the single source of truth. Relative `em` sizes (the prose heading scale) and `var()` references are allowed.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Type-check + production build (runs `lint:type` first) |
| `npm test` | Run unit tests (Vitest) (runs `lint:type` first) |
| `npm run lint:type` | Guard against hardcoded type values (enforces the token ramp) |
| `npm run gen:contract` | Regenerate TypeScript types from the OpenAPI spec |
