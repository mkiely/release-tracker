// The categorical colour ramp — the shared mechanics behind streamColor and
// typeColor.
//
// Both answer "which of the 8 --rt-cat-* hues is this?" for an open-ended set of
// user- or connector-defined labels, and both had their own copy of the hash and
// the same color-mix construction. Only the slot POLICY genuinely differs (type
// pins a few known labels, stream is a pure hash), so that stays with each.
//
// Tint and text are derived with color-mix() against the theme's --rt-bg/--rt-ink
// rather than authored per theme, so one ramp adapts across all six palettes.

import type { ChipVars } from './FilterChip';

/** FNV-ish string hash. Stable across sessions, which is the point: a stream must
 *  not change colour because the item list re-ordered. */
export function hashLabel(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

/** Neutral tokens for "no value" — an item with no type, or no work stream. */
export const NEUTRAL_VARS: ChipVars = {
  dot: 'var(--rt-st-ns-dot)',
  soft: 'var(--rt-st-ns-soft)',
  text: 'var(--rt-st-ns-text)',
};

/** Chip tokens for a ramp slot (1..8). */
export function slotVars(slot: number): ChipVars {
  const hue = `var(--rt-cat-${slot})`;
  return {
    dot: hue,
    soft: `color-mix(in oklab, ${hue} 12%, var(--rt-bg))`,
    text: `color-mix(in oklab, ${hue} 70%, var(--rt-ink))`,
  };
}
