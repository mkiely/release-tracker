# Release Tracker

A frontend application for planning and tracking software release cycles across teams and work streams.

## Overview

Release Tracker helps engineering teams organize sprint-based releases. You define a release with a start date and a team; the app generates a sequence of sprints, lets you assign work items to streams and sprints, and visualizes capacity versus planned points across the whole release.

**Key concepts:**
- **Releases** — a named release cycle with a start date, a team, and a fixed sequence of two-week sprints
- **Teams** — a group of members with a velocity that drives per-sprint capacity
- **Work streams** — parallel tracks of work within a release (analogous to epics)
- **Work items** — individual units of work with a status, point estimate, and sprint assignment

## Features

- Release plan view — horizontal sprint rows with inline capacity meters and event markers
- Sprint view — columns by work stream; drag work items between sprints
- Work stream view — columns by sprint for a single stream
- Light / dark theme, persisted across sessions
- All data persists in `localStorage`
- Connector extensibility — pull work items, sprints, and streams from any external work tracking system via the [sync contract](./packages/sync-contract/README.md)

## Stack

| Layer | Choice |
|---|---|
| UI | React 18 + TypeScript |
| Build | Vite |
| Routing | React Router v6 |
| State | Zustand |
| Styling | CSS custom properties (`design-tokens.css`) |
| Sync contract | OpenAPI 3.0 + generated TypeScript types |

## Getting started

```bash
npm install
npm run dev
```

The app seeds demo data on first run. Use the sun/moon control in the top bar to toggle the theme.

## Connecting an external backend

Release Tracker can pull data from an external work tracking system through a local sync service that implements the [sync contract](./packages/sync-contract/README.md). Point the app at a running service with:

```
VITE_SYNC_BASE_URL=http://localhost:8787 npm run dev
```

When no `VITE_SYNC_BASE_URL` is set the app runs in local mode — all data is created and managed within the app. If the sync service returns no connectors, the app stays in local mode automatically and no connector UI is shown.

## Project structure

```
src/
  routes/         # Page-level components (Home, Release, Sprint, WorkStream)
  components/     # Shared UI primitives (buttons, inputs, modals, badges)
  store/          # Zustand store, typed data model, localStorage persistence
  sync/           # SyncClient interface, fixture client, applySync
  lib/            # Pure utilities: dates, capacity derivations, seed data
packages/
  sync-contract/  # OpenAPI spec + generated TypeScript types (the sync wire contract)
documents/        # Local design references (not tracked in git)
```

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Type-check + production build |
| `npm test` | Run unit tests (Vitest) |
| `npm run gen:contract` | Regenerate TypeScript types from the OpenAPI spec |
