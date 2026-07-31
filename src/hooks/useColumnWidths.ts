import { useLayoutEffect } from 'react';
import type { RefObject } from 'react';
import { resizableWidths } from '../components/fields/columns';

const LS_KEY = 'release-tracker:col-widths';

// Defaults and floors come from the column definitions themselves — they used to
// be a second hand-maintained copy of every width, which the CSS fallbacks
// (var(--rt-col-build, 120px)) then repeated a third time.
const { defaults: COL_DEFAULTS, mins: COL_MINS } = resizableWidths();

export { COL_DEFAULTS, COL_MINS };

function loadSaved(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '{}'); } catch { return {}; }
}

export function saveColWidth(col: string, px: number): void {
  try {
    const saved = loadSaved();
    // A width back at its default isn't worth storing — and storing it would
    // freeze the column if that default ever changes.
    if (px === COL_DEFAULTS[col]) { delete saved[col]; } else { saved[col] = px; }
    localStorage.setItem(LS_KEY, JSON.stringify(saved));
  } catch {
    /* storage unavailable — column widths just don't persist */
  }
}

export function getColWidthFromDOM(col: string, el: HTMLElement | null, fallback?: number): number {
  if (el) {
    const raw = el.style.getPropertyValue(`--rt-col-${col}`);
    if (raw) return parseInt(raw, 10);
  }
  const saved = loadSaved();
  return saved[col] ?? fallback ?? COL_DEFAULTS[col] ?? 100;
}

/** Applies saved column widths as CSS custom properties on the container element. */
export function useColumnWidths(containerRef: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const saved = loadSaved();
    const widths = { ...COL_DEFAULTS, ...saved };
    for (const [col, px] of Object.entries(widths)) {
      el.style.setProperty(`--rt-col-${col}`, `${px}px`);
    }
  // One-time application on mount; setProperty is called directly during drag.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
