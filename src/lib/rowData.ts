import type { StatusSeg } from '../types';

/**
 * The metric payload every lane cell carries, independent of what the row is
 * indexed by. This is the unit a future schema-driven presentation layer would
 * project arbitrary entities onto — counts, points, status breakdown, per-type
 * tallies. Extend it per axis to attach cell-specific identity/extras.
 */
export interface RowMetrics {
  /** Item count in this cell. */
  n: number;
  points: number;
  /** Count of items in the 'Complete' status. */
  done: number;
  segs: StatusSeg[];
  /** Per work-item-type tallies, in first-seen order. */
  types: { label: string; n: number }[];
}

/**
 * The shared shape of a release row: an identity/aggregate `THeader` intersected
 * with a `lane` of metric-bearing cells. Both the sprint-indexed and
 * stream-indexed rows are instances of this, which is what lets the board/table
 * presenters — and the two axes — render against one contract. The intersection
 * keeps header fields flat, so presenters access `row.<field>` and `row.lane`
 * directly.
 */
export type RowData<THeader, TCell extends RowMetrics> = THeader & { lane: TCell[] };
