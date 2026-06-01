// proto-dnd.jsx — drag-and-drop of work items between sprints + the shared
// capacity meter (Variant A). Used by the Sprint view and the Work Stream view.
//
// Exports (to window): Drag, useDrag, CapacityMeter, SprintRail, StreamSprintColumn

// ── tiny external drag store so any drop target can react to an in-flight drag ──
const Drag = (() => {
  let cur = null;                       // the work item currently being dragged (or null)
  const subs = new Set();
  const emit = () => subs.forEach((f) => f());
  return {
    start: (item) => { cur = item; emit(); },
    end:   () => { if (cur) { cur = null; emit(); } },
    get:   () => cur,
    sub:   (f) => { subs.add(f); return () => subs.delete(f); },
  };
})();
function useDrag() {
  const [, force] = React.useReducer((x) => x + 1, 0);
  React.useEffect(() => Drag.sub(force), []);
  return Drag.get();
}

// ── Variant A — planned-vs-capacity meter ───────────────────────────────────
function CapacityMeter({ planned, cap, style }) {
  const over = planned > cap;
  const ratio = cap > 0 ? Math.min(planned / cap, 1) : (planned > 0 ? 1 : 0);
  const overW = over && cap > 0 ? Math.min((planned - cap) / cap, 0.6) : 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, ...style }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
        <span className="wf-mono" style={{ fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', color: over ? WF.status.Blocked.text : WF.t2 }}>{planned} / {cap}</span>
        <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', whiteSpace: 'nowrap', color: over ? WF.status.Blocked.text : WF.t3, marginLeft: 'auto' }}>
          {over ? `over by ${planned - cap}` : 'pts'}
        </span>
      </div>
      <div style={{ display: 'flex', height: 6, borderRadius: 4, overflow: 'hidden', background: WF.fill }}>
        <div style={{ flex: ratio, background: over ? WF.status.Blocked.dot : WF.status.Active.dot }} />
        {over ? <div style={{ flex: overW, background: WF.status.Blocked.text }} /> : <div style={{ flex: 1 - ratio }} />}
      </div>
    </div>
  );
}

