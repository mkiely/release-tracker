// Cell presentation for the item tables — which typography, alignment and empty
// state a column's values render with. The display-direction twin of registry.tsx
// (data → input control): a column declares a data-shaped `kind` and this module
// owns what that looks like, so swapping a treatment touches only here.
//
// Header cells and body cells share the width plumbing (see `widthStyle`), which
// is why the header row and the rows below it can't drift out of alignment.

import type { CSSProperties } from 'react';
import styles from './cells.module.css';

/** How a column's values are typeset. Not a control name — a data treatment. */
export type CellKind = 'text' | 'mono' | 'number' | 'title';

/** How a column is sized. `flex` takes the remaining space; everything else
 *  resolves to a base px width, optionally adjustable through a CSS variable. */
export interface ColWidth {
  /** Width at type-scale 1, in px. The CSS fallback and the resize default. */
  base: number;
  /**
   * CSS custom property suffix (`--rt-col-<var>`) when the width isn't fixed.
   * Two independent writers use it: `ResizeHandle` (user drag, when `resizable`)
   * and `useFitColumns` (measured content, when `fit`). Rendering doesn't care
   * which wrote it — it just reads the variable, falling back to `base`.
   */
  var?: string;
  /** Floor for a resize drag, in base px. */
  min?: number;
  /** Resizable by dragging its header edge. */
  resizable?: boolean;
  /** Takes the remaining width instead of a declared one. */
  flex?: boolean;
}

/** Horizontal placement within the cell; defaults to the start. */
export type CellAlign = 'start' | 'center' | 'end';

/** The width custom property for a column, as an inline style.
 *  Inline because the value is data (from the column's own definition) — the
 *  static half of the sizing lives in cells.module.css. */
export function widthStyle(width: ColWidth): CSSProperties | undefined {
  if (width.flex) return undefined;
  const value = width.var ? `var(--rt-col-${width.var}, ${width.base}px)` : `${width.base}px`;
  return { ['--col-w' as string]: value } as CSSProperties;
}

/** The class list for one body cell. `empty` mutes a declared-but-unset value. */
export function cellClass(kind: CellKind | undefined, width: ColWidth, align?: CellAlign, empty?: boolean): string {
  return [
    styles.cell,
    width.flex && styles.flex,
    kind && styles[kind],
    align === 'center' && styles.alignCenter,
    align === 'end' && styles.alignEnd,
    empty && styles.empty,
  ]
    .filter(Boolean)
    .join(' ');
}

/** The class list for one header cell — the same geometry as its body cells,
 *  with the header's own uppercase label typography (owned by table.module.css,
 *  which the header row shares with its sticky container). */
export function headerCellClass(width: ColWidth, align?: CellAlign): string {
  return [
    styles.cell,
    width.flex && styles.flex,
    align === 'center' && styles.alignCenter,
    align === 'end' && styles.alignEnd,
  ]
    .filter(Boolean)
    .join(' ');
}
