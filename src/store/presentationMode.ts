// Presentation-mode store — a persistent global toggle that enlarges all UI text
// for readability when the app is shared in a meeting tab (e.g. Google Meet),
// without the presenter having to zoom the browser. It's a temporary bump layered
// on top of the baseline text-size preference: the actual --rt-type-scale value is
// owned and applied by textScale.ts, which multiplies the baseline by
// PRESENTATION_SCALE while this toggle is on. Here we only track the flag, mark
// <html> with data-presentation, and notify — textScale subscribes to re-apply.
// Mirrors the ViewMode/Theme external-store pattern.

import { useSyncExternalStore } from 'react';

/** Multiplier applied to the baseline text scale while presentation mode is on. */
export const PRESENTATION_SCALE = 1.2;

const KEY = 'release-tracker:presentation';
const listeners = new Set<() => void>();
let current = false;

try {
  current = localStorage.getItem(KEY) === 'on';
} catch {
  /* ignore */
}

const apply = (on: boolean) => {
  if (typeof document === 'undefined') return;
  // The --rt-type-scale value itself is set by textScale.ts (which composes this
  // bump with the baseline preference); here we only reflect the flag onto <html>.
  document.documentElement.setAttribute('data-presentation', on ? 'on' : 'off');
};
apply(current);

export const PresentationStore = {
  get: (): boolean => current,
  set: (on: boolean) => {
    current = on;
    apply(on);
    try {
      localStorage.setItem(KEY, on ? 'on' : 'off');
    } catch {
      /* ignore */
    }
    listeners.forEach((l) => l());
  },
  toggle: () => PresentationStore.set(!current),
  sub: (l: () => void) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};

export function usePresentationMode(): boolean {
  return useSyncExternalStore(PresentationStore.sub, PresentationStore.get, PresentationStore.get);
}
