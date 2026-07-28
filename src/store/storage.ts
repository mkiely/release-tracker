// localStorage persistence for the domain state — the seam a real backend would
// slot behind. Reads migrate forward on the way in; writes are whole-state and
// fire on every action (the state is small enough that this is cheaper than
// tracking dirty slices).

import type { AppState } from '../types';
import { SCHEMA_VERSION } from '../types';
import { seed } from '../lib/seed';
import { migrate, stampStartedSprints, type PersistedState } from './migrate';

export const LS_KEY = 'release-tracker:v1';

/** Read persisted state from localStorage, migrating it forward if needed.
 *  Falls back to fresh seed data on a missing/corrupt/too-old store. */
export function load(): AppState {
  try {
    // The persisted "on-build only" lens was replaced by ephemeral stream facets.
    localStorage.removeItem('release-tracker:buildFilter');
  } catch {
    /* ignore */
  }
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      // Parsed JSON of unknown vintage — only `version` can be trusted until
      // migrate has walked it forward.
      const p = JSON.parse(raw) as PersistedState;
      const current = p?.version === SCHEMA_VERSION ? (p as unknown as AppState) : p && migrate(p);
      // Freeze any sprint that has started since the last load (lazy stamp-on-start).
      if (current) return stampStartedSprints(current);
    }
  } catch {
    /* ignore */
  }
  // Seed builds sprints with null baselines; stamp the ones already underway.
  return stampStartedSprints(seed());
}

/** Write the data slice to localStorage. Silently no-ops if storage is unavailable. */
export function persist(state: AppState) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}
