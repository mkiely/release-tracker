import { useLayoutEffect } from 'react';
import type { RefObject } from 'react';

const LS_KEY = 'release-tracker:col-widths';

export const COL_DEFAULTS: Record<string, number> = {
  type: 100,
  pts: 40,
  build: 120,
  attr: 104,
  workstream: 130,
  sprint: 130,
};

export const COL_MINS: Record<string, number> = {
  type: 50,
  pts: 30,
  build: 50,
  attr: 50,
  workstream: 60,
  sprint: 60,
};

function loadSaved(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '{}'); } catch { return {}; }
}

export function saveColWidth(col: string, px: number): void {
  try {
    const saved = loadSaved();
    if (px === COL_DEFAULTS[col]) { delete saved[col]; } else { saved[col] = px; }
    localStorage.setItem(LS_KEY, JSON.stringify(saved));
  } catch {}
}

export function getColWidthFromDOM(col: string, el: HTMLElement | null): number {
  if (el) {
    const raw = el.style.getPropertyValue(`--rt-col-${col}`);
    if (raw) return parseInt(raw, 10);
  }
  const saved = loadSaved();
  return saved[col] ?? COL_DEFAULTS[col] ?? 100;
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
