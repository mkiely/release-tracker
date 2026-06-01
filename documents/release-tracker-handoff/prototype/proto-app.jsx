// proto-app.jsx — screens, routing, and mount for the clickable prototype

// ════════════════════════════ theme (dark mode) ════════════════════════════
// External store so the persistent theme can be read/toggled from anywhere
// (header lives in every view) without threading props through every screen.
const ThemeStore = (() => {
  const KEY = 'release-tracker:theme';
  const listeners = new Set();
  let current = 'light';
  try { const s = localStorage.getItem(KEY); if (s === 'dark' || s === 'light') current = s; } catch (e) {}
  const apply = (t) => { if (typeof document !== 'undefined') document.documentElement.setAttribute('data-theme', t); };
  apply(current);
  return {
    get: () => current,
    set: (t) => { current = t; apply(t); try { localStorage.setItem(KEY, t); } catch (e) {} listeners.forEach((l) => l()); },
    toggle: () => ThemeStore.set(current === 'dark' ? 'light' : 'dark'),
    sub: (l) => { listeners.add(l); return () => listeners.delete(l); },
  };
})();
function useTheme() { return React.useSyncExternalStore(ThemeStore.sub, ThemeStore.get); }

function ThemeToggle() {
  const theme = useTheme();
  const dark = theme === 'dark';
  return (
    <IconButton
      icon={dark ? Icon.sun : Icon.moon}
      onClick={ThemeStore.toggle}
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'} />
  );
}

// ════════════════════════════ shared chrome ════════════════════════════
function NotFound({ label, nav }) {
  return (
    <div className="wf wf-screen pt-root" style={{ alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <div style={{ fontSize: 16, fontWeight: 650, color: WF.t2 }}>{label}</div>
      <PButton icon={Icon.chevLeft} onClick={() => nav({ screen: 'home' })}>Back to releases</PButton>
    </div>
  );
}

function TopBar({ left, title, sub, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
      padding: '14px 24px', borderBottom: `1.5px solid ${WF.line}`, background: WF.paper, flex: '0 0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
        {left}
        <div style={{ minWidth: 0 }}>
          {typeof title === 'string' ? <div style={{ fontSize: 19, fontWeight: 750, letterSpacing: '-0.02em', lineHeight: 1.05, whiteSpace: 'nowrap' }}>{title}</div> : title}
          {sub && <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: WF.t3, fontSize: 12.5, marginTop: 3, whiteSpace: 'nowrap' }}>{sub}</div>}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {right && <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>{right}</div>}
        <div style={{ display: 'flex', alignItems: 'center', paddingLeft: right ? 12 : 0, borderLeft: right ? `1.5px solid ${WF.line}` : 'none' }}>
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}

const Brand = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
    <div style={{ width: 26, height: 26, borderRadius: 7, background: WF.ink }} />
    <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: '-0.01em' }}>Release Tracker</span>
  </div>
);

