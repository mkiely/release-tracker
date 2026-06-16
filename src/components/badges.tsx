import type { CSSProperties, ReactNode } from 'react';
import type { Status, StatusSeg } from '../types';
import { statusVars } from './statusVars';
import styles from './badges.module.css';

/** A calendar-event chip (flag + label + optional date). Long labels are
 *  truncated to `max` chars with the full text in a tooltip. */
export function EventBadge({
  children,
  date,
  max = 22,
  onClick,
}: {
  children: ReactNode;
  date?: string;
  max?: number;
  onClick?: () => void;
}) {
  const full = typeof children === 'string' ? children : null;
  const txt = full && full.length > max ? full.slice(0, max - 1) + '…' : children;
  return (
    <span
      className={styles.badge}
      title={full || undefined}
      onClick={onClick ? (e) => { e.stopPropagation(); onClick(); } : undefined}
      style={onClick ? { cursor: 'pointer' } : undefined}
    >
      <span className={styles.flag} />
      <span className={styles.text}>{txt}</span>
      {date ? <span className={styles.date}>{date}</span> : null}
    </span>
  );
}

export function StatusChip({ status, count }: { status: Status; count?: number }) {
  const { soft, text, dot } = statusVars(status);
  return (
    <span className="chip" style={{ background: soft, color: text }}>
      <span className="dot" style={{ background: dot }} />
      {status}
      {count != null ? ` · ${count}` : ''}
    </span>
  );
}

/**
 * A soft-tinted status pill (dot + label). `sm` is the compact form used in
 * dense table rows; the default is the slightly larger form used as a column
 * heading. Distinct from {@link StatusChip}, which uses the global `.chip` class.
 * `label` overrides the displayed text (e.g. an item's native workflow state)
 * while colors stay keyed to the canonical category.
 */
export function StatusPill({ status, sm, label, title }: { status: Status; sm?: boolean; label?: string; title?: string }) {
  const { soft, text, dot } = statusVars(status);
  const d = sm ? 5 : 6;
  const display = label ?? status;
  return (
    <span
      title={title ?? display}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: sm ? '1px 7px 1px 6px' : '2px 9px 2px 7px',
        borderRadius: 20,
        background: soft,
        color: text,
        fontSize: 'var(--rt-fs-xs)',
        fontWeight: sm ? 'var(--rt-fw-semibold)' : 'var(--rt-fw-bold)',
        whiteSpace: 'nowrap',
        minWidth: 0,
        maxWidth: '100%',
      }}
    >
      <span style={{ width: d, height: d, borderRadius: '50%', background: dot, flexShrink: 0 }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{display}</span>
    </span>
  );
}

// segmented micro-bar showing status breakdown of a set of items
export function SegBar({ segs, height = 7, radius = 4 }: { segs: StatusSeg[]; height?: number; radius?: number }) {
  return (
    <div style={{ display: 'flex', height, borderRadius: radius, overflow: 'hidden', background: 'var(--rt-fill)', gap: 1.5 }}>
      {segs.map((s, i) => (
        <div key={i} style={{ flex: s.v, background: statusVars(s.k).dot }} />
      ))}
    </div>
  );
}

// simple completion meter (home cards)
export function Meter({ v, w = '100%' }: { v: number; w?: CSSProperties['width'] }) {
  return (
    <div style={{ height: 7, width: w, borderRadius: 4, background: 'var(--rt-fill)', overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${Math.round(v * 100)}%`, background: 'var(--rt-st-ac-dot)' }} />
    </div>
  );
}
