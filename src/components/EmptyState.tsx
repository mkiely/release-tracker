import type { CSSProperties, ReactNode } from 'react';

/**
 * The dashed-card placeholder shown when a list/grid has nothing to display.
 * Defaults to the centered, 40px-padded form used across the card views; pass
 * `style` to tweak (e.g. add a margin in scrolling table bodies, or a smaller pad).
 */
export function EmptyState({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      className="card dash"
      style={{ padding: 40, textAlign: 'center', color: 'var(--rt-t3)', fontSize: 'var(--rt-fs-md)', ...style }}
    >
      {children}
    </div>
  );
}
