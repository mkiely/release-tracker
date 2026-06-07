// Presentation-mode store — a persistent global toggle that enlarges all UI text
// for readability when the app is shared in a meeting tab (e.g. Google Meet),
// without the presenter having to zoom the browser. It drives the typography
// system's single --rt-type-scale lever (see tokens.css), so every --rt-fs-* size
// scales proportionally. Mirrors the ViewMode/Theme external-store pattern.

import { useSyncExternalStore } from 'react';

/** Type scale applied while presentation mode is on (1 = normal). */
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
  const root = document.documentElement;
  if (on) root.style.setProperty('--rt-type-scale', String(PRESENTATION_SCALE));
  else root.style.removeProperty('--rt-type-scale');
  root.setAttribute('data-presentation', on ? 'on' : 'off');
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
