import { useLayoutEffect } from 'react';
import type { RefObject } from 'react';
import { resizableWidths } from '../components/fields/columns';
import { createKeyedPrefs } from '../store/persisted';

// Keyed by column id rather than by entity: widths are global, one per column.
const widthPrefs = createKeyedPrefs<number>('release-tracker:col-widths');

// Defaults and floors come from the column definitions themselves — they used to
// be a second hand-maintained copy of every width, which the CSS fallbacks
// (var(--rt-col-build, 120px)) then repeated a third time.
const { defaults: COL_DEFAULTS, mins: COL_MINS } = resizableWidths();

export { COL_DEFAULTS, COL_MINS };

export function saveColWidth(col: string, px: number): void {
  // A width back at its default isn't worth storing — and storing it would
  // freeze the column if that default ever changes.
  widthPrefs.set(col, px === COL_DEFAULTS[col] ? undefined : px);
}

export function getColWidthFromDOM(col: string, el: HTMLElement | null, fallback?: number): number {
  if (el) {
    const raw = el.style.getPropertyValue(`--rt-col-${col}`);
    if (raw) return parseInt(raw, 10);
  }
  return widthPrefs.get(col) ?? fallback ?? COL_DEFAULTS[col] ?? 100;
}

/** Applies saved column widths as CSS custom properties on the container element. */
export function useColumnWidths(containerRef: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const widths = { ...COL_DEFAULTS, ...widthPrefs.all() };
    for (const [col, px] of Object.entries(widths)) {
      el.style.setProperty(`--rt-col-${col}`, `${px}px`);
    }
  // One-time application on mount; setProperty is called directly during drag.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
