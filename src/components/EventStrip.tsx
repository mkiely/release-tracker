// EventStrip — renders as many event badges as fit on one line, then a "+N"
// overflow chip. Measures every badge off-screen and re-checks on resize, so
// the sprint row keeps a constant height regardless of how many events fall in
// it. Ported from proto-app.jsx; algorithm per the handoff README.

import { useLayoutEffect, useRef, useState } from 'react';
import type { ReleaseEvent } from '../types';
import { fmtShort } from '../lib/dates';
import { EventBadge } from './badges';

export function EventStrip({ events, align = 'flex-start', onEventClick }: { events: ReleaseEvent[]; align?: 'flex-start' | 'flex-end'; onEventClick?: (eventId: string) => void }) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const widthsRef = useRef<number[]>([]);
  const [vis, setVis] = useState(events.length);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const recompute = () => {
      const widths = widthsRef.current;
      if (!widths.length) {
        setVis(0);
        return;
      }
      const avail = wrap.clientWidth;
      const gap = 5;
      const moreW = 30;
      let used = 0;
      let fit = 0;
      for (let i = 0; i < widths.length; i++) {
        const add = (i ? gap : 0) + widths[i];
        const reserve = widths.length - (i + 1) > 0 ? gap + moreW : 0;
        if (used + add + reserve <= avail) {
          used += add;
          fit++;
        } else break;
      }
      setVis(fit);
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [events]);

  if (!events.length) return <div style={{ flex: '1 1 0', minWidth: 0 }} />;

  return (
    <div
      ref={wrapRef}
      style={{ flex: '1 1 0', minWidth: 0, overflow: 'hidden', display: 'flex', justifyContent: align, position: 'relative' }}
    >
      {/* off-screen measurer — records each badge's natural width */}
      <div
        aria-hidden
        ref={(el) => {
          if (el) widthsRef.current = Array.from(el.children).map((c) => (c as HTMLElement).offsetWidth);
        }}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          visibility: 'hidden',
          pointerEvents: 'none',
          display: 'flex',
          gap: 5,
        }}
      >
        {events.map((e) => (
          <EventBadge key={e.id} date={fmtShort(e.dateISO)} onClick={onEventClick ? () => onEventClick(e.id) : undefined}>
            {e.label}
          </EventBadge>
        ))}
      </div>
      {/* visible run */}
      <div style={{ display: 'flex', gap: 5, alignItems: 'center', minWidth: 0 }}>
        {events.slice(0, vis).map((e) => (
          <EventBadge key={e.id} date={fmtShort(e.dateISO)} onClick={onEventClick ? () => onEventClick(e.id) : undefined}>
            {e.label}
          </EventBadge>
        ))}
        {vis < events.length && (
          <span
            className="wf-pts"
            title={`${events.length - vis} more event${events.length - vis === 1 ? '' : 's'}`}
            style={{ flex: '0 0 auto', cursor: 'default' }}
          >
            +{events.length - vis}
          </span>
        )}
      </div>
    </div>
  );
}
