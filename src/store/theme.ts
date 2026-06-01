// Theme store — external store so the persistent light/dark theme can be
// read/toggled from anywhere. Sets data-theme on <html>. Ported from
// proto-app.jsx ThemeStore + useTheme.

import { useSyncExternalStore } from 'react';

type Theme = 'light' | 'dark';
const KEY = 'release-tracker:theme';
const listeners = new Set<() => void>();
let current: Theme = 'light';

try {
  const s = localStorage.getItem(KEY);
  if (s === 'dark' || s === 'light') current = s;
} catch {
  /* ignore */
}

const apply = (t: Theme) => {
  if (typeof document !== 'undefined') document.documentElement.setAttribute('data-theme', t);
};
apply(current);

export const ThemeStore = {
  get: (): Theme => current,
  set: (t: Theme) => {
    current = t;
    apply(t);
    try {
      localStorage.setItem(KEY, t);
    } catch {
      /* ignore */
    }
    listeners.forEach((l) => l());
  },
  toggle: () => ThemeStore.set(current === 'dark' ? 'light' : 'dark'),
  sub: (l: () => void) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};

export function useTheme(): Theme {
  return useSyncExternalStore(ThemeStore.sub, ThemeStore.get, ThemeStore.get);
}
