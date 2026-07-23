import { useSyncExternalStore } from 'react';

/** How the Sprint view groups its work items into columns. */
export type SprintGroupBy = 'stream' | 'status';

const KEY = 'release-tracker:sprintGroupBy';
const listeners = new Set<() => void>();
let current: SprintGroupBy = 'stream';

try {
  const s = localStorage.getItem(KEY);
  if (s === 'stream' || s === 'status') current = s;
} catch { /* ignore */ }

export const SprintGroupByStore = {
  get: (): SprintGroupBy => current,
  set: (v: SprintGroupBy) => {
    current = v;
    try { localStorage.setItem(KEY, v); } catch { /* ignore */ }
    listeners.forEach((l) => l());
  },
  sub: (l: () => void) => {
    listeners.add(l);
    return () => { listeners.delete(l); };
  },
};

export function useSprintGroupBy(): SprintGroupBy {
  return useSyncExternalStore(SprintGroupByStore.sub, SprintGroupByStore.get, SprintGroupByStore.get);
}
