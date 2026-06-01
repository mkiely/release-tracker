// Typed Zustand store — port of the Store singleton in proto-store.jsx.
// Keeps localStorage persistence and the sync() seam so a real backend can
// replace it later. State is treated immutably so React re-renders correctly.

import { create } from 'zustand';
import {
  SCHEMA_VERSION,
  type AppState,
  type Member,
  type Release,
  type ReleaseConnector,
  type Sprint,
  type Status,
  type Team,
  type WorkItem,
  type WorkStream,
} from '../types';
import { buildSprints, todayISO, uid } from '../lib/dates';
import { seed } from '../lib/seed';
import { applySync } from '../sync/applySync';
import { syncClient } from '../sync/client';
import type { SyncResult } from '../sync/schema';

/** Result of a sync attempt, shaped so the UI can craft a precise toast. */
export type SyncOutcome =
  | { ok: true; result: SyncResult }
  | { ok: false; reason: 'no-connector' | 'error'; message: string };

const LS_KEY = 'release-tracker:v1';

// Migrate a persisted state forward to the current SCHEMA_VERSION. Returns null
// if the stored shape is too old/unknown to upgrade safely.
function migrate(p: AppState): AppState | null {
  let s = p;
  // v1 → v2: connector sync. Releases gain `connector`/`sync` (default null).
  if (s.version === 1) {
    s = {
      ...s,
      version: 2,
      releases: s.releases.map((r) => ({ ...r, connector: r.connector ?? null, sync: r.sync ?? null })),
    };
  }
  return s.version === SCHEMA_VERSION ? s : null;
}

function load(): AppState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as AppState;
      if (p?.version === SCHEMA_VERSION) return p;
      const migrated = p && migrate(p);
      if (migrated) return migrated;
    }
  } catch {
    /* ignore */
  }
  return { version: SCHEMA_VERSION, teams: [], releases: [], items: [], meta: { lastSyncISO: null } };
}

function persist(state: AppState) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

interface Actions {
  reset: () => void;
  createTeam: (input: { name: string; velocity: number | string; members: string[] }) => Team;
  updateTeam: (id: string, patch: Partial<Pick<Team, 'name' | 'velocity' | 'members'>>) => void;
  createRelease: (input: { name: string; startISO: string; teamId: string; connector?: ReleaseConnector | null }) => Release;
  createWorkStream: (releaseId: string, name: string) => WorkStream | null;
  createEvent: (releaseId: string, input: { label: string; dateISO: string }) => void;
  updateSprint: (releaseId: string, n: number, patch: Partial<Sprint>) => void;
  createItem: (
    releaseId: string,
    input: { workStreamId: string; sprintN: number | string; subject: string; description?: string; status?: Status; points?: number },
  ) => WorkItem | null;
  updateItem: (id: string, patch: Partial<WorkItem>) => void;
  /** Pull from this release's connector and upsert the result. No-op for Local releases. */
  syncRelease: (releaseId: string) => Promise<SyncOutcome>;
}

type StoreState = AppState & { actions: Actions };

// helper: shallow-clone the data slice for an immutable update
function snapshot(s: StoreState): AppState {
  return { version: s.version, teams: s.teams, releases: s.releases, items: s.items, meta: s.meta };
}

