import { createPersistedStore, oneOf } from './persisted';

/** How the description presenter lays text out. `1` is one readable column that
 *  scrolls down; `2` and `auto` fill the screen's height and continue in the next
 *  column, `auto` fitting as many columns as the width allows at the current size. */
export type PresentColumns = '1' | '2' | 'auto';

export const PRESENT_COLUMNS = ['1', '2', 'auto'] as const;

export const PresentColumnsStore = createPersistedStore<PresentColumns>({
  key: 'release-tracker:presenterColumns',
  initial: 'auto',
  parse: oneOf(PRESENT_COLUMNS),
});

/** The presenter's text size, as a multiple of the body-input size (--rt-fs-md).
 *  The floor is the size the description already reads at in the modal: "fit"
 *  never shrinks text below what the dialog shows, so a long description scrolls
 *  rather than turning into something nobody on the call can read. */
export const PRESENT_SCALE_MIN = 1;
export const PRESENT_SCALE_MAX = 3;

const clampScale = (n: number) => Math.min(PRESENT_SCALE_MAX, Math.max(PRESENT_SCALE_MIN, n));

export const PresentScaleStore = createPersistedStore<number>({
  key: 'release-tracker:presenterScale',
  initial: 1.5,
  parse: (raw) => {
    const n = Number(raw);
    return Number.isFinite(n) ? clampScale(n) : undefined;
  },
});

/** Step the size by a fixed ratio, so each press reads as the same change at any size. */
export function stepPresentScale(current: number, dir: 1 | -1): number {
  return Math.round(clampScale(current * (dir > 0 ? 1.15 : 1 / 1.15)) * 100) / 100;
}
