// sprint-row-horizontal.jsx — exploration of the release-plan sprint row with
// the sprint META laid out HORIZONTALLY across the top of the row (instead of a
// fixed-width column on the left). Goal: every sprint row is the same height
// regardless of name length / event count. Labels truncate; events collapse to
// "+N" when they don't fit.
//
// Each variant is shown with three sample rows: a normal sprint, an
// over-capacity sprint with a long custom name + many events (the failure
// case), and the active sprint.

const ST = WF.status;

// ── sample data ─────────────────────────────────────────────────────────────
const ROWS = [
  { name: 'Sprint 6', dates: 'Jun 22 – Jul 5', planned: 20, cap: 40,
    events: [{ label: 'Beta cut', date: 'Jul 3' }], active: false },
  { name: 'Hardening & launch-prep sprint', dates: 'May 25 – Jun 7', planned: 43, cap: 40,
    events: [{ label: 'Code freeze', date: 'May 31' }, { label: 'Design review', date: 'Jun 2' }, { label: 'Demo', date: 'Jun 4' }, { label: 'Beta cut', date: 'Jun 6' }], active: false },
  { name: 'Sprint 3', dates: 'May 11 – May 24', planned: 39, cap: 35,
    events: [{ label: 'Design review', date: 'May 15' }], active: true },
];

// work-stream lane (cards sized ∝ item count), unchanged from the real row
const LANE = [
  { name: 'Checkout API', pts: 5, seg: [{ k: 'Complete', v: 2 }, { k: 'Active', v: 2 }, { k: 'Not Started', v: 1 }] },
  { name: 'Search Revamp', pts: 3, seg: [{ k: 'Active', v: 2 }, { k: 'Blocked', v: 1 }] },
  { name: 'Notifications', pts: 2, seg: [{ k: 'Complete', v: 1 }, { k: 'Active', v: 1 }] },
];
function Lane({ cols }) {
  return (
    <div style={{ display: 'flex', gap: 7, flex: 1, minWidth: 0 }}>
      {cols.map((c, i) => (
        <div key={i} className="wf-card" style={{ flex: `${c.pts} 1 0`, minWidth: 86, padding: '8px 11px', display: 'flex', flexDirection: 'column', gap: 6, overflow: 'hidden', background: WF.paper }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 650, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: '1 1 auto', minWidth: 0 }}>{c.name}</span>
            <span className="wf-mono" style={{ fontSize: 11.5, color: WF.t3, flex: '0 0 auto' }}>{c.pts}</span>
          </div>
          <SegBar segs={c.seg} height={6} />
        </div>
      ))}
    </div>
  );
}

// ── shared building blocks ───────────────────────────────────────────────────
const NameLine = ({ name, size = 13.5, grow = '0 1 auto' }) => (
  <span title={name} style={{ fontWeight: 750, fontSize: size, color: WF.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, flex: grow }}>{name}</span>
);
const Dates = ({ d }) => <span style={{ fontSize: 11.5, color: WF.t3, whiteSpace: 'nowrap', flex: '0 0 auto' }}>{d}</span>;
const ActivePill = () => <span className="wf-now" style={{ flex: '0 0 auto' }}>Active</span>;
const Dot = () => <span style={{ width: 3, height: 3, borderRadius: 2, background: WF.t3, opacity: 0.6, flex: '0 0 auto' }} />;

// capacity as a compact mono chip; turns red + "over" past capacity
const CapChip = ({ planned, cap }) => {
  const over = planned > cap;
  return (
    <span className="wf-pts" title={over ? `Over capacity by ${planned - cap} pts` : `${cap - planned} pts of capacity remaining`}
      style={{ flex: '0 0 auto', background: over ? ST.Blocked.soft : WF.fill, color: over ? ST.Blocked.text : WF.t2 }}>
      {planned}/{cap} pts{over ? ' · over' : ''}
    </span>
  );
};

