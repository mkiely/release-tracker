import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import { PButton } from './primitives';
import styles from './Menu.module.css';

export type MenuAction = {
  /** Stable identity for the list. */
  key: string;
  label: ReactNode;
  icon?: ReactNode;
  onSelect: () => void;
  title?: string;
  disabled?: boolean;
  /** Omit or `true` to show; `false` to hide (e.g. a connector-only action on a local release). */
  visible?: boolean;
};

/**
 * A trigger button that opens a popover list of actions — the generic grouping
 * control for the top-bar action row. Point it at any cluster of related
 * buttons to collapse them behind one caret. When only a single action is
 * visible a dropdown is pointless, so it renders that action as a plain flat
 * button instead (no caret, no popover); when none are visible it renders
 * nothing. This keeps the abstraction honest as the release-view header grows
 * more groups over time.
 */
export function Menu({
  label,
  icon,
  actions,
  sm,
  variant = 'subtle',
  align = 'right',
  title,
}: {
  label: ReactNode;
  icon?: ReactNode;
  actions: MenuAction[];
  sm?: boolean;
  variant?: 'subtle' | 'ghost' | 'danger';
  align?: 'left' | 'right';
  title?: string;
}) {
  const visible = actions.filter((a) => a.visible !== false);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onMouse = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onMouse);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onMouse);
    };
  }, [open]);

  // Degenerate cases: a lone action doesn't warrant a menu, and an empty group
  // shouldn't take up space in the action row.
  if (visible.length === 0) return null;
  if (visible.length === 1) {
    const a = visible[0];
    return (
      <PButton variant={variant} sm={sm} icon={a.icon} onClick={a.onSelect} title={a.title} disabled={a.disabled}>
        {a.label}
      </PButton>
    );
  }

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <PButton variant={variant} sm={sm} icon={icon} onClick={() => setOpen((o) => !o)} title={title}>
        {label}
        <span className={styles.caret} data-open={open || undefined}>
          {Icon.chevDown}
        </span>
      </PButton>
      {open && (
        <div className={`${styles.menu} ${align === 'left' ? styles.alignLeft : styles.alignRight}`} role="menu">
          {visible.map((a) => (
            <button
              key={a.key}
              type="button"
              role="menuitem"
              className={styles.item}
              disabled={a.disabled}
              title={a.title}
              onClick={() => {
                setOpen(false);
                a.onSelect();
              }}
            >
              {a.icon && <span className={styles.itemIcon}>{a.icon}</span>}
              <span className={styles.itemLabel}>{a.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
