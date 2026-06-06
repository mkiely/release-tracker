import { useSyncExternalStore } from 'react';

/** How the Release plan is indexed: rows are sprints, or rows are work streams. */
export type AxisMode = 'sprint' | 'stream';

const KEY = 'release-tracker:axisMode';
const listeners = new Set<() => void>();
let current: AxisMode = 'sprint';

try {
  const s = localStorage.getItem(KEY);
  if (s === 'sprint' || s === 'stream') current = s;
} catch { /* ignore */ }

export const AxisModeStore = {
  get: (): AxisMode => current,
  set: (v: AxisMode) => {
    current = v;
    try { localStorage.setItem(KEY, v); } catch { /* ignore */ }
    listeners.forEach((l) => l());
  },
  sub: (l: () => void) => {
    listeners.add(l);
    return () => { listeners.delete(l); };
  },
};

export function useAxisMode(): AxisMode {
  return useSyncExternalStore(AxisModeStore.sub, AxisModeStore.get, AxisModeStore.get);
}
