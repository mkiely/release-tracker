// CapBarInline — inline capacity meter for the sprint-row meta strip: a track
// plus a planned/cap label. Turns red and shows the overflow segment once
// planned points exceed capacity. Ported from proto-app.jsx.

import { WF } from './tokens';

export function CapBarInline({ planned, cap, w = 134 }: { planned: number; cap: number; w?: number }) {
  const over = planned > cap;
  const ratio = cap > 0 ? Math.min(planned / cap, 1) : planned > 0 ? 1 : 0;
  const overW = over && cap > 0 ? Math.min((planned - cap) / cap, 0.5) : 0;
  return (
    <div
      title={over ? `Over capacity by ${planned - cap} pts` : `${Math.max(0, cap - planned)} pts of capacity remaining`}
      style={{ flex: '0 0 auto', width: w, display: 'flex', alignItems: 'center', gap: 8 }}
    >
      <div style={{ flex: 1, display: 'flex', height: 6, borderRadius: 4, overflow: 'hidden', background: WF.fill, border: `1px solid ${WF.line}` }}>
        <div style={{ flex: ratio, background: over ? WF.status.Blocked.dot : WF.status.Active.dot }} />
        {over
          ? <div style={{ flex: overW, background: WF.status.Blocked.text }} />
          : <div style={{ flex: 1 - ratio, background: WF.lineStrong }} />}
      </div>
      <span
        className="mono"
        style={{ fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', color: over ? WF.status.Blocked.text : WF.t2 }}
      >
        {planned}<span style={{ opacity: 0.55, fontWeight: 400 }}>/{cap} pts</span>
      </span>
    </div>
  );
}
