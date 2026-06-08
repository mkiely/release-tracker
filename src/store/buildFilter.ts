import { useSyncExternalStore } from 'react';

/**
 * Persistent toggle for the Release plan's "on-build only" lens. When on, work
 * streams that carry no work native to this release — i.e. every item in them was
 * pulled in from a prior build — are hidden, so the plan shows only the work
 * actually planned for this release. Persisted across reloads, app-wide (not
 * per-release) like the view/axis toggles.
 */
const KEY = 'release-tracker:buildFilter';
const listeners = new Set<() => void>();
let current = false;

try {
  current = localStorage.getItem(KEY) === '1';
} catch { /* ignore */ }

export const BuildFilterStore = {
  get: (): boolean => current,
  set: (v: boolean) => {
    current = v;
    try { localStorage.setItem(KEY, v ? '1' : '0'); } catch { /* ignore */ }
    listeners.forEach((l) => l());
  },
  toggle: () => BuildFilterStore.set(!current),
  sub: (l: () => void) => {
    listeners.add(l);
    return () => { listeners.delete(l); };
  },
};

export function useBuildFilter(): boolean {
  return useSyncExternalStore(BuildFilterStore.sub, BuildFilterStore.get, BuildFilterStore.get);
}
