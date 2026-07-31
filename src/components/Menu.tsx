import { Fragment, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
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
  /** Uppercase group label rendered above this item; starts a new section. */
  section?: string;
  /** Renders a check on the trailing edge — for a chosen option in a set (e.g. an
   *  auto-sync cadence) rather than a one-shot command. */
  checked?: boolean;
  /** Leave the popover open after selecting. For toggles a user flips several of
   *  in a row (column visibility), where closing each time fights the task. */
  keepOpen?: boolean;
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
  style,
}: {
  label: ReactNode;
  icon?: ReactNode;
  actions: MenuAction[];
  sm?: boolean;
  variant?: 'subtle' | 'ghost' | 'danger';
  align?: 'left' | 'right';
  title?: string;
  style?: CSSProperties;
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
  // shouldn't take up space in the action row. A lone action inside a *section*
  // still needs its label for context, so it keeps the popover.
  if (visible.length === 0) return null;
  if (visible.length === 1 && !visible[0].section) {
    const a = visible[0];
    return (
      <PButton variant={variant} sm={sm} icon={a.icon} onClick={a.onSelect} title={a.title} disabled={a.disabled}>
        {a.label}
      </PButton>
    );
  }

  const popover = (
    <div className={`${styles.menu} ${align === 'left' ? styles.alignLeft : styles.alignRight}`} role="menu">
      {visible.map((a, i) => (
        <Fragment key={a.key}>
          {a.section && a.section !== visible[i - 1]?.section && (
            <>
              {i > 0 && <div className={styles.sectionRule} />}
              <div className={styles.sectionLabel}>{a.section}</div>
            </>
          )}
          <button
            type="button"
            // A checkable item that keeps the popover open is a multi-select
            // toggle (columns); one that closes it is a choice from a set.
            role={a.checked === undefined ? 'menuitem' : a.keepOpen ? 'menuitemcheckbox' : 'menuitemradio'}
            aria-checked={a.checked}
            className={styles.item}
            disabled={a.disabled}
            title={a.title}
            onClick={() => {
              if (!a.keepOpen) setOpen(false);
              a.onSelect();
            }}
          >
            {a.icon && <span className={styles.itemIcon}>{a.icon}</span>}
            <span className={styles.itemLabel}>{a.label}</span>
            {a.checked && <span className={styles.itemCheck}>{Icon.check}</span>}
          </button>
        </Fragment>
      ))}
    </div>
  );

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <PButton variant={variant} sm={sm} icon={icon} onClick={() => setOpen((o) => !o)} title={title} style={style}>
        {label}
        <span className={styles.caret} data-open={open || undefined}>
          {Icon.chevDown}
        </span>
      </PButton>
      {open && popover}
    </div>
  );
}
