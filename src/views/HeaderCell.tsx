import type { RefObject } from 'react';
import { Icon } from '../components/Icon';
import { ResizeHandle } from './ResizeHandle';
import type { ItemSort } from './itemSort';
import styles from './SprintTable.module.css';

/** One clickable, sortable column header — shared by every item table (backlog/
 *  unassigned, sprint, work stream). `resizeCol` (when set) mounts the resize
 *  handle — its own mousedown stops propagation, so dragging never sorts. */
export function HeaderCell({
  colClass,
  label,
  sortCol,
  resizeCol,
  sort,
  onSort,
  containerRef,
}: {
  colClass: string;
  label: string;
  sortCol: string;
  resizeCol?: string;
  sort: ItemSort | null;
  onSort: (col: string) => void;
  containerRef: RefObject<HTMLElement | null>;
}) {
  const active = sort?.col === sortCol;
  return (
    <div
      className={
        `${colClass} ${styles.colHeaderLabel} ${styles.sortable}` +
        (active ? ` ${styles.sortActive}` : '') +
        (resizeCol ? ` ${styles.resizeTarget}` : '')
      }
      role="button"
      tabIndex={0}
      aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      title={`Sort by ${label}`}
      onClick={() => onSort(sortCol)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSort(sortCol); }
      }}
    >
      {label}
      {active && (
        <span
          className={styles.sortArrow}
          style={sort!.dir === 'asc' ? { transform: 'rotate(180deg)' } : undefined}
          aria-hidden
        >
          {Icon.chevDown}
        </span>
      )}
      {resizeCol && <ResizeHandle col={resizeCol} containerRef={containerRef} />}
    </div>
  );
}
