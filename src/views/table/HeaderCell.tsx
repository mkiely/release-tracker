import { useState, type RefObject } from 'react';
import { Icon } from '../../components/Icon';
import { headerCellClass, widthStyle } from '../../components/fields/cells';
import type { ItemColumn } from '../../components/fields/columns';
import { ResizeHandle } from './ResizeHandle';
import type { ItemSort } from './itemSort';
import styles from './table.module.css';

/** One clickable, sortable, draggable column header, rendered from the column's
 *  own definition — the same geometry its body cells get, so the two can't drift.
 *
 *  Three gestures share this element and must not trip over each other: click to
 *  sort, drag the body to reorder, drag the trailing edge to resize. The resize
 *  handle opts out of the drag (`draggable={false}`) and swallows its own
 *  mousedown, so a resize neither starts a reorder nor lands as a sort. */
export function HeaderCell({
  column,
  sort,
  onSort,
  onMoveColumn,
  containerRef,
}: {
  column: ItemColumn;
  sort: ItemSort | null;
  onSort: (col: string) => void;
  /** Absent for a table that doesn't support reordering. */
  onMoveColumn?: (fromKey: string, toKey: string) => void;
  containerRef: RefObject<HTMLElement | null>;
}) {
  const [dropSide, setDropSide] = useState<'before' | 'after' | null>(null);
  const active = sort?.col === column.key;
  const sortable = column.sort !== undefined;
  const resizable = column.width.resizable === true && column.width.var !== undefined;
  const movable = onMoveColumn !== undefined;

  return (
    <div
      className={
        `${headerCellClass(column.width, column.align)} ${styles.colHeaderLabel}` +
        (sortable ? ` ${styles.sortable}` : '') +
        (active ? ` ${styles.sortActive}` : '') +
        (resizable ? ` ${styles.resizeTarget}` : '') +
        (dropSide ? ` ${styles.dropBefore}` : '')
      }
      style={widthStyle(column.width)}
      role={sortable ? 'button' : undefined}
      tabIndex={sortable ? 0 : undefined}
      aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : undefined}
      title={sortable ? `Sort by ${column.label}${movable ? ' · drag to reorder' : ''}` : column.label}
      draggable={movable}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('application/x-rt-column', column.key);
      }}
      onDragOver={(e) => {
        if (!movable || !e.dataTransfer.types.includes('application/x-rt-column')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDropSide('before');
      }}
      onDragLeave={() => setDropSide(null)}
      onDrop={(e) => {
        const from = e.dataTransfer.getData('application/x-rt-column');
        setDropSide(null);
        if (!from || from === column.key) return;
        e.preventDefault();
        onMoveColumn?.(from, column.key);
      }}
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
      {resizable && (
        <ResizeHandle
          col={column.width.var!}
          base={column.width.base}
          min={column.width.min}
          containerRef={containerRef}
        />
      )}
    </div>
  );
}
