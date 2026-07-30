import { cellClass, widthStyle } from '../../components/fields/cells';
import type { ItemCellCtx, ItemColumn } from '../../components/fields/columns';
import { Drag, setDragGhost, useDrag } from '../../components/Dnd';
import type { WorkItem } from '../../types';
import styles from './table.module.css';

/**
 * One draggable work-item row in a table view. The whole row is the drag handle
 * (not just the key cell) — a narrower handle made drags inconsistent to
 * initiate, since a mousedown landing anywhere else in the row's generous hit
 * area just fell through to the row's click-to-open instead. Native drag/click
 * disambiguation (movement threshold before dragstart fires) means the row's
 * onClick still works normally for a plain click.
 *
 * Cells come from the column definitions, in the order the header row used, so
 * adding or hiding a column is a change to one array rather than to two files
 * that have to be kept in step.
 */
export function ItemRow({
  item,
  columns,
  ctx,
  onOpen,
}: {
  item: WorkItem;
  columns: readonly ItemColumn[];
  ctx: ItemCellCtx;
  onOpen: () => void;
}) {
  const dragging = useDrag();
  const isMe = dragging?.id === item.id;

  return (
    <div
      className={styles.itemRow}
      draggable
      onClick={onOpen}
      style={isMe ? { opacity: 0.4, cursor: 'grab' } : { cursor: 'grab' }}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', item.id);
        setDragGhost(e, item.key);
        Drag.start(item);
      }}
      onDragEnd={() => Drag.end()}
    >
      {columns.map((c) => {
        if (c.cell) {
          return (
            <div key={c.key} className={cellClass(c.kind, c.width, c.align)} style={widthStyle(c.width)}>
              {c.cell(item, ctx)}
            </div>
          );
        }
        const text = c.value?.(item, ctx) ?? '';
        // '' means the column doesn't apply to this item (its type doesn't declare
        // the field); an em dash means declared but unset. Only the latter is muted.
        return (
          <div
            key={c.key}
            className={cellClass(c.kind, c.width, c.align, text === '' || text === '—')}
            style={widthStyle(c.width)}
            title={text || undefined}
          >
            {text}
          </div>
        );
      })}
    </div>
  );
}
