/**
 * Small accent dot marking a work item with unpushed local changes (one or more
 * dirty fields awaiting a connector push). Used wherever a work item is shown —
 * cards, table rows, and the detail modal — so the signal reads the same everywhere.
 */
export function DirtyDot({ size = 6 }: { size?: number }) {
  return (
    <span
      title="Modified — pending push"
      aria-label="Modified — pending push"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'var(--rt-st-ac-dot)',
        flexShrink: 0,
        display: 'inline-block',
      }}
    />
  );
}
