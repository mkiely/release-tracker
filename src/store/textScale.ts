// Baseline text size — a persistent preference surfaced in the SettingsPanel
// next to palette and view style. It drives the typography system's single
// --rt-type-scale lever (see tokens.css), so every --rt-fs-* size scales
// proportionally from one number.
//
// This module is the sole owner of --rt-type-scale. Presentation mode is a
// temporary bump layered on top: the effective scale is the chosen baseline
// multiplied by PRESENTATION_SCALE while presentation mode is on, so the two
// compose rather than clobber each other. To keep the dependency one-way, this
// module subscribes to PresentationStore; presentationMode.ts never imports this.

import { PRESENTATION_SCALE, PresentationStore } from './presentationMode';
import { createPersistedStore, oneOf } from './persisted';

/** The selectable baseline sizes. `scale` multiplies the whole --rt-fs-* ramp. */
export const TEXT_SCALES = [
  { id: 'sm', label: 'Small', scale: 0.9 },
  { id: 'md', label: 'Default', scale: 1 },
  { id: 'lg', label: 'Large', scale: 1.15 },
  { id: 'xl', label: 'Larger', scale: 1.3 },
] as const;

export type TextScale = (typeof TEXT_SCALES)[number]['id'];

const scaleOf = (id: TextScale): number => TEXT_SCALES.find((s) => s.id === id)!.scale;

/** Push the effective scale (baseline × any presentation bump) onto <html>. */
const applyScale = (id: TextScale) => {
  if (typeof document === 'undefined') return;
  const effective = scaleOf(id) * (PresentationStore.get() ? PRESENTATION_SCALE : 1);
  document.documentElement.style.setProperty('--rt-type-scale', String(effective));
};

export const TextScaleStore = createPersistedStore<TextScale>({
  key: 'release-tracker:textScale',
  initial: 'md',
  parse: oneOf(TEXT_SCALES.map((s) => s.id)),
  apply: applyScale,
});

// Presentation mode toggles the bump; re-apply the current baseline through it.
PresentationStore.sub(() => applyScale(TextScaleStore.get()));

export const useTextScale = TextScaleStore.use;

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
