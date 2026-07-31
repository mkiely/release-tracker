import { Fragment, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
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
  escapeOverflow,
}: {
  label: ReactNode;
  icon?: ReactNode;
  actions: MenuAction[];
  sm?: boolean;
  variant?: 'subtle' | 'ghost' | 'danger';
  align?: 'left' | 'right';
  title?: string;
  style?: CSSProperties;
  /** Render the popover into the body, positioned against the trigger. Needed
   *  when an ancestor scrolls (overflow clips an absolutely-positioned child) —
   *  e.g. the table's facet bar, which scrolls horizontally. */
  escapeOverflow?: boolean;
}) {
  const visible = actions.filter((a) => a.visible !== false);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; left: number; right: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Measured on open (and on scroll/resize while open) so the escaped popover
  // tracks a trigger that can move under it.
  useLayoutEffect(() => {
    if (!open || !escapeOverflow) return;
    const place = () => {
      const r = ref.current?.getBoundingClientRect();
      if (r) setAnchor({ top: r.bottom + 8, left: r.left, right: window.innerWidth - r.right });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, escapeOverflow]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onMouse = (e: MouseEvent) => {
      const target = e.target as Node;
      // The escaped popover is portalled onto the body, so it is NOT inside the
      // trigger's ref — without checking it too, pressing an item counts as an
      // outside click and closes the menu before the click can land on it.
      if (popoverRef.current?.contains(target)) return;
      if (ref.current && !ref.current.contains(target)) setOpen(false);
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
    <div
      ref={popoverRef}
      className={
        `${styles.menu} ${align === 'left' ? styles.alignLeft : styles.alignRight}` +
        (escapeOverflow ? ` ${styles.menuFixed}` : '')
      }
      role="menu"
      style={
        escapeOverflow && anchor
          ? { top: anchor.top, ...(align === 'left' ? { left: anchor.left } : { right: anchor.right }) }
          : undefined
      }
    >
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
      {open && (escapeOverflow ? createPortal(popover, document.body) : popover)}
    </div>
  );
}
