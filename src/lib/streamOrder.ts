// The order work streams appear in, everywhere they appear.
//
// Two sites had independently written `a.name.localeCompare(b.name, undefined,
// { sensitivity: 'base' })` — the release view model and the snapshot builder —
// which is exactly the kind of duplicate that drifts the moment the rule gains a
// second clause. It just did: muted streams sink.

import type { WorkStream } from '../types';

/** Case-insensitive name order, so a release with many streams stays scannable. */
const byName = (a: WorkStream, b: WorkStream): number =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

/**
 * Sort order for work streams: muted last, then alphabetical within each group.
 *
 * Muted streams sink rather than hide. They are still real, still browsable, and a
 * user who muted one by mistake has to be able to find it — but they are not what
 * the screen is about, so they stop occupying the eye's first stop. This pairs with
 * the greyscale treatment: position and colour say the same thing, so neither has
 * to carry the message alone.
 *
 * The Unassigned bucket is not a WorkStream and isn't sorted here — every consumer
 * appends it after these, so it stays below even the muted ones.
 */
export function compareStreams(a: WorkStream, b: WorkStream): number {
  if (a.muted !== b.muted) return a.muted ? 1 : -1;
  return byName(a, b);
}

/** `compareStreams` as a copying sort, since the common case is ordering store
 *  state that must not be mutated in place. */
export function sortStreams<T extends WorkStream>(streams: readonly T[]): T[] {
  return [...streams].sort(compareStreams);
}