// inline capacity meter: little track + label, fixed width
const CapBar = ({ planned, cap, w = 132 }) => {
  const over = planned > cap;
  const ratio = cap > 0 ? Math.min(planned / cap, 1) : 0;
  const overW = over ? Math.min((planned - cap) / cap, 0.5) : 0;
  return (
    <div style={{ flex: '0 0 auto', width: w, display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, display: 'flex', height: 6, borderRadius: 4, overflow: 'hidden', background: WF.fill }}>
        <div style={{ flex: ratio, background: over ? ST.Blocked.dot : ST.Active.dot }} />
        {over ? <div style={{ flex: overW, background: ST.Blocked.text }} /> : <div style={{ flex: 1 - ratio }} />}
      </div>
      <span className="wf-mono" style={{ fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', color: over ? ST.Blocked.text : WF.t2 }}>{planned}/{cap}</span>
    </div>
  );
};

// EventStrip — renders as many event badges as fit on one line, then "+N".
// Measures every badge off-screen so it can decide how many fit, then re-checks
// on resize. Never wraps, so the row keeps a constant height.
function EventStrip({ events, align = 'flex-start' }) {
  const wrapRef = React.useRef(null);
  const widthsRef = React.useRef([]);
  const [vis, setVis] = React.useState(events.length);

  React.useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const recompute = () => {
      const widths = widthsRef.current;
      if (!widths.length) return;
      const avail = wrap.clientWidth;
      const gap = 5, moreW = 30;
      let used = 0, fit = 0;
      for (let i = 0; i < widths.length; i++) {
        const add = (i ? gap : 0) + widths[i];
        const remaining = widths.length - (i + 1);
        const reserve = remaining > 0 ? gap + moreW : 0;
        if (used + add + reserve <= avail) { used += add; fit++; } else break;
      }
      setVis(fit);
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [events]);

  return (
    <div ref={wrapRef} style={{ flex: '1 1 0', minWidth: 0, overflow: 'hidden', display: 'flex', justifyContent: align, position: 'relative' }}>
      {/* off-screen measurer — records each badge's natural width */}
      <div aria-hidden ref={(el) => { if (el) widthsRef.current = Array.from(el.children).map((c) => c.offsetWidth); }}
        style={{ position: 'absolute', top: 0, left: 0, visibility: 'hidden', pointerEvents: 'none', display: 'flex', gap: 5 }}>
        {events.map((e, i) => <EventBadge key={i} date={e.date}>{e.label}</EventBadge>)}
      </div>
      {/* visible run */}
      <div style={{ display: 'flex', gap: 5, alignItems: 'center', minWidth: 0 }}>
        {events.slice(0, vis).map((e, i) => <EventBadge key={i} date={e.date}>{e.label}</EventBadge>)}
        {vis < events.length && (
          <span className="wf-pts" title={`${events.length - vis} more event${events.length - vis === 1 ? '' : 's'}`}
            style={{ flex: '0 0 auto', cursor: 'default' }}>+{events.length - vis}</span>
        )}
      </div>
    </div>
  );
}

// row shell: a column card — META strip on top (fixed height), lane below
function RowShell({ active, meta }) {
  return (
    <div className={'wf-card wf-sprintrow' + (active ? ' wf-active' : '')} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {meta}
      <div style={{ padding: '10px 13px' }}><Lane cols={LANE} /></div>
    </div>
  );
}
const stripBorder = (active) => `1.5px solid ${active ? ST.Active.dot : WF.line}`;

// ══════════ A · Inline rail — name · dates · capacity, events pushed right ════
function MetaA({ d }) {
  return (
    <RowShell active={d.active} meta={
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 14px', borderBottom: stripBorder(d.active) }}>
        {d.active && <ActivePill />}
        <NameLine name={d.name} grow="0 1 auto" />
        <Dot />
        <Dates d={d.dates} />
        <CapChip planned={d.planned} cap={d.cap} />
        <EventStrip events={d.events} align="flex-end" />
      </div>
    } />
  );
}

// ══════════ B · Capacity meter inline — visual capacity bar in the strip ══════
function MetaB({ d }) {
  return (
    <RowShell active={d.active} meta={
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 14px', borderBottom: stripBorder(d.active) }}>
        {d.active && <ActivePill />}
        <NameLine name={d.name} grow="0 1 auto" />
        <Dates d={d.dates} />
        <CapBar planned={d.planned} cap={d.cap} />
        <EventStrip events={d.events} align="flex-end" />
      </div>
    } />
  );
}

// ══════════ C · Stat cells — tinted header, divided meta cells ════════════════
const Cell = ({ label, children, color }) => (
  <div style={{ flex: '0 0 auto', padding: '0 14px', borderLeft: `1.5px solid ${WF.line}`, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2 }}>
    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: WF.t3, whiteSpace: 'nowrap' }}>{label}</span>
    <span style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', color: color || WF.t2 }}>{children}</span>
  </div>
);
function MetaC({ d }) {
  const over = d.planned > d.cap;
  return (
    <RowShell active={d.active} meta={
      <div style={{ display: 'flex', alignItems: 'stretch', minHeight: 48, background: d.active ? 'transparent' : WF.fill, borderBottom: stripBorder(d.active) }}>
        <div style={{ flex: '1 1 0', minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px' }}>
          {d.active && <ActivePill />}
          <NameLine name={d.name} grow="0 1 auto" />
        </div>
        <Cell label="Dates">{d.dates}</Cell>
        <Cell label="Capacity" color={over ? ST.Blocked.text : WF.t2}>{d.planned}/{d.cap}{over ? ' · over' : ''}</Cell>
        <div style={{ flex: '1.4 1 0', minWidth: 0, display: 'flex', alignItems: 'center', padding: '0 14px', borderLeft: `1.5px solid ${WF.line}` }}>
          <EventStrip events={d.events} align="flex-start" />
        </div>
      </div>
    } />
  );
}

// ══════════ D · Two-row fixed — stats on row 1, events on their own row 2 ═════
function MetaD({ d }) {
  return (
    <RowShell active={d.active} meta={
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, padding: '9px 14px', borderBottom: stripBorder(d.active) }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          {d.active && <ActivePill />}
          <NameLine name={d.name} grow="0 1 auto" />
          <Dates d={d.dates} />
          <CapChip planned={d.planned} cap={d.cap} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 20 }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: WF.t3, flex: '0 0 auto' }}>Events</span>
          {d.events.length ? <EventStrip events={d.events} align="flex-start" />
            : <span style={{ fontSize: 11.5, color: WF.t3 }}>None</span>}
        </div>
      </div>
    } />
  );
}

// ── stack of the three sample rows for a given meta renderer ──────────────────
const Stack = ({ Meta }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 16, background: WF.bg, borderRadius: 10 }}>
    {ROWS.map((d, i) => <Meta key={i} d={d} />)}
  </div>
);

function App() {
  return (
    <DesignCanvas>
      <DCSection id="horiz" title="Sprint row · horizontal meta"
        subtitle="Meta runs across the top so every row is the same height. Each stack: a normal sprint, an over-capacity sprint with a long name + many events, and the active sprint.">
        <DCArtboard id="a" label="A · Inline rail" width={780} height={392}><Stack Meta={MetaA} /></DCArtboard>
        <DCArtboard id="b" label="B · Capacity meter inline" width={780} height={392}><Stack Meta={MetaB} /></DCArtboard>
        <DCArtboard id="c" label="C · Stat cells" width={780} height={404}><Stack Meta={MetaC} /></DCArtboard>
        <DCArtboard id="d" label="D · Two-row (events on own line)" width={780} height={452}><Stack Meta={MetaD} /></DCArtboard>
      </DCSection>
    </DesignCanvas>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
