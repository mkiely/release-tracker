import type { ReactNode } from 'react';
import { sortItems, type ItemSort, type SortCtx } from './itemSort';
import styles from './table.module.css';

/** Marks the sprint currently in progress. Was spelled five different ways —
 *  two near-identical CSS-module classes and two hand-inlined style objects. */
export function ActiveBadge() {
  return <span className={styles.activeBadge}>Active</span>;
}

/**
 * A sprint band: the sprint's identity on the left, its items on the right.
 *
 * The work-stream table and the item list each carried a near-verbatim copy of
 * this, and all three tables repeated the muted "No sprint" trailer — hence
 * `variant`, which is the only thing that differed between them.
 *
 * `dropTarget` lets a presenter make the band accept dragged items without this
 * component knowing anything about drag-and-drop.
 */
export function SprintBand({
  title,
  variant = 'named',
  dates,
  count,
  points,
  badge,
  extra,
  items,
  sort,
  sortCtx,
  renderRow,
  emptyLabel,
  accent,
  dropTarget,
}: {
  title: string;
  /** `unassigned` is the muted italic style for the "No sprint" bucket. */
  variant?: 'named' | 'unassigned';
  dates?: string;
  count: number;
  points?: number;
  badge?: ReactNode;
  /** Extra content below the meta, e.g. a code-freeze chip. */
  extra?: ReactNode;
  items: Parameters<typeof sortItems>[0];
  sort: ItemSort | null;
  sortCtx: SortCtx;
  renderRow: (item: ReturnType<typeof sortItems>[number]) => ReactNode;
  /** Shown in place of rows when the band is empty; omit to render nothing. */
  emptyLabel?: string;
  /** Colour for the left edge marker (marks the active sprint). */
  accent?: string;
  dropTarget?: {
    over: boolean;
    handlers: React.HTMLAttributes<HTMLDivElement>;
  };
}) {
  const sorted = sortItems(items, sort, sortCtx);
  return (
    <div
      className={styles.section}
      data-over={dropTarget?.over || undefined}
      {...(dropTarget?.handlers ?? {})}
    >
      <div
        className={styles.sectionLeft}
        style={accent ? { boxShadow: `inset 4px 0 0 ${accent}` } : undefined}
      >
        <div className={styles.sectionHead}>
          <span className={variant === 'unassigned' ? styles.sectionNameMuted : styles.sectionNameLarge}>
            {title}
          </span>
          {badge}
        </div>
        {dates && <div className={styles.sectionMeta} style={{ marginTop: 3 }}>{dates}</div>}
        <div className={styles.sectionMeta}>
          {count} item{count !== 1 ? 's' : ''}
          {points != null ? ` · ${points} pts` : ''}
        </div>
        {extra}
      </div>
      <div className={styles.sectionRight}>
        {sorted.map(renderRow)}
        {sorted.length === 0 && emptyLabel && (
          <div className={`card dash ${styles.sectionEmpty}`}>{emptyLabel}</div>
        )}
      </div>
    </div>
  );
}
