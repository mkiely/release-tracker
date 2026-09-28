// The geometry behind every planned-vs-capacity meter — the shared mechanics
// under CapBarInline and the capacity meter inside the sprint rail.
//
// Both draw the same reading in different frames (a label beside the track vs
// numbers stacked above it), and both had their own copy of this arithmetic. The
// copies had already drifted: the overflow segment was clamped at 0.5 in one and
// 0.6 in the other, so an identical overrun rendered at two widths depending on
// which screen you were looking at. Only the LAYOUT genuinely differs, so that
// stays with each component and the numbers live here.
//
// Same split as catColor.ts, for the same reason.

/** How far past the end of the track an overrun is allowed to extend, as a
 *  fraction of the track. Capped so a wildly over-planned sprint stays readable
 *  rather than squashing the track it is measured against. */
const MAX_OVERFLOW = 0.5;

export interface CapacityBar {
  /** Planned exceeds capacity — the whole meter switches to its over treatment. */
  over: boolean;
  /** Flex weight of the filled portion, 0..1. */
  ratio: number;
  /** Flex weight of the overflow segment past the track, 0..MAX_OVERFLOW. */
  overW: number;
}

/**
 * A zero capacity is not "no room" but "nobody has measured the velocity" (see
 * the zero-is-not-a-reading rule), so it can't be a denominator: planned work
 * against an unmeasured capacity fills the track rather than reporting an
 * infinite overrun.
 */
export function capacityBar(planned: number, cap: number): CapacityBar {
  const over = planned > cap;
  return {
    over,
    ratio: cap > 0 ? Math.min(planned / cap, 1) : planned > 0 ? 1 : 0,
    overW: over && cap > 0 ? Math.min((planned - cap) / cap, MAX_OVERFLOW) : 0,
  };
}