const SyncButton = ({ onSync }) => {
  const st = useStore();
  const last = st.meta.lastSyncISO;
  const ago = last ? new Date(last) : null;
  const label = ago ? `Synced ${ago.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Sync';
  return <PButton variant="subtle" sm icon={Icon.sync} onClick={onSync} style={last ? { color: WF.status.Complete.text } : null}>{label}</PButton>;
};

const Meter = ({ v, w = '100%' }) => (
  <div style={{ height: 7, width: w, borderRadius: 4, background: WF.fill, overflow: 'hidden' }}>
    <div style={{ height: '100%', width: `${Math.round(v * 100)}%`, background: WF.status.Active.dot }} />
  </div>
);

// ════════════════════════════ Home ════════════════════════════
function HomeScreen({ nav, openModal }) {
  const st = useStore();
  const [name, setName] = React.useState('');
  const [start, setStart] = React.useState(todayISO());
  const [teamId, setTeamId] = React.useState(st.teams[0] ? st.teams[0].id : '');
  const canCreate = name.trim() && start && teamId;
  const create = () => { const r = Store.createRelease({ name: name.trim(), startISO: start, teamId }); nav({ screen: 'release', releaseId: r.id }); };

  const card = (r) => {
    const team = Store.team(r.teamId);
    const items = Store.itemsFor(r.id);
    const done = items.length ? items.filter((i) => i.status === 'Complete').length / items.length : 0;
    return (
      <div key={r.id} className="wf-card pt-link" onClick={() => nav({ screen: 'release', releaseId: r.id })}
        style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12, cursor: 'pointer', transition: 'border-color .12s, box-shadow .12s' }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = WF.lineStrong; e.currentTarget.style.boxShadow = '0 2px 0 ' + WF.line; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = WF.line; e.currentTarget.style.boxShadow = 'none'; }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 16, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: '1 1 auto', minWidth: 0 }}>{r.name}</div>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: WF.t2, flex: '0 0 auto' }}>{Math.round(done * 100)}%</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: WF.t3, fontSize: 13, whiteSpace: 'nowrap' }}>
          {Icon.users}<span>{team ? team.name : '—'}</span>
        </div>
        <Meter v={done} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: WF.t3 }}>
          <span>{r.workStreams.length} streams</span><span>{items.length} items</span><span>{fmtShort(r.startISO)}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="wf wf-screen pt-root">
      <TopBar left={<Brand />} right={<PButton variant="subtle" sm icon={Icon.users} onClick={() => nav({ screen: 'teams' })}>Teams</PButton>} />
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 28px', gap: 40 }}>
        <div style={{ width: 440, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 26, fontWeight: 750, letterSpacing: '-0.02em' }}>New release</div>
            <div style={{ fontSize: 14.5, color: WF.t3, marginTop: 5 }}>Start tracking a release cycle.</div>
          </div>
          <div className="wf-card" style={{ width: '100%', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <PField label="Release name"><PInput value={name} placeholder="e.g. Atlas 4.0" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && canCreate) create(); }} /></PField>
            <PField label="Start date"><PInput type="date" value={start} onChange={(e) => setStart(e.target.value)} /></PField>
            <PField label="Team"><div style={{ display: 'flex', gap: 9 }}>
              <PSelect value={teamId} onChange={(e) => setTeamId(e.target.value)} style={{ flex: 1 }}>
                {st.teams.length === 0 && <option value="">No teams yet</option>}
                {st.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </PSelect>
              <IconButton icon={Icon.plus} title="New team" onClick={() => openModal({ type: 'team' })} style={{ minHeight: 46, width: 46 }} />
            </div></PField>
            <PButton onClick={create} disabled={!canCreate} style={{ justifyContent: 'center', marginTop: 4 }}>Create release</PButton>
          </div>
        </div>
        <div style={{ width: '100%', maxWidth: 920 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <span className="wf-tag">Your releases · {st.releases.length}</span>
          </div>
          {st.releases.length === 0
            ? <div className="wf-card wf-dash" style={{ padding: 30, textAlign: 'center', color: WF.t3, fontSize: 14 }}>No releases yet — create one above.</div>
            : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>{st.releases.map(card)}</div>}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════ Teams ════════════════════════════
function TeamsScreen({ nav, openModal }) {
  const st = useStore();
  return (
    <div className="wf wf-screen pt-root">
      <TopBar
        left={<IconButton icon={Icon.chevLeft} title="Back" onClick={() => nav({ screen: 'home' })} />}
        title="Teams" sub={<span>{st.teams.length} teams · velocity drives default sprint capacity</span>}
        right={<PButton sm icon={Icon.plus} onClick={() => openModal({ type: 'team' })}>New team</PButton>} />
      <div style={{ flex: 1, overflow: 'auto', padding: '22px 26px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16 }}>
          {st.teams.map((t) => (
            <div key={t.id} className="wf-card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 15 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 750, fontSize: 16, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</div>
                  <div style={{ fontSize: 12, color: WF.t3, marginTop: 3 }}>{t.members.length} members</div>
                </div>
                <IconButton icon={Icon.edit} title="Edit team" onClick={() => openModal({ type: 'team', teamId: t.id })} style={{ flex: '0 0 auto' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
                <PField label="Velocity"><PInput type="number" min="0" value={t.velocity}
                  onChange={(e) => Store.updateTeam(t.id, { velocity: Number(e.target.value) || 0 })} style={{ width: 112 }} /></PField>
                <div style={{ flex: 1, paddingBottom: 13 }}>
                  <div style={{ fontSize: 11.5, color: WF.t3 }}>Full capacity</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: WF.t2 }}>{fullCap(t)} person-days / sprint</div>
                </div>
              </div>
              <hr className="wf-divider" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {t.members.map((m) => (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <span className="wf-avatar">{m.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}</span>
                    <span style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: 'nowrap' }}>{m.name}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// inline capacity meter for the sprint-row meta strip: track + planned/cap label.
// Turns red and shows the overflow segment once planned points exceed capacity.
function CapBarInline({ planned, cap, w = 134 }) {
  const over = planned > cap;
  const ratio = cap > 0 ? Math.min(planned / cap, 1) : (planned > 0 ? 1 : 0);
  const overW = over && cap > 0 ? Math.min((planned - cap) / cap, 0.5) : 0;
  return (
    <div title={over ? `Over capacity by ${planned - cap} pts` : `${Math.max(0, cap - planned)} pts of capacity remaining`}
      style={{ flex: '0 0 auto', width: w, display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, display: 'flex', height: 6, borderRadius: 4, overflow: 'hidden', background: WF.fill }}>
        <div style={{ flex: ratio, background: over ? WF.status.Blocked.dot : WF.status.Active.dot }} />
        {over ? <div style={{ flex: overW, background: WF.status.Blocked.text }} /> : <div style={{ flex: 1 - ratio }} />}
      </div>
      <span className="wf-mono" style={{ fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', color: over ? WF.status.Blocked.text : WF.t2 }}>{planned}/{cap}</span>
    </div>
  );
}

// EventStrip — renders as many event badges as fit on one line, then "+N".
// Measures every badge off-screen, re-checks on resize; never wraps so the
// sprint row keeps a constant height regardless of how many events fall in it.
function EventStrip({ events, align = 'flex-start' }) {
  const wrapRef = React.useRef(null);
  const widthsRef = React.useRef([]);
  const [vis, setVis] = React.useState(events.length);
  React.useLayoutEffect(() => {
    const wrap = wrapRef.current; if (!wrap) return;
    const recompute = () => {
      const widths = widthsRef.current; if (!widths.length) { setVis(0); return; }
      const avail = wrap.clientWidth, gap = 5, moreW = 30;
      let used = 0, fit = 0;
      for (let i = 0; i < widths.length; i++) {
        const add = (i ? gap : 0) + widths[i];
        const reserve = (widths.length - (i + 1)) > 0 ? gap + moreW : 0;
        if (used + add + reserve <= avail) { used += add; fit++; } else break;
      }
      setVis(fit);
    };
    recompute();
    const ro = new ResizeObserver(recompute); ro.observe(wrap);
    return () => ro.disconnect();
  }, [events]);
  if (!events.length) return <div style={{ flex: '1 1 0', minWidth: 0 }} />;
  return (
    <div ref={wrapRef} style={{ flex: '1 1 0', minWidth: 0, overflow: 'hidden', display: 'flex', justifyContent: align, position: 'relative' }}>
      {/* off-screen measurer — records each badge's natural width */}
      <div aria-hidden ref={(el) => { if (el) widthsRef.current = Array.from(el.children).map((c) => c.offsetWidth); }}
        style={{ position: 'absolute', top: 0, left: 0, visibility: 'hidden', pointerEvents: 'none', display: 'flex', gap: 5 }}>
        {events.map((e) => <EventBadge key={e.id} date={fmtShort(e.dateISO)}>{e.label}</EventBadge>)}
      </div>
      {/* visible run */}
      <div style={{ display: 'flex', gap: 5, alignItems: 'center', minWidth: 0 }}>
        {events.slice(0, vis).map((e) => <EventBadge key={e.id} date={fmtShort(e.dateISO)}>{e.label}</EventBadge>)}
        {vis < events.length && (
          <span className="wf-pts" title={`${events.length - vis} more event${events.length - vis === 1 ? '' : 's'}`}
            style={{ flex: '0 0 auto', cursor: 'default' }}>+{events.length - vis}</span>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════ Release Overview (direction C) ════════════════════════════
function ReleaseScreen({ releaseId, nav, openModal, onSync }) {
  useStore();
  const r = Store.release(releaseId);
  if (!r) return <NotFound label="Release not found." nav={nav} />;
  const team = Store.team(r.teamId);
  const items = Store.itemsFor(r.id);
  const active = activeSprint(r);
  const last = r.sprints[r.sprints.length - 1];

  // lane entries for a sprint: streams that have items in it, count + status segs, width ∝ count
  const laneFor = (sp) => r.workStreams.map((ws) => {
    const its = items.filter((i) => i.workStreamId === ws.id && i.sprintN === sp.n);
    return { ws, n: its.length, segs: statusSegs(its) };
  }).filter((e) => e.n > 0);

  return (
    <div className="wf wf-screen pt-root">
      <TopBar
        left={<IconButton icon={Icon.chevLeft} title="Back" onClick={() => nav({ screen: 'home' })} />}
        title={r.name}
        sub={<>{Icon.users}<span>{team ? team.name : '—'}</span><span style={{ opacity: .5 }}>·</span><span>{fmtShort(r.startISO)} – {fmtShort(last.endISO)}, {dOf(last.endISO).getFullYear()}</span></>}
        right={<><SyncButton onSync={onSync} />
          <PButton variant="subtle" sm icon={Icon.cal} onClick={() => openModal({ type: 'event', releaseId })}>New event</PButton>
          <PButton sm icon={Icon.plus} onClick={() => openModal({ type: 'stream', releaseId })}>New work stream</PButton></>} />

      <div style={{ flex: 1, overflow: 'hidden', display: 'grid', gridTemplateColumns: '1fr 256px' }}>
        {/* sprint board */}
        <div style={{ padding: '16px 22px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span className="wf-tag">Sprints · {r.sprints.length}</span>
              <span style={{ fontSize: 11.5, color: WF.t3 }}>{team ? team.name : '—'} · velocity {team ? team.velocity : 0} pts · click a sprint to open it</span>
            </div>
            <StatusLegend />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {r.sprints.map((sp) => {
              const off = sp.daysOff; const pct = Math.round(capPct(team, off) * 100); const vel = sprintVel(team, off);
              const planned = items.filter((i) => i.sprintN === sp.n).reduce((a, i) => a + i.points, 0);
              const isAct = active && active.n === sp.n; const evts = eventsIn(r, sp); const lane = laneFor(sp);
              return (
                <div key={sp.n} className={'wf-card wf-sprintrow pt-link' + (isAct ? ' wf-active' : '')} onClick={() => nav({ screen: 'sprint', releaseId, sprintN: sp.n })}
                  style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', cursor: 'pointer' }}>
                  {/* meta strip — horizontal across the top, fixed height so every row matches */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 14px', borderBottom: `1.5px solid ${isAct ? WF.status.Active.dot : WF.line}` }}>
                    <span title={sp.name} style={{ fontWeight: 750, fontSize: 13.5, color: WF.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, flex: '0 1 auto' }}>{sp.name}</span>
                    <span style={{ fontSize: 11.5, color: WF.t3, whiteSpace: 'nowrap', flex: '0 0 auto' }}>{fmtShort(sp.startISO)} – {fmtShort(sp.endISO)}</span>
                    <CapBarInline planned={planned} cap={vel} />
                    <EventStrip events={evts} align="flex-end" />
                  </div>
                  {/* work-stream lane */}
                  <div style={{ padding: '10px 13px' }}>
                    {lane.length === 0
                      ? <div className="wf-card wf-dash" style={{ minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', color: WF.t3, fontSize: 12.5 }}>No work items</div>
                      : <div style={{ display: 'flex', gap: 7, minWidth: 0 }}>
                          {lane.map((e) => (
                            <div key={e.ws.id} className="wf-card pt-link" onClick={(ev) => { ev.stopPropagation(); nav({ screen: 'workstream', releaseId, wsId: e.ws.id }); }}
                              style={{ flex: `${e.n} 1 0`, minWidth: 86, padding: '8px 11px', display: 'flex', flexDirection: 'column', gap: 6, overflow: 'hidden', background: WF.paper }}>
                              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                                <span style={{ fontSize: 13, fontWeight: 650, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: '1 1 auto', minWidth: 0 }}>{e.ws.name}</span>
                                <span className="wf-mono" style={{ fontSize: 11.5, color: WF.t3, flex: '0 0 auto' }}>{e.n}</span>
                              </div>
                              <SegBar segs={e.segs} height={6} />
                            </div>
                          ))}
                        </div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {/* right rail: work streams */}
        <div style={{ borderLeft: `1.5px solid ${WF.line}`, background: WF.paper, padding: '18px 18px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <PButton icon={Icon.plus} onClick={() => openModal({ type: 'stream', releaseId })} style={{ justifyContent: 'center' }}>New work stream</PButton>
          <hr className="wf-divider" />
          <span className="wf-tag">Work streams · {r.workStreams.length}</span>
          {r.workStreams.length === 0
            ? <span style={{ fontSize: 12.5, color: WF.t3 }}>None yet. Add a work stream, then create work items in it.</span>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {r.workStreams.map((ws, i) => {
                  const its = Store.itemsForStream(r.id, ws.id);
                  return (
                    <div key={ws.id} className="pt-link" onClick={() => nav({ screen: 'workstream', releaseId, wsId: ws.id })}
                      style={{ display: 'flex', flexDirection: 'column', gap: 7, paddingBottom: 9, borderBottom: i < r.workStreams.length - 1 ? `1px solid ${WF.line}` : 'none', cursor: 'pointer' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                        <span style={{ fontWeight: 650, fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: '1 1 auto', minWidth: 0 }}>{ws.name}</span>
                        <span style={{ color: WF.t3, display: 'flex', alignItems: 'center', gap: 4, flex: '0 0 auto' }}><span className="wf-mono" style={{ fontSize: 11 }}>{its.length}</span>{Icon.chevRight}</span>
                      </div>
                      {its.length > 0 && <SegBar segs={statusSegs(its)} height={6} />}
                    </div>
                  );
                })}
              </div>}
        </div>
      </div>
    </div>
  );
}

const StatusLegend = () => (
  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
    {STATUSES.map((s) => (
      <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: WF.t2 }}>
        <span className="wf-dot" style={{ background: WF.status[s].dot }} />{s}
      </span>
    ))}
  </div>
);

// ════════════════════════════ Work Stream (direction B) ════════════════════════════
function WorkStreamScreen({ releaseId, wsId, nav, openModal, onSync, notify }) {
  useStore();
  const r = Store.release(releaseId);
  const ws = r && r.workStreams.find((w) => w.id === wsId);
  if (!r || !ws) return <NotFound label="Work stream not found." nav={nav} />;
  const items = Store.itemsForStream(r.id, ws.id);
  const team = Store.team(r.teamId);
  const allItems = Store.itemsFor(r.id);
  const curN = activeSprint(r) ? activeSprint(r).n : null;
  const totalPts = items.reduce((a, i) => a + i.points, 0);

  return (
    <div className="wf wf-screen pt-root">
      <TopBar
        left={<IconButton icon={Icon.chevLeft} title="Back" onClick={() => nav({ screen: 'release', releaseId })} />}
        title={<><div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: WF.t3, marginBottom: 3, whiteSpace: 'nowrap' }}>
            <span className="pt-link" onClick={() => nav({ screen: 'release', releaseId })} style={{ cursor: 'pointer' }}>{r.name}</span>{Icon.chevRight}<span style={{ fontWeight: 600, color: WF.t2 }}>Work stream</span></div>
          <div style={{ fontSize: 19, fontWeight: 750, letterSpacing: '-0.02em', lineHeight: 1, whiteSpace: 'nowrap' }}>{ws.name}</div></>}
        right={<><span style={{ fontSize: 12.5, color: WF.t3 }}>{items.length} items · {totalPts} pts · drag cards between sprints</span>
          <SyncButton onSync={onSync} />
          <PButton sm icon={Icon.plus} onClick={() => openModal({ type: 'item', releaseId, presetStreamId: ws.id })}>New work item</PButton></>} />

      <div style={{ flex: 1, overflow: 'auto', padding: '18px 24px' }}>
        {items.length === 0
          ? <div className="wf-card wf-dash" style={{ padding: 40, textAlign: 'center', color: WF.t3, fontSize: 14 }}>No work items yet. Create one to get started.</div>
          : <div style={{ display: 'flex', gap: 14, alignItems: 'stretch', minHeight: '100%' }}>
              {r.sprints.map((sp) => (
                <StreamSprintColumn key={sp.n} sp={sp} team={team} isCur={sp.n === curN}
                  streamItems={items.filter((i) => i.sprintN === sp.n)} allItems={allItems} notify={notify}
                  renderCard={(it) => <WorkItemCard key={it.id} it={it} draggable onOpen={() => openModal({ type: 'itemDetail', itemId: it.id })} />} />
              ))}
            </div>}
      </div>
    </div>
  );
}

// planned-vs-capacity chip; turns red + "over" when planned points exceed sprint capacity
function PtsBudget({ planned, capacity, style }) {
  const over = planned > capacity;
  return (
    <span className="wf-pts" title={over ? `Over capacity by ${planned - capacity} pts` : `${Math.max(0, capacity - planned)} pts of capacity remaining`}
      style={{ flex: '0 0 auto', background: over ? WF.status.Blocked.soft : WF.fill, color: over ? WF.status.Blocked.text : WF.t2, ...style }}>
      {planned}/{capacity} pts{over ? ' \u00b7 over' : ''}
    </span>
  );
}

// shared clickable work-item card (opens detail/edit modal). When `draggable`,
// it can be picked up and dropped onto another sprint (see proto-dnd.jsx).
function WorkItemCard({ it, onOpen, draggable }) {
  const dragging = useDrag();
  const isMe = draggable && dragging && dragging.id === it.id;
  return (
    <div className="wf-card pt-link" onClick={onOpen}
      draggable={draggable || undefined}
      onDragStart={draggable ? (e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', it.id); Drag.start(it); } : undefined}
      onDragEnd={draggable ? () => Drag.end() : undefined}
      style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 9, cursor: draggable ? 'grab' : 'pointer', opacity: isMe ? 0.4 : 1, transition: 'border-color .12s, box-shadow .12s, opacity .12s' }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = WF.lineStrong; e.currentTarget.style.boxShadow = '0 2px 0 ' + WF.line; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = WF.line; e.currentTarget.style.boxShadow = 'none'; }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="wf-mono" style={{ fontSize: 11, color: WF.t3 }}>{it.key}</span>
        <span className="wf-pts">{it.points} pts</span>
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: 34 }}>{it.subject}</div>
      <StatusSelect value={it.status} onChange={(v) => Store.updateItem(it.id, { status: v })} />
    </div>
  );
}

// inline status chip that doubles as a select
function StatusSelect({ value, onChange }) {
  const c = WF.status[value];
  return (
    <div style={{ position: 'relative', alignSelf: 'flex-start' }} onClick={(e) => e.stopPropagation()}>
      <span className="wf-chip" style={{ background: c.soft, color: c.text, paddingRight: 22 }}>
        <span className="wf-dot" style={{ background: c.dot }} />{value}
        <span style={{ position: 'absolute', right: 7, color: c.text, display: 'flex' }}>{Icon.chevDown}</span>
      </span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%' }}>
        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
    </div>
  );
}

// ════════════════════════════ Sprint View (columns by work stream) ════════════════════════════
function SprintScreen({ releaseId, sprintN, nav, openModal, onSync, notify }) {
  useStore();
  const r = Store.release(releaseId);
  if (!r) return <NotFound label="Release not found." nav={nav} />;
  const sp = r.sprints.find((s) => s.n === sprintN);
  if (!sp) return <NotFound label="Sprint not found." nav={nav} />;
  const team = Store.team(r.teamId);
  const allItems = Store.itemsFor(r.id);
  const items = allItems.filter((i) => i.sprintN === sp.n);
  const off = sp.daysOff; const pct = Math.round(capPct(team, off) * 100); const vel = sprintVel(team, off);
  const isAct = activeSprint(r) && activeSprint(r).n === sp.n;
  const evts = eventsIn(r, sp);
  const totalPts = items.reduce((a, i) => a + i.points, 0);
  // columns = work streams that have items in this sprint
  const cols = r.workStreams.map((ws) => ({ ws, items: items.filter((i) => i.workStreamId === ws.id) })).filter((c) => c.items.length > 0);

  return (
    <div className="wf wf-screen pt-root">
      <TopBar
        left={<IconButton icon={Icon.chevLeft} title="Back" onClick={() => nav({ screen: 'release', releaseId })} />}
        title={<><div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: WF.t3, marginBottom: 3, whiteSpace: 'nowrap' }}>
            <span className="pt-link" onClick={() => nav({ screen: 'release', releaseId })} style={{ cursor: 'pointer' }}>{r.name}</span>{Icon.chevRight}<span style={{ fontWeight: 600, color: WF.t2 }}>Sprint</span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ fontSize: 19, fontWeight: 750, letterSpacing: '-0.02em', lineHeight: 1, whiteSpace: 'nowrap' }}>{sp.name}</span>
            {isAct && <span className="wf-now">Active</span>}
          </div></>}
        sub={<><span>{fmtShort(sp.startISO)} – {fmtShort(sp.endISO)}</span><span style={{ opacity: .5 }}>·</span>
          <span>{vel} pts capacity{pct < 100 ? ` (${pct}%)` : ''}</span><span style={{ opacity: .5 }}>·</span>
          <span>{off} person-day{off === 1 ? '' : 's'} off</span><span style={{ opacity: .5 }}>·</span>
          <span style={totalPts > vel ? { color: WF.status.Blocked.text, fontWeight: 700 } : null}>{items.length} items · {totalPts} pts planned{totalPts > vel ? ` · over by ${totalPts - vel}` : ''}</span></>}
        right={<><PButton variant="subtle" sm icon={Icon.cal} onClick={() => openModal({ type: 'sprint', releaseId, sprintN: sp.n })}>Edit sprint</PButton>
          <SyncButton onSync={onSync} />
          <PButton sm icon={Icon.plus} onClick={() => openModal({ type: 'item', releaseId, presetSprintN: sp.n })}>New work item</PButton></>} />

      {evts.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 24px', borderBottom: `1.5px solid ${WF.line}`, background: WF.paper, flexWrap: 'wrap' }}>
          <span className="wf-tag">Events</span>{evts.map((e) => <EventBadge key={e.id} date={fmtShort(e.dateISO)}>{e.label}</EventBadge>)}
        </div>)}

      <SprintRail release={r} currentN={sp.n} team={team} allItems={allItems} notify={notify}
        onGo={(n) => nav({ screen: 'sprint', releaseId, sprintN: n })} />

      <div style={{ flex: 1, overflow: 'auto', padding: '18px 24px' }}>
        {cols.length === 0
          ? <div className="wf-card wf-dash" style={{ padding: 40, textAlign: 'center', color: WF.t3, fontSize: 14 }}>No work items in this sprint yet.</div>
          : <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              {cols.map((col) => (
                <div key={col.ws.id} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div className="pt-link" onClick={() => nav({ screen: 'workstream', releaseId, wsId: col.ws.id })}
                    style={{ display: 'flex', alignItems: 'center', padding: '0 2px', cursor: 'pointer', gap: 8 }}>
                    <span style={{ fontWeight: 750, fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{col.ws.name}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto', flex: '0 0 auto', color: WF.t3 }}>
                      <span className="wf-mono" style={{ fontSize: 11.5, fontWeight: 700 }}>{col.items.reduce((a, i) => a + i.points, 0)} pts</span>{Icon.chevRight}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                    {col.items.map((it) => <WorkItemCard key={it.id} it={it} draggable onOpen={() => openModal({ type: 'itemDetail', itemId: it.id })} />)}
                  </div>
                </div>
              ))}
            </div>}
      </div>
    </div>
  );
}

// ════════════════════════════ App root ════════════════════════════
function App() {
  const [route, setRoute] = React.useState(() => {
    try { const r = JSON.parse(localStorage.getItem('release-tracker:route')); if (r && r.screen) return r; } catch (e) {}
    return { screen: 'home' };
  });
  const [modal, setModal] = React.useState(null);
  const [toast, setToast] = React.useState(null);
  const nav = (r) => { setRoute(r); try { localStorage.setItem('release-tracker:route', JSON.stringify(r)); } catch (e) {} };
  const openModal = (m) => setModal(m);
  const closeModal = () => setModal(null);
  const toastTimer = React.useRef(null);
  const notify = (msg) => { setToast(msg); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(null), 2400); };
  const onSync = () => { Store.sync(); notify('Changes synced to backend'); };

  let screen;
  if (route.screen === 'teams') screen = <TeamsScreen nav={nav} openModal={openModal} />;
  else if (route.screen === 'release') screen = <ReleaseScreen releaseId={route.releaseId} nav={nav} openModal={openModal} onSync={onSync} />;
  else if (route.screen === 'sprint') screen = <SprintScreen releaseId={route.releaseId} sprintN={route.sprintN} nav={nav} openModal={openModal} onSync={onSync} notify={notify} />;
  else if (route.screen === 'workstream') screen = <WorkStreamScreen releaseId={route.releaseId} wsId={route.wsId} nav={nav} openModal={openModal} onSync={onSync} notify={notify} />;
  else screen = <HomeScreen nav={nav} openModal={openModal} />;

  return (
    <>
      {screen}
      {modal && modal.type === 'team' && <TeamModal teamId={modal.teamId} onClose={closeModal} />}
      {modal && modal.type === 'stream' && <WorkStreamModal releaseId={modal.releaseId} onClose={closeModal} />}
      {modal && modal.type === 'event' && <EventModal releaseId={modal.releaseId} onClose={closeModal} />}
      {modal && modal.type === 'sprint' && <SprintModal releaseId={modal.releaseId} sprintN={modal.sprintN} onClose={closeModal} />}
      {modal && modal.type === 'item' && <WorkItemModal releaseId={modal.releaseId} presetStreamId={modal.presetStreamId} presetSprintN={modal.presetSprintN} onClose={closeModal} />}
      {modal && modal.type === 'itemDetail' && <WorkItemDetailModal itemId={modal.itemId} onClose={closeModal} />}
      {toast && <Toast>{toast}</Toast>}
    </>
  );
}

(function mount() {
  // wait until cross-file globals (kit + store + modals) have loaded
  if (!window.Store || !window.WF || !window.Icon || !window.TeamModal || !window.SegBar || !window.WorkItemDetailModal || !window.CapacityMeter) {
    return setTimeout(mount, 50);
  }
  ReactDOM.createRoot(document.getElementById('root')).render(<App />);
})();
