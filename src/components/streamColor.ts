// Categorical colour for work streams, so a stream reads as one identity
// wherever it appears in an item table rather than as plain gray text.
//
// Streams are fully user-defined — there's no canonical set to anchor — so every
// stream hashes onto the shared 8-hue ramp. See catColor for the mechanics.

import type { ChipVars } from './FilterChip';
import { NEUTRAL_VARS, hashLabel, slotVars } from './catColor';

const SLOTS = [1, 2, 3, 4, 5, 6, 7, 8];

/** Ramp slot (1..8) for a work-stream id: a stable hash, no anchors. */
function streamSlot(workStreamId: string): number {
  return SLOTS[hashLabel(workStreamId) % SLOTS.length];
}

/** Chip color tokens for a work stream's id (or the neutral flavor when absent). */
export function streamVars(workStreamId: string | null | undefined): ChipVars {
  if (!workStreamId) return NEUTRAL_VARS;
  return slotVars(streamSlot(workStreamId));
}
