// Visual primitives — ported from wireframe-kit.jsx (EventBadge, StatusChip,
// SegBar, Avatar) plus the Meter from proto-app.jsx.

import type { CSSProperties, ReactNode } from 'react';
import type { Status, StatusSeg } from '../types';
import { WF } from './tokens';

export function EventBadge({
  children,
  date,
  max = 16,
}: {
  children: ReactNode;
  date?: string;
  max?: number;
}) {
  const full = typeof children === 'string' ? children : null;
  const txt = full && full.length > max ? full.slice(0, max - 1) + '…' : children;
  return (
    <span className="wf-event" title={full || undefined}>
      <span className="wf-flag" style={{ flex: '0 0 auto' }} />
      <span style={{ whiteSpace: 'nowrap', flex: '0 0 auto' }}>{txt}</span>
      {date ? <span style={{ color: WF.t3, fontWeight: 500, flex: '0 0 auto' }}>{date}</span> : null}
    </span>
  );
}

export function StatusChip({ status, count }: { status: Status; count?: number }) {
  const c = WF.status[status] || WF.status['Not Started'];
  return (
    <span className="wf-chip" style={{ background: c.soft, color: c.text }}>
      <span className="wf-dot" style={{ background: c.dot }} />
      {status}
      {count != null ? ` · ${count}` : ''}
    </span>
  );
}

export function Avatar({ initials }: { initials: ReactNode }) {
  return <span className="wf-avatar">{initials}</span>;
}

// segmented micro-bar showing status breakdown of a set of items
export function SegBar({ segs, height = 7, radius = 4 }: { segs: StatusSeg[]; height?: number; radius?: number }) {
  return (
    <div style={{ display: 'flex', height, borderRadius: radius, overflow: 'hidden', background: WF.fill, gap: 1.5 }}>
      {segs.map((s, i) => (
        <div key={i} style={{ flex: s.v, background: (WF.status[s.k] || ({} as { dot?: string })).dot || WF.lineStrong }} />
      ))}
    </div>
  );
}

// simple completion meter (home cards)
export function Meter({ v, w = '100%' }: { v: number; w?: CSSProperties['width'] }) {
  return (
    <div style={{ height: 7, width: w, borderRadius: 4, background: WF.fill, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${Math.round(v * 100)}%`, background: WF.status.Active.dot }} />
    </div>
  );
}
