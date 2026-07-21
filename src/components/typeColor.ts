// Categorical color for work-item *types* — "which kind of work is this", not
// "how is it going". Types are open-ended (connector catalogs declare their own),
// so color comes from the 8-hue --rt-cat-* ramp rather than the 5 fixed status
// hues. The old mapping recognized only Bug/Story/Investigation and collapsed
// every other type onto the neutral "Not Started" gray, so a release with Task,
// Epic and Spike rendered three identical grey chips.
//
// Tint and text are derived with color-mix() against the theme's --rt-bg/--rt-ink,
// so the single authored ramp adapts across all six themes (see tokens.css).

import type { ChipVars } from './FilterChip';

/** Types whose color already carries meaning, pinned so it never shifts. */
const ANCHORED: Record<string, number> = {
  Bug: 3, // red
  'User Story': 1, // blue
  Story: 1,
  Investigation: 2, // purple
};

/** Slots left for the open-ended tail, so hashing never lands on an anchored hue. */
const FREE_SLOTS = [4, 5, 6, 7, 8];

function hash(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

/** Ramp slot (1..8) for a type label: anchored when known, else a stable hash. */
export function typeSlot(label: string): number {
  const anchored = ANCHORED[label];
  if (anchored !== undefined) return anchored;
  return FREE_SLOTS[hash(label) % FREE_SLOTS.length];
}

/** Neutral tokens for items carrying no type at all. */
const UNTYPED: ChipVars = {
  dot: 'var(--rt-st-ns-dot)',
  soft: 'var(--rt-st-ns-soft)',
  text: 'var(--rt-st-ns-text)',
};

/** Chip color tokens for a work-item type label. */
export function typeVars(label: string | undefined): ChipVars {
  if (!label) return UNTYPED;
  const hue = `var(--rt-cat-${typeSlot(label)})`;
  return {
    dot: hue,
    soft: `color-mix(in oklab, ${hue} 12%, var(--rt-bg))`,
    text: `color-mix(in oklab, ${hue} 70%, var(--rt-ink))`,
  };
}
