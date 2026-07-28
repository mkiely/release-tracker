// The application store: domain state (teams, releases, work items) plus the
// actions that mutate it. State is treated immutably so React re-renders
// correctly, and every action persists through to localStorage.
//
// This module is only the wiring. The parts live next to it and are re-exported
// here, so `store/store` remains the single import site for the rest of the app:
//
//   migrate.ts    schema migrations v1..v26 + the stamp-on-start trigger
//   storage.ts    localStorage load/persist — the backend seam
//   actions.ts    every mutation, against an ActionContext
//   selectors.ts  pure lookups over a state snapshot

import { create } from 'zustand';
import type { AppState, Member } from '../types';
import { createActions, type Actions } from './actions';
import { load, persist } from './storage';

export { migrate, stampStartedSprints } from './migrate';
export { LS_KEY, load, persist } from './storage';
export type { ActionContext, Actions, ConnectorItemDraft, PushOutcome, SyncOutcome } from './actions';
export {
  selBacklogItems,
  selDirtyCount,
  selItem,
  selItemsFor,
  selItemsForStream,
  selRelease,
  selTeam,
  selUnassignedItems,
} from './selectors';

/** The Zustand store value: the persisted {@link AppState} plus the {@link Actions}
 *  that mutate it. Components select slices via {@link useStore}. */
type StoreState = AppState & { actions: Actions };

/** Shallow-clone the data slice for an immutable update — drops `actions`, which
 *  is behavior, not state, and must never be persisted. */
function snapshot(s: StoreState): AppState {
  return { version: s.version, teams: s.teams, releases: s.releases, items: s.items, meta: s.meta };
}

/** The application store. Initialized from {@link load} (and written back on first
 *  run), then every action persists through its ActionContext. This is the seam a
 *  real backend would slot behind in place of localStorage + the sync client. */
export const useStore = create<StoreState>((set, get) => {
  const initial = load();
  persist(initial); // ensure the first-run seed is written

  const actions = createActions({
    snapshot: () => snapshot(get()),
    replace: (next) => {
      persist(next);
      set({ ...next });
    },
  });

  return { ...initial, actions };
});

// Non-reactive accessors — for reading state / firing actions outside React
// render (event handlers, drag-and-drop, async flows) without subscribing.
export const getState = () => useStore.getState();
export const getActions = () => useStore.getState().actions;

export type { Member };
