// Colour theme. The whole palette re-resolves at paint time from a single
// `data-theme` attribute on <html>, so switching is one attribute write and no
// component needs to know a theme changed.

import { createPersistedStore, oneOf } from './persisted';

export type Theme = 'light' | 'dark' | 'coastal' | 'dusk-berry' | 'midnight-navy' | 'neon-reef';

/** The selectable palettes. `bg`/`dot` drive the two-tone swatch in the settings
 *  panel; `dark` marks the palettes whose surfaces are darker than their ink. */
export const THEMES: { id: Theme; label: string; bg: string; dot: string; dark: boolean }[] = [
  { id: 'light',          label: 'Default',       bg: '#f6f7f9', dot: '#5b82b8', dark: false },
  { id: 'dark',           label: 'Dark',          bg: '#131519', dot: '#6b93c9', dark: true  },
  { id: 'coastal',        label: 'Coastal',       bg: '#F4EFE2', dot: '#1E6FAD', dark: false },
  { id: 'dusk-berry',     label: 'Dusk Berry',    bg: '#FAF4F7', dot: '#DC1E5A', dark: false },
  { id: 'midnight-navy',  label: 'Midnight Navy', bg: '#091624', dot: '#2E8FD4', dark: true  },
  { id: 'neon-reef',      label: 'Neon Reef',     bg: '#071A16', dot: '#2ECC9A', dark: true  },
];

export const ThemeStore = createPersistedStore<Theme>({
  key: 'release-tracker:theme',
  initial: 'light',
  parse: oneOf(THEMES.map((t) => t.id)),
  apply: (t) => {
    if (typeof document !== 'undefined') document.documentElement.setAttribute('data-theme', t);
  },
});

export const useTheme = ThemeStore.use;