// ── Sprint rail (Sprint view): switcher + drop targets to move an item ───────
function SprintPill({ sp, planned, cap, isCur, draggingItem, onGo, onDropItem }) {
  const [over, setOver] = React.useState(false);
  const canDropVisual = !!draggingItem && !isCur;   // drives the dashed affordance
  return (
    <div onClick={() => !isCur && onGo()}
      onDragOver={(e) => { const it = Drag.get(); if (it && !isCur) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (!over) setOver(true); } }}
      onDragLeave={() => { if (over) setOver(false); }}
      onDrop={(e) => { const it = Drag.get(); if (it && !isCur) { e.preventDefault(); onDropItem(it); } setOver(false); Drag.end(); }}
      title={isCur ? 'Current sprint' : (canDropVisual ? `Move ${draggingItem.key} here` : `Go to ${sp.name}`)}
      style={{ flex: '0 0 auto', width: 150, cursor: isCur ? 'default' : 'pointer', padding: '7px 10px', borderRadius: 9,
        border: `1.5px ${canDropVisual ? 'dashed' : 'solid'} ${over ? WF.status.Active.text : (isCur ? WF.status.Active.dot : (canDropVisual ? WF.lineStrong : WF.line))}`,
        background: over ? WF.status.Active.soft : (isCur ? WF.status.Active.soft : WF.paper),
        display: 'flex', flexDirection: 'column', gap: 5, transition: 'border-color .12s, background .12s' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{sp.name}</span>
        {isCur && <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.06em', color: WF.status.Active.text, marginLeft: 'auto', flex: '0 0 auto' }}>HERE</span>}
        {canDropVisual && <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.06em', color: over ? WF.status.Active.text : WF.t3, marginLeft: 'auto', flex: '0 0 auto' }}>{over ? 'DROP' : 'MOVE'}</span>}
      </div>
      <CapacityMeter planned={planned} cap={cap} />
    </div>
  );
}

function SprintRail({ release, currentN, team, allItems, onGo, notify }) {
  const draggingItem = useDrag();
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', gap: 8, padding: '10px 24px', borderBottom: `1.5px solid ${WF.line}`, background: WF.paper, overflowX: 'auto' }}>
      <span className="wf-tag" style={{ alignSelf: 'center', flex: '0 0 auto' }}>Sprints</span>
      {release.sprints.map((sp) => {
        const planned = allItems.filter((i) => i.sprintN === sp.n).reduce((a, i) => a + i.points, 0);
        const cap = sprintVel(team, sp.daysOff);
        return (
          <SprintPill key={sp.n} sp={sp} planned={planned} cap={cap} isCur={sp.n === currentN} draggingItem={draggingItem}
            onGo={() => onGo(sp.n)}
            onDropItem={(it) => { if (it.sprintN !== sp.n) { Store.updateItem(it.id, { sprintN: sp.n }); notify(`Moved ${it.key} → ${sp.name}`); } }} />
        );
      })}
    </div>
  );
}

// ── Sprint column (Work Stream view): one sprint, drop target for this stream ─
function StreamSprintColumn({ sp, team, streamItems, allItems, isCur, onOpen, notify, renderCard }) {
  const draggingItem = useDrag();
  const [over, setOver] = React.useState(false);
  const planned = allItems.filter((i) => i.sprintN === sp.n).reduce((a, i) => a + i.points, 0);
  const cap = sprintVel(team, sp.daysOff);
  const streamPts = streamItems.reduce((a, i) => a + i.points, 0);
  const canDropVisual = !!draggingItem && draggingItem.sprintN !== sp.n;
  return (
    <div style={{ flex: 1, minWidth: 158, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 10px', borderRadius: 9,
        border: `1.5px solid ${isCur ? WF.status.Active.dot : WF.line}`, background: isCur ? WF.status.Active.soft : WF.paper }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontWeight: 750, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{sp.name}</span>
          {isCur && <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.06em', color: WF.status.Active.text, marginLeft: 'auto', flex: '0 0 auto' }}>NOW</span>}
        </div>
        <span style={{ fontSize: 10.5, color: WF.t3, whiteSpace: 'nowrap' }}>{fmtShort(sp.startISO)} – {fmtShort(sp.endISO)}</span>
        <CapacityMeter planned={planned} cap={cap} />
        <span style={{ fontSize: 10, color: WF.t3, whiteSpace: 'nowrap' }}>this stream · {streamPts} pts · {streamItems.length}</span>
      </div>
      <div
        onDragOver={(e) => { const it = Drag.get(); if (it && it.sprintN !== sp.n) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (!over) setOver(true); } }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(false); }}
        onDrop={(e) => { const it = Drag.get(); if (it && it.sprintN !== sp.n) { e.preventDefault(); Store.updateItem(it.id, { sprintN: sp.n }); notify(`Moved ${it.key} → ${sp.name}`); } setOver(false); Drag.end(); }}
        style={{ display: 'flex', flexDirection: 'column', gap: 9, flex: 1, minHeight: 64, borderRadius: 10,
          padding: over ? 6 : 0, outline: over ? `2px dashed ${WF.status.Active.dot}` : 'none', outlineOffset: -2,
          background: over ? WF.status.Active.soft : 'transparent', transition: 'background .12s' }}>
        {streamItems.map((it) => renderCard(it))}
        {streamItems.length === 0 && (
          <div className="wf-card wf-dash" style={{ padding: '16px 10px', textAlign: 'center', color: over ? WF.status.Active.text : WF.t3, fontSize: 11.5 }}>
            {canDropVisual ? 'Drop to move here' : 'No items'}
          </div>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { Drag, useDrag, CapacityMeter, SprintRail, StreamSprintColumn });
