import { COL_DEFAULTS, COL_MINS, getColWidthFromDOM, saveColWidth } from '../hooks/useColumnWidths';
import type { RefObject } from 'react';
import styles from './SprintTable.module.css';

export function ResizeHandle({
  col,
  containerRef,
}: {
  col: string;
  containerRef: RefObject<HTMLElement | null>;
}) {
  return (
    <div
      className={styles.resizeHandle}
      title="Drag to resize · Double-click to reset"
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX;
        const el = containerRef.current;
        const startWidth = getColWidthFromDOM(col, el);
        const min = COL_MINS[col] ?? 30;
        const prevSelect = document.body.style.userSelect;
        document.body.style.userSelect = 'none';

        const onMove = (ev: MouseEvent) => {
          const next = Math.max(min, startWidth + ev.clientX - startX);
          el?.style.setProperty(`--rt-col-${col}`, `${next}px`);
        };
        const onUp = () => {
          document.body.style.userSelect = prevSelect;
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          const raw = el?.style.getPropertyValue(`--rt-col-${col}`);
          if (raw) saveColWidth(col, parseInt(raw, 10));
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        const def = COL_DEFAULTS[col] ?? 100;
        containerRef.current?.style.setProperty(`--rt-col-${col}`, `${def}px`);
        saveColWidth(col, def);
      }}
    />
  );
}
