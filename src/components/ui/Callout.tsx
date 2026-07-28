import type { ReactNode } from 'react';
import styles from './Callout.module.css';

/**
 * An inset card that explains the consequence of what the user just entered —
 * which sprint a date lands in, what a freeze will cap. A small square marker
 * carries the tone, so the same block reads as informational, cautionary, or
 * not-yet-resolved without changing shape.
 *
 * The event and code-freeze modals each had their own copy of this, differing
 * only in the marker colour.
 */
export function Callout({ tone = 'neutral', children }: { tone?: 'active' | 'warning' | 'neutral'; children: ReactNode }) {
  return (
    <div className={`card ${styles.callout}`}>
      <span className={`${styles.marker} ${styles[tone]}`} />
      <span className={styles.body}>{children}</span>
    </div>
  );
}

/**
 * The worked-arithmetic block: a label over a column of key/value rows, ending
 * in the figure that matters. Used wherever the app shows how a number was
 * arrived at rather than just asserting it — sprint velocity, the capacity-fit
 * forecast.
 */
export function CalcCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={`card ${styles.calcCard}`}>
      <span className={`tag ${styles.calcLabel}`}>{label}</span>
      {children}
    </div>
  );
}

/** A small read-only tag in a modal header — item type, build, an external link.
 *  `as` lets the same shape render as a link or a button where it's actionable. */
export function MetaChip({
  children,
  title,
  accent,
  onClick,
  href,
  ariaLabel,
}: {
  children: ReactNode;
  title?: string;
  /** Renders in the accent colour, marking the chip as actionable. */
  accent?: boolean;
  onClick?: () => void;
  href?: string;
  ariaLabel?: string;
}) {
  const cls = `${styles.chip} ${accent ? styles.chipAccent : ''}`;
  if (href) {
    return (
      <a className={cls} href={href} target="_blank" rel="noopener noreferrer" title={title} aria-label={ariaLabel}>
        {children}
      </a>
    );
  }
  if (onClick) {
    return (
      <button type="button" className={cls} onClick={onClick} title={title} aria-label={ariaLabel}>
        {children}
      </button>
    );
  }
  return (
    <span className={cls} title={title}>
      {children}
    </span>
  );
}
