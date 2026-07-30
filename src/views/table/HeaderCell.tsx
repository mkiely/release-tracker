import type { RefObject } from 'react';
import { Icon } from '../../components/Icon';
import { headerCellClass, widthStyle } from '../../components/fields/cells';
import type { ItemColumn } from '../../components/fields/columns';
import { ResizeHandle } from './ResizeHandle';
import type { ItemSort } from './itemSort';
import styles from './table.module.css';

/** One clickable, sortable column header, rendered from the column's own
 *  definition — the same geometry its body cells get, so the two can't drift.
 *  A column declaring `width.resizable` mounts the resize handle; the handle's
 *  own mousedown stops propagation, so dragging never sorts. */
export function HeaderCell({
  column,
  sort,
  onSort,
  containerRef,
}: {
  column: ItemColumn;
  sort: ItemSort | null;
  onSort: (col: string) => void;
  containerRef: RefObject<HTMLElement | null>;
}) {
  const active = sort?.col === column.key;
  const sortable = column.sort !== undefined;
  const resizable = column.width.resizable === true && column.width.var !== undefined;

  return (
    <div
      className={
        `${headerCellClass(column.width, column.align)} ${styles.colHeaderLabel}` +
        (sortable ? ` ${styles.sortable}` : '') +
        (active ? ` ${styles.sortActive}` : '') +
        (resizable ? ` ${styles.resizeTarget}` : '')
      }
      style={widthStyle(column.width)}
      role={sortable ? 'button' : undefined}
      tabIndex={sortable ? 0 : undefined}
      aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : undefined}
      title={sortable ? `Sort by ${column.label}` : undefined}
      onClick={sortable ? () => onSort(column.key) : undefined}
      onKeyDown={
        sortable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSort(column.key); }
            }
          : undefined
      }
    >
      {column.label}
      {active && (
        <span
          className={styles.sortArrow}
          style={sort!.dir === 'asc' ? { transform: 'rotate(180deg)' } : undefined}
          aria-hidden
        >
          {Icon.chevDown}
        </span>
      )}
      {resizable && <ResizeHandle col={column.width.var!} containerRef={containerRef} />}
    </div>
  );
}
