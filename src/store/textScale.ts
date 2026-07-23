// Text-size store — a persistent baseline font-size preference, surfaced in the
// SettingsPanel next to palette + view style. It drives the typography system's
// single --rt-type-scale lever (see tokens.css), so every --rt-fs-* size scales
// proportionally. Mirrors the ViewMode/Theme external-store pattern.
//
// This store is the single owner of --rt-type-scale. Presentation mode is a
// temporary bump layered on top: the effective scale is the chosen baseline
// multiplied by PRESENTATION_SCALE while presentation mode is on, so the two
// compose instead of clobbering each other. To keep the dependency one-way,
// this module subscribes to PresentationStore (presentationMode.ts never imports
// this file).

import { useSyncExternalStore } from 'react';
import { PRESENTATION_SCALE, PresentationStore } from './presentationMode';

/** The selectable baseline sizes. `scale` multiplies the whole --rt-fs-* ramp. */
export const TEXT_SCALES = [
  { id: 'sm', label: 'Small', scale: 0.9 },
  { id: 'md', label: 'Default', scale: 1 },
  { id: 'lg', label: 'Large', scale: 1.15 },
  { id: 'xl', label: 'Larger', scale: 1.3 },
] as const;

export type TextScale = (typeof TEXT_SCALES)[number]['id'];

const scaleOf = (id: TextScale): number => TEXT_SCALES.find((s) => s.id === id)!.scale;
const VALID = new Set<string>(TEXT_SCALES.map((s) => s.id));
const KEY = 'release-tracker:textScale';
const listeners = new Set<() => void>();
let current: TextScale = 'md';

try {
  const s = localStorage.getItem(KEY);
  if (s && VALID.has(s)) current = s as TextScale;
} catch {
  /* ignore */
}

/** Push the effective scale (baseline × presentation bump) onto <html>. */
const apply = () => {
  if (typeof document === 'undefined') return;
  const effective = scaleOf(current) * (PresentationStore.get() ? PRESENTATION_SCALE : 1);
  document.documentElement.style.setProperty('--rt-type-scale', String(effective));
};
apply();
// Presentation mode toggles the bump; re-apply whenever it changes.
PresentationStore.sub(apply);

export const TextScaleStore = {
  get: (): TextScale => current,
  set: (v: TextScale) => {
    current = v;
    apply();
    try {
      localStorage.setItem(KEY, v);
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

export function useTextScale(): TextScale {
  return useSyncExternalStore(TextScaleStore.sub, TextScaleStore.get, TextScaleStore.get);
}

/**
 * The effective --rt-type-scale currently applied to <html> (baseline × any
 * presentation bump) as a number. Read from the DOM rather than the stores so it
 * reflects the composed value. Callers that measure or manipulate pixel geometry
 * (fit-to-content column sizing, column-resize drag math) use this to convert
 * between on-screen pixels and the scale-1 "base" pixels that widths are stored in.
 */
export function currentTypeScale(): number {
  if (typeof document === 'undefined') return 1;
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--rt-type-scale'));
  return v > 0 ? v : 1;
}
