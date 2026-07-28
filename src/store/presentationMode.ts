// Presentation mode — a persistent toggle that enlarges all UI text for
// readability when the app is shared in a meeting tab, without the presenter
// having to zoom the browser.
//
// It is a temporary bump layered on the baseline text-size preference, not a
// replacement for it: the actual --rt-type-scale value is owned and applied by
// textScale.ts, which multiplies the chosen baseline by PRESENTATION_SCALE while
// this is on. Here we only track the flag and mark <html> with data-presentation;
// textScale subscribes and re-applies. The dependency is one-way by design —
// textScale imports this module, never the reverse.

import { createPersistedStore } from './persisted';

/** Multiplier applied to the baseline text scale while presentation mode is on. */
export const PRESENTATION_SCALE = 1.2;

const store = createPersistedStore<boolean>({
  key: 'release-tracker:presentation',
  initial: false,
  parse: (raw) => (raw === 'on' ? true : raw === 'off' ? false : undefined),
  serialize: (on) => (on ? 'on' : 'off'),
  apply: (on) => {
    if (typeof document === 'undefined') return;
    // The --rt-type-scale value itself is set by textScale.ts (which composes this
    // bump with the baseline preference); here we only reflect the flag onto <html>.
    document.documentElement.setAttribute('data-presentation', on ? 'on' : 'off');
  },
});

export const PresentationStore = {
  ...store,
  toggle: () => store.set(!store.get()),
};

export const usePresentationMode = store.use;
