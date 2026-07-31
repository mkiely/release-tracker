import type { RefObject } from 'react';
import type { ItemColumn } from '../../components/fields/columns';
import { HeaderCell } from './HeaderCell';
import type { ItemSort } from './itemSort';
import styles from './table.module.css';

/**
 * The item-table header row.
 *
 * Renders whatever columns it's given, in the order given — the same array
 * `ItemRow` renders cells from, which is what keeps headers and cells aligned.
 * Which columns exist (the optional Sprint and Work Stream ones, the connector's
 * vocabulary columns) is decided upstream by `itemColumns`, not here.
 *
 * `groupLabel` of `null` renders a headerless left column — the item list's flat
 * mode, where rows aren't grouped at all.
 */
export function ColHeaders({
  groupLabel,
  columns,
  hideAssigneeLabel,
  containerRef,
  sort,
  onSort,
  onMoveColumn,
}: {
  /** Left column heading; null for an ungrouped (flat) table. */
  groupLabel: string | null;
  columns: readonly ItemColumn[];
  /** The sprint table shows avatars with no column heading above them. */
  hideAssigneeLabel?: boolean;
  containerRef: RefObject<HTMLElement | null>;
  sort: ItemSort | null;
  onSort: (col: string) => void;
  /** Reorder by dragging a header onto another. */
  onMoveColumn?: (fromKey: string, toKey: string) => void;
}) {
  const itemCols = columns.map((c) =>
    hideAssigneeLabel && c.key === 'assignee' ? (
      // Blank header over the avatars, but the column still holds its width.
      <div key={c.key} className={`${styles.colHeaderLabel}`} style={{ width: `calc(${c.width.base}px * var(--rt-type-scale))`, flexShrink: 0 }} />
    ) : (
      <HeaderCell key={c.key} column={c} sort={sort} onSort={onSort} onMoveColumn={onMoveColumn} containerRef={containerRef} />
    ),
  );

  if (groupLabel === null) {
    return (
      <div className={styles.colHeaders}>
        <div className={styles.colHeaderRight} style={{ flex: 1 }}>{itemCols}</div>
      </div>
    );
  }

  return (
    <div className={styles.colHeaders}>
      <div className={styles.colHeaderLeft}>
        <span className={styles.colHeaderLabel}>{groupLabel}</span>
      </div>
      <div className={styles.colHeaderRight}>{itemCols}</div>
    </div>
  );
}
