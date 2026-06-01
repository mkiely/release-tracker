// Typed Zustand store — port of the Store singleton in proto-store.jsx.
// Keeps localStorage persistence and the sync() seam so a real backend can
// replace it later. State is treated immutably so React re-renders correctly.

import { create } from 'zustand';
import {
  SCHEMA_VERSION,
  type AppState,
  type Member,
  type Release,
  type Sprint,
  type Status,
  type Team,
  type WorkItem,
  type WorkStream,
} from '../types';
import { buildSprints, todayISO, uid } from '../lib/dates';
import { seed } from '../lib/seed';

const LS_KEY = 'release-tracker:v1';

function load(): AppState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as AppState;
      if (p && p.version === SCHEMA_VERSION) return p;
    }
  } catch {
    /* ignore */
  }
  return seed();
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
  createRelease: (input: { name: string; startISO: string; teamId: string }) => Release;
  createWorkStream: (releaseId: string, name: string) => WorkStream | null;
  createEvent: (releaseId: string, input: { label: string; dateISO: string }) => void;
  updateSprint: (releaseId: string, n: number, patch: Partial<Sprint>) => void;
  createItem: (
    releaseId: string,
    input: { workStreamId: string; sprintN: number | string; subject: string; description?: string; status?: Status; points?: number },
  ) => WorkItem | null;
  updateItem: (id: string, patch: Partial<WorkItem>) => void;
  sync: () => string;
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
        members: (members || []).filter((m) => m.trim()).map((m) => ({ id: uid('m'), name: m.trim() })),
      };
      commit((d) => { d.teams = [...d.teams, t]; });
      return t;
    },

    updateTeam: (id, patch) => {
      commit((d) => {
        d.teams = d.teams.map((t) => (t.id === id ? { ...t, ...patch } : t));
      });
    },

    createRelease: ({ name, startISO, teamId }) => {
      const start = startISO || todayISO();
      const r: Release = {
        id: uid('rel'),
        name: name || 'Untitled release',
        startISO: start,
        teamId,
        workStreams: [],
        events: [],
        sprints: buildSprints(start, {}),
      };
      commit((d) => { d.releases = [...d.releases, r]; });
      return r;
    },

    createWorkStream: (releaseId, name) => {
      if (!release(releaseId)) return null;
      const ws: WorkStream = { id: uid('ws'), name: name || 'Untitled stream' };
      commit((d) => {
        d.releases = d.releases.map((r) =>
          r.id === releaseId ? { ...r, workStreams: [...r.workStreams, ws] } : r,
        );
      });
      return ws;
    },

    createEvent: (releaseId, { label, dateISO }) => {
      if (!release(releaseId)) return;
      const ev = { id: uid('ev'), label: label || 'Event', dateISO: dateISO || todayISO() };
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
      };
      commit((d) => { d.items = [...d.items, it]; });
      return it;
    },

    updateItem: (id, patch) => {
      commit((d) => {
        d.items = d.items.map((i) => (i.id === id ? { ...i, ...patch } : i));
      });
    },

    sync: () => {
      const stamp = new Date().toISOString();
      commit((d) => { d.meta = { ...d.meta, lastSyncISO: stamp }; });
      // sync seam: a real backend adapter would push `snapshot` here.
      window.dispatchEvent(new CustomEvent('release-tracker:sync', { detail: { snapshot: snapshot(get()) } }));
      return stamp;
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
