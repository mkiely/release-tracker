// Theme store — external store so the persistent theme can be read/set from
// anywhere. Sets data-theme on <html>. Supports 6 named palettes.
// Ported from proto-app.jsx ThemeStore + useTheme; expanded from 2-state
// toggle to a 6-option named-theme picker.

import { useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark' | 'coastal' | 'dusk-berry' | 'midnight-navy' | 'neon-reef';

export const THEMES: { id: Theme; label: string; bg: string; dot: string; dark: boolean }[] = [
  { id: 'light',          label: 'Default',       bg: '#f6f7f9', dot: '#5b82b8', dark: false },
  { id: 'dark',           label: 'Dark',          bg: '#131519', dot: '#6b93c9', dark: true  },
  { id: 'coastal',        label: 'Coastal',       bg: '#F4EFE2', dot: '#1E6FAD', dark: false },
  { id: 'dusk-berry',     label: 'Dusk Berry',    bg: '#FAF4F7', dot: '#DC1E5A', dark: false },
  { id: 'midnight-navy',  label: 'Midnight Navy', bg: '#091624', dot: '#2E8FD4', dark: true  },
  { id: 'neon-reef',      label: 'Neon Reef',     bg: '#071A16', dot: '#2ECC9A', dark: true  },
];

const VALID = new Set<string>(THEMES.map((t) => t.id));
const KEY = 'release-tracker:theme';
const listeners = new Set<() => void>();
let current: Theme = 'light';

try {
  const s = localStorage.getItem(KEY);
  if (s && VALID.has(s)) current = s as Theme;
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
