// localStorage persistence for the domain state — the seam a real backend would
// slot behind. Reads migrate forward on the way in; writes are whole-state and
// fire on every action (the state is small enough that this is cheaper than
// tracking dirty slices). Storage access goes through store/local.ts.

import type { AppState } from '../types';
import { SCHEMA_VERSION } from '../types';
import { seed } from '../lib/seed';
import { migrate, stampStartedSprints, type PersistedState } from './migrate';
import { DEVICE_PREFIX, SAVED_AT_KEY, localSavedAt, readLocal, removeLocal, writeLocal, type WriteOptions } from './local';
import { kb, logInfo, logWarn } from './log';

export const LS_KEY = 'release-tracker:v1';

/** Set when this browser's data started as the app's seed rather than the user's. */
const SEEDED_KEY = `${DEVICE_PREFIX}seeded`;

/** Read persisted state from localStorage, migrating it forward if needed.
 *  Falls back to fresh seed data on a missing/corrupt/too-old store. */
export function load(): AppState {
  // The persisted "on-build only" lens was replaced by ephemeral stream facets.
  removeLocal('release-tracker:buildFilter', { quiet: true });
  const raw = readLocal(LS_KEY);
  try {
    if (raw) {
      // Parsed JSON of unknown vintage — only `version` can be trusted until
      // migrate has walked it forward.
      const p = JSON.parse(raw) as PersistedState;
      const current = p?.version === SCHEMA_VERSION ? (p as unknown as AppState) : p && migrate(p);
      if (current) {
        const from = p.version === SCHEMA_VERSION ? '' : `, migrated from schema v${p.version}`;
        logInfo('storage', `loaded from this browser (${kb(raw.length)}, schema v${SCHEMA_VERSION}${from})`, {
          releases: current.releases.length,
          items: current.items.length,
          lastChanged: localSavedAt(),
        });
        adoptUnstampedData();
        // Freeze any sprint that has started since the last load (lazy stamp-on-start).
        return stampStartedSprints(current);
      }
      logWarn('storage', `saved data has schema v${p?.version}, which this build can't read — starting from demo data`);
    } else {
      logInfo('storage', 'nothing saved in this browser — starting from demo data');
    }
  } catch {
    logWarn('storage', 'saved data is corrupt — starting from demo data');
  }
  writeLocal(SEEDED_KEY, '1');
  // Seed builds sprints with null baselines; stamp the ones already underway.
  return stampStartedSprints(seed());
}

/**
 * Data saved before change stamps existed carries none, which would make it look
 * exactly like a freshly wiped browser — and the backup restores over those without
 * asking. Stamp it, so a backup that differs is a conflict the user settles rather
 * than a silent replacement. Seeded data is exempt: there's nothing of the user's
 * in it to protect, and it should give way to a real backup.
 */
function adoptUnstampedData() {
  if (localSavedAt() === null && readLocal(SEEDED_KEY) === null) {
    writeLocal(SAVED_AT_KEY, new Date().toISOString());
    logInfo('storage', 'marked existing data as changed here (it predates change tracking), so a backup can never silently replace it');
  }
}

/** Write the data slice to localStorage. Silently no-ops if storage is unavailable.
 *  Pass `{ quiet: true }` for a write that isn't a user change (see local.ts). */
export function persist(state: AppState, opts?: WriteOptions) {
  writeLocal(LS_KEY, JSON.stringify(state), opts);
}
