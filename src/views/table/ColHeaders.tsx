import type { RefObject } from 'react';
import type { AttrColumn } from '../../components/fields/columns';
import { HeaderCell } from './HeaderCell';
import type { ItemSort } from './itemSort';
import styles from './table.module.css';

/**
 * The item-table header row.
 *
 * All three table presenters carried their own copy of this, sharing eight
 * identical HeaderCell lines; the only real differences are the left-hand group
 * label and which of the two optional columns (Sprint, Work Stream) apply. Those
 * are props now.
 *
 * `groupLabel` of `null` renders a headerless left column — the item list's flat
 * mode, where rows aren't grouped at all.
 */
export function ColHeaders({
  groupLabel,
  showSprint,
  showWorkStream,
  hideAssigneeLabel,
  attrColumns,
  containerRef,
  sort,
  onSort,
}: {
  /** Left column heading; null for an ungrouped (flat) table. */
  groupLabel: string | null;
  showSprint?: boolean;
  showWorkStream?: boolean;
  /** The sprint table shows avatars with no column heading above them. */
  hideAssigneeLabel?: boolean;
  attrColumns: AttrColumn[];
  containerRef: RefObject<HTMLElement | null>;
  sort: ItemSort | null;
  onSort: (col: string) => void;
}) {
  const hp = { sort, onSort, containerRef };
  const itemCols = (
    <>
      <HeaderCell {...hp} colClass={styles.colKey} label="Key" sortCol="key" />
      <HeaderCell {...hp} colClass={styles.colType} label="Type" sortCol="type" resizeCol="type" />
      <HeaderCell {...hp} colClass={styles.colPts} label="Pts" sortCol="pts" resizeCol="pts" />
      {hideAssigneeLabel ? (
        <div className={`${styles.colAssignee} ${styles.colHeaderLabel}`} />
      ) : (
        <HeaderCell {...hp} colClass={styles.colAssignee} label="Assignee" sortCol="assignee" />
      )}
      <HeaderCell {...hp} colClass={styles.colStatus} label="Status" sortCol="status" />
      <HeaderCell {...hp} colClass={styles.colBuild} label="Build" sortCol="build" resizeCol="build" />
      {attrColumns.map((c) => (
        <HeaderCell {...hp} key={c.key} colClass={styles.colAttr} label={c.label} sortCol={`attr:${c.key}`} resizeCol="attr" />
      ))}
      {showSprint && (
        <HeaderCell {...hp} colClass={styles.colSprint} label="Sprint" sortCol="sprint" resizeCol="sprint" />
      )}
      {showWorkStream && (
        <HeaderCell {...hp} colClass={styles.colWorkStream} label="Work Stream" sortCol="workstream" resizeCol="workstream" />
      )}
      <HeaderCell {...hp} colClass={styles.colTitle} label="Title" sortCol="title" />
    </>
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
