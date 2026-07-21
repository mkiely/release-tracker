// Categorical color for work streams, so a stream reads as one identity
// wherever it appears in an item table rather than as plain gray text.
// Streams are fully user-defined (no canonical set to anchor), so every
// stream hashes onto the same 8-hue --rt-cat-* ramp used by typeColor.ts.

import type { ChipVars } from './FilterChip';

const SLOTS = [1, 2, 3, 4, 5, 6, 7, 8];

function hash(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

/** Ramp slot (1..8) for a work-stream id: a stable hash, no anchors. */
export function streamSlot(workStreamId: string): number {
  return SLOTS[hash(workStreamId) % SLOTS.length];
}

/** Neutral tokens for items carrying no work stream at all. */
const UNASSIGNED: ChipVars = {
  dot: 'var(--rt-st-ns-dot)',
  soft: 'var(--rt-st-ns-soft)',
  text: 'var(--rt-st-ns-text)',
};

/** Chip color tokens for a work stream's id (or the neutral flavor when absent). */
export function streamVars(workStreamId: string | null | undefined): ChipVars {
  if (!workStreamId) return UNASSIGNED;
  const hue = `var(--rt-cat-${streamSlot(workStreamId)})`;
  return {
    dot: hue,
    soft: `color-mix(in oklab, ${hue} 12%, var(--rt-bg))`,
    text: `color-mix(in oklab, ${hue} 70%, var(--rt-ink))`,
  };
}
