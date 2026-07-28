// Categorical colour for work-item *types* — "which kind of work is this", not
// "how is it going". Types are open-ended (connector catalogs declare their own),
// so colour comes from the shared 8-hue ramp rather than the 5 fixed status hues.
// The old mapping recognized only Bug/Story/Investigation and collapsed every
// other type onto the neutral gray, so a release with Task, Epic and Spike
// rendered three identical grey chips.
//
// See catColor for the ramp mechanics; what's specific to types is the anchoring
// below.

import type { ChipVars } from './FilterChip';
import { NEUTRAL_VARS, hashLabel, slotVars } from './catColor';

/** Types whose colour already carries meaning, pinned so it never shifts. */
const ANCHORED: Record<string, number> = {
  Bug: 3, // red
  'User Story': 1, // blue
  Story: 1,
  Investigation: 2, // purple
};

/** Slots left for the open-ended tail, so hashing never lands on an anchored hue. */
const FREE_SLOTS = [4, 5, 6, 7, 8];

/** Ramp slot (1..8) for a type label: anchored when known, else a stable hash. */
function typeSlot(label: string): number {
  const anchored = ANCHORED[label];
  if (anchored !== undefined) return anchored;
  return FREE_SLOTS[hashLabel(label) % FREE_SLOTS.length];
}

/** Chip color tokens for a work-item type label. */
export function typeVars(label: string | undefined): ChipVars {
  if (!label) return NEUTRAL_VARS;
  return slotVars(typeSlot(label));
}