export const useStore = create<StoreState>((set, get) => {
  const initial = load();
  persist(initial); // ensure first-run seed is written, matching the prototype

  // commit a mutated-in-place data slice: persist + trigger a re-render
  const commit = (mutate: (data: AppState) => void) => {
    const data = snapshot(get());
    mutate(data);
    persist(data);
    set({ ...data });
  };

  const release = (id: string) => get().releases.find((r) => r.id === id);

  const actions: Actions = {
    reset: () => {
      const fresh = seed();
      persist(fresh);
      set({ ...fresh });
    },

    createTeam: ({ name, velocity, members }) => {
      const t: Team = {
        id: uid('team'),
        name: name || 'Untitled team',
        velocity: Number(velocity) || 0,
        externalId: null,
        members: (members || []).filter((m) => m.trim()).map((m) => ({ id: uid('m'), name: m.trim(), externalId: null })),
      };
      commit((d) => { d.teams = [...d.teams, t]; });
      return t;
    },

    updateTeam: (id, patch) => {
      commit((d) => {
        d.teams = d.teams.map((t) => (t.id === id ? { ...t, ...patch } : t));
      });
    },

    createRelease: ({ name, startISO, teamId, connector }) => {
      const start = startISO || todayISO();
      const r: Release = {
        id: uid('rel'),
        name: name || 'Untitled release',
        startISO: start,
        teamId,
        workStreams: [],
        events: [],
        sprints: buildSprints(start, {}),
        externalId: null,
        connector: connector ?? null,
        sync: null,
      };
      commit((d) => { d.releases = [...d.releases, r]; });
      return r;
    },

    createWorkStream: (releaseId, name) => {
      if (!release(releaseId)) return null;
      const ws: WorkStream = { id: uid('ws'), name: name || 'Untitled stream', externalId: null };
      commit((d) => {
        d.releases = d.releases.map((r) =>
          r.id === releaseId ? { ...r, workStreams: [...r.workStreams, ws] } : r,
        );
      });
      return ws;
    },

    createEvent: (releaseId, { label, dateISO }) => {
      if (!release(releaseId)) return;
      const ev = { id: uid('ev'), label: label || 'Event', dateISO: dateISO || todayISO(), externalId: null };
      commit((d) => {
        d.releases = d.releases.map((r) =>
          r.id === releaseId ? { ...r, events: [...r.events, ev] } : r,
        );
      });
    },

    updateSprint: (releaseId, n, patch) => {
      commit((d) => {
        d.releases = d.releases.map((r) =>
          r.id === releaseId
            ? { ...r, sprints: r.sprints.map((s) => (s.n === n ? { ...s, ...patch } : s)) }
            : r,
        );
      });
    },

    createItem: (releaseId, { workStreamId, sprintN, subject, description, status, points }) => {
      const r = release(releaseId);
      if (!r) return null;
      const prefix = (r.name.match(/[A-Za-z]/g) || ['I']).slice(0, 3).join('').toUpperCase();
      const count = get().items.filter((i) => i.releaseId === releaseId).length;
      const it: WorkItem = {
        id: uid('it'),
        releaseId,
        workStreamId,
        sprintN: Number(sprintN),
        key: `${prefix}-${100 + count}`,
        subject: subject || 'Untitled item',
        description: description || '',
        status: status || 'Not Started',
        points: Number(points) || 0,
        externalId: null,
      };
      commit((d) => { d.items = [...d.items, it]; });
      return it;
    },

    updateItem: (id, patch) => {
      commit((d) => {
        d.items = d.items.map((i) => (i.id === id ? { ...i, ...patch } : i));
      });
    },

    syncRelease: async (releaseId) => {
      const r = release(releaseId);
      if (!r) return { ok: false, reason: 'error', message: 'Release not found' };
      if (!r.connector) return { ok: false, reason: 'no-connector', message: 'Release is not connected' };

      const stamp = () => new Date().toISOString();
      try {
        // The SyncClient is the only seam to the external system (fixtures today,
        // a real local service later). It returns app-schema data; applySync upserts it.
        const mapped = await syncClient.sync(r.connector);
        const { next, result } = applySync(snapshot(get()), releaseId, mapped);
        const at = stamp();
        next.meta = { ...next.meta, lastSyncISO: at };
        next.releases = next.releases.map((rel) =>
          rel.id === releaseId
            ? { ...rel, sync: { lastISO: at, state: 'ok' as const, message: `${result.created} new, ${result.updated} updated` } }
            : rel,
        );
        persist(next);
        set({ ...next });
        window.dispatchEvent(new CustomEvent('release-tracker:sync', { detail: { snapshot: next } }));
        return { ok: true, result };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        commit((d) => {
          d.releases = d.releases.map((rel) =>
            rel.id === releaseId ? { ...rel, sync: { lastISO: stamp(), state: 'error', message } } : rel,
          );
        });
        return { ok: false, reason: 'error', message };
      }
    },
  };

  return { ...initial, actions };
});

// non-reactive accessors
export const getState = () => useStore.getState();
export const getActions = () => useStore.getState().actions;

// ---- selectors (pure; take the current state) ----
export const selTeam = (s: AppState, id: string | undefined): Team | undefined =>
  s.teams.find((t) => t.id === id);
export const selRelease = (s: AppState, id: string | undefined): Release | undefined =>
  s.releases.find((r) => r.id === id);
export const selItemsFor = (s: AppState, releaseId: string): WorkItem[] =>
  s.items.filter((i) => i.releaseId === releaseId);
export const selItemsForStream = (s: AppState, releaseId: string, wsId: string): WorkItem[] =>
  s.items.filter((i) => i.releaseId === releaseId && i.workStreamId === wsId);
export const selItem = (s: AppState, id: string): WorkItem | undefined =>
  s.items.find((i) => i.id === id);

export type { Member };
