import { useSyncExternalStore } from 'react';

export type ViewMode = 'cards' | 'table';

const KEY = 'release-tracker:viewMode';
const listeners = new Set<() => void>();
let current: ViewMode = 'cards';

try {
  const s = localStorage.getItem(KEY);
  if (s === 'cards' || s === 'table') current = s;
} catch { /* ignore */ }

export const ViewModeStore = {
  get: (): ViewMode => current,
  set: (v: ViewMode) => {
    current = v;
    try { localStorage.setItem(KEY, v); } catch { /* ignore */ }
    listeners.forEach((l) => l());
  },
  sub: (l: () => void) => {
    listeners.add(l);
    return () => { listeners.delete(l); };
  },
};

export function useViewMode(): ViewMode {
  return useSyncExternalStore(ViewModeStore.sub, ViewModeStore.get, ViewModeStore.get);
}
