// proto-modals.jsx — interactive modals wired to the Store

// ── Team create / edit modal (direction A: stacked member rows) ────────
function TeamModal({ teamId, onClose }) {
  const editing = !!teamId;
  const existing = editing ? Store.team(teamId) : null;
  const [name, setName] = React.useState(existing ? existing.name : '');
  const [velocity, setVelocity] = React.useState(existing ? String(existing.velocity) : '');
  const [members, setMembers] = React.useState(existing && existing.members.length ? existing.members.map((m) => m.name) : ['']);
  const setMember = (i, v) => setMembers((m) => m.map((x, j) => (j === i ? v : x)));
  const addMember = () => setMembers((m) => [...m, '']);
  const rmMember = (i) => setMembers((m) => m.filter((_, j) => j !== i));
  const canSave = name.trim().length > 0;
  const save = () => {
    if (editing) Store.updateTeam(teamId, { name: name.trim(), velocity: Number(velocity) || 0, members: members.filter((m) => m.trim()).map((m) => ({ id: uid('m'), name: m.trim() })) });
    else Store.createTeam({ name, velocity, members });
    onClose();
  };
  const named = members.filter((m) => m.trim()).length;
  return (
    <Modal title={editing ? 'Edit team' : 'Create team'} icon={Icon.users} onClose={onClose} width={470}
      footer={<><PButton variant="subtle" onClick={onClose}>Cancel</PButton><PButton onClick={save} disabled={!canSave}>{editing ? 'Save team' : 'Create team'}</PButton></>}>
      <PField label="Team name"><PInput autoFocus value={name} placeholder="e.g. Platform Core" onChange={(e) => setName(e.target.value)} /></PField>
      <PField label="Velocity (points / sprint)" hint="points the team finishes at full capacity">
        <PInput type="number" min="0" value={velocity} placeholder="e.g. 40" onChange={(e) => setVelocity(e.target.value)} />
      </PField>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span className="wf-flabel">Members</span><span style={{ fontSize: 12, color: WF.t3 }}>{named}</span>
        </div>
        {members.map((m, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span className="wf-avatar">{m.trim() ? m.trim().split(' ').map((p) => p[0]).slice(0, 2).join('') : (i + 1)}</span>
            <PInput value={m} placeholder="Member name" onChange={(e) => setMember(i, e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addMember(); } }} style={{ flex: 1 }} />
            <IconButton icon={Icon.trash} title="Remove" onClick={() => rmMember(i)} style={{ border: 'none', color: WF.t3, visibility: members.length > 1 ? 'visible' : 'hidden' }} />
          </div>
        ))}
        <button className="pt-btn subtle sm" onClick={addMember} style={{ alignSelf: 'flex-start' }}>{Icon.plus} Add member</button>
      </div>
    </Modal>
  );
}

// ── Work Stream create modal ───────────────────────────────────────────
function WorkStreamModal({ releaseId, onClose }) {
  const [name, setName] = React.useState('');
  const save = () => { if (name.trim()) Store.createWorkStream(releaseId, name.trim()); onClose(); };
  return (
    <Modal title="New work stream" onClose={onClose} width={440}
      footer={<><PButton variant="subtle" onClick={onClose}>Cancel</PButton><PButton onClick={save} disabled={!name.trim()}>Create</PButton></>}>
      <PField label="Name"><PInput autoFocus value={name} placeholder="e.g. Checkout API" onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') save(); }} /></PField>
      <span style={{ fontSize: 12.5, color: WF.t3 }}>A work stream groups related work items across the release's sprints.</span>
    </Modal>
  );
}

// ── Event create modal ──────────────────────────────────────────────────
function EventModal({ releaseId, onClose }) {
  const r = Store.release(releaseId);
  const [label, setLabel] = React.useState('');
  const [date, setDate] = React.useState('');
  const sp = date ? r.sprints.find((s) => between(date, s.startISO, s.endISO)) : null;
  const save = () => { if (label.trim() && date) Store.createEvent(releaseId, { label: label.trim(), dateISO: date }); onClose(); };
  return (
    <Modal title="New event" icon={Icon.cal} onClose={onClose} width={460}
      footer={<><PButton variant="subtle" onClick={onClose}>Cancel</PButton><PButton onClick={save} disabled={!label.trim() || !date}>Add event</PButton></>}>
      <PField label="Label"><PInput autoFocus value={label} placeholder="e.g. Code freeze" onChange={(e) => setLabel(e.target.value)} /></PField>
      <PField label="Date"><PInput type="date" value={date} min={r.sprints[0].startISO} max={r.sprints[r.sprints.length - 1].endISO} onChange={(e) => setDate(e.target.value)} /></PField>
      <div className="wf-card" style={{ background: WF.bg, padding: '13px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 9, height: 9, borderRadius: 2, background: sp ? WF.status.Active.dot : WF.lineStrong, flex: '0 0 auto' }} />
        <span style={{ fontSize: 13, color: WF.t2, lineHeight: 1.45 }}>
          {!date ? 'Pick a date within the release to place this event on a sprint.'
            : sp ? <>Falls inside <strong style={{ color: WF.ink }}>{sp.name}</strong> ({fmtShort(sp.startISO)} – {fmtShort(sp.endISO)}) — it'll show on that sprint row.</>
            : 'That date is outside the release range.'}
        </span>
      </div>
    </Modal>
  );
}

// ── Sprint edit modal (name + days off → capacity) ─────────────────────
function SprintModal({ releaseId, sprintN, onClose }) {
  const r = Store.release(releaseId);
  const team = Store.team(r.teamId);
  const sp = r.sprints.find((s) => s.n === sprintN);
  const [name, setName] = React.useState(sp.name);
  const [daysOff, setDaysOff] = React.useState(String(sp.daysOff));
  const off = Math.max(0, Number(daysOff) || 0);
  const full = fullCap(team);
  const pct = Math.round(capPct(team, off) * 100);
  const vel = sprintVel(team, off);
  const save = () => { Store.updateSprint(releaseId, sprintN, { name: name.trim() || sp.name, daysOff: off }); onClose(); };
  return (
    <Modal title={`Edit ${sp.name}`} icon={Icon.cal} onClose={onClose} width={500}
      footer={<><PButton variant="subtle" onClick={onClose}>Cancel</PButton><PButton onClick={save}>Save sprint</PButton></>}>
      <PField label="Sprint name"><PInput autoFocus value={name} onChange={(e) => setName(e.target.value)} /></PField>
      <div style={{ display: 'flex', gap: 12 }}>
        <PField label="Days off (person-days)" style={{ flex: 1 }}><PInput type="number" min="0" value={daysOff} onChange={(e) => setDaysOff(e.target.value)} /></PField>
        <PField label="Sprint dates" style={{ flex: 1 }}><span className="pt-in" style={{ display: 'flex', alignItems: 'center', color: WF.t2 }}>{fmtShort(sp.startISO)} – {fmtShort(sp.endISO)}</span></PField>
      </div>
      <span style={{ fontSize: 11.5, color: WF.t3, marginTop: -4 }}>One holiday for a team of {team.members.length} = {team.members.length} days off.</span>
      <div className="wf-card" style={{ background: WF.bg, padding: '15px 16px', display: 'flex', flexDirection: 'column', gap: 9 }}>
        <span className="wf-tag" style={{ marginBottom: 2 }}>Expected velocity</span>
        <Row k="Team velocity" v={`${team.velocity} pts`} />
        <Row k="Full capacity" v={`${team.members.length} × ${WORKDAYS} = ${full} person-days`} />
        <Row k="Days off" v={`− ${off}`} />
        <Row k="% of capacity" v={`${full - off} / ${full} = ${pct}%`} />
        <hr className="wf-divider" style={{ margin: '3px 0' }} />
        <Row k="Sprint velocity" v={`${team.velocity} × ${pct}% = ${vel} pts`} big />
      </div>
    </Modal>
  );
}
const Row = ({ k, v, big }) => (
  <div className="wf-calc" style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, fontSize: big ? 15 : 13 }}>
    <span style={{ color: big ? WF.ink : WF.t2, fontWeight: big ? 700 : 400, whiteSpace: 'nowrap' }}>{k}</span>
    <span className="wf-mono" style={{ fontWeight: 600, color: big ? WF.status.Active.text : WF.ink, whiteSpace: 'nowrap', fontSize: big ? 15 : 13 }}>{v}</span>
  </div>
);

// ── Work Item create modal (incl. points) ──────────────────────────────
function WorkItemModal({ releaseId, presetStreamId, presetSprintN, onClose }) {
  const r = Store.release(releaseId);
  const [subject, setSubject] = React.useState('');
  const [desc, setDesc] = React.useState('');
  const [wsId, setWsId] = React.useState(presetStreamId || (r.workStreams[0] && r.workStreams[0].id) || '');
  const [sprintN, setSprintN] = React.useState(String(presetSprintN || (activeSprint(r) ? activeSprint(r).n : 1)));
  const [status, setStatus] = React.useState('Not Started');
  const [points, setPoints] = React.useState(3);
  const canSave = subject.trim() && wsId;
  const save = () => { Store.createItem(releaseId, { workStreamId: wsId, sprintN, subject: subject.trim(), description: desc, status, points }); onClose(); };
  return (
    <Modal title="New work item" icon={null} onClose={onClose} width={520}
      footer={<><PButton variant="subtle" onClick={onClose}>Cancel</PButton><PButton onClick={save} disabled={!canSave}>Create work item</PButton></>}>
      <PField label="Subject"><PInput autoFocus value={subject} placeholder="Short summary of the work" onChange={(e) => setSubject(e.target.value)} /></PField>
      <PField label="Description"><PTextarea value={desc} placeholder="Add detail, acceptance criteria, links…" onChange={(e) => setDesc(e.target.value)} /></PField>
      <div style={{ display: 'flex', gap: 12 }}>
        <PField label="Work stream" style={{ flex: 1 }}><PSelect value={wsId} onChange={(e) => setWsId(e.target.value)}>
          {r.workStreams.length === 0 && <option value="">No streams yet</option>}
          {r.workStreams.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </PSelect></PField>
        <PField label="Sprint" style={{ flex: 1 }}><PSelect value={sprintN} onChange={(e) => setSprintN(e.target.value)}>
          {r.sprints.map((s) => <option key={s.n} value={s.n}>{s.name}</option>)}
        </PSelect></PField>
      </div>
      <PField label="Status"><PSelect value={status} onChange={(e) => setStatus(e.target.value)}>
        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
      </PSelect></PField>
      <PField label="Points" hint="approximate effort"><PointSeg value={points} onChange={setPoints} /></PField>
    </Modal>
  );
}

// ── Work Item detail / edit modal (view + edit all fields after creation) ──
function WorkItemDetailModal({ itemId, onClose }) {
  const it = Store.get().items.find((i) => i.id === itemId);
  const r = it && Store.release(it.releaseId);
  const [subject, setSubject] = React.useState(it ? it.subject : '');
  const [desc, setDesc] = React.useState(it ? it.description : '');
  const [wsId, setWsId] = React.useState(it ? it.workStreamId : '');
  const [sprintN, setSprintN] = React.useState(it ? String(it.sprintN) : '1');
  const [status, setStatus] = React.useState(it ? it.status : 'Not Started');
  const [points, setPoints] = React.useState(it ? it.points : 3);
  if (!it || !r) return <Modal title="Work item" onClose={onClose} width={520}><span style={{ color: WF.t3 }}>This item no longer exists.</span></Modal>;
  const save = () => { Store.updateItem(itemId, { subject: subject.trim() || it.subject, description: desc, workStreamId: wsId, sprintN: Number(sprintN), status, points }); onClose(); };
  return (
    <Modal onClose={onClose} width={520}
      title={<span style={{ display: 'flex', alignItems: 'center', gap: 9 }}><span className="wf-mono" style={{ fontSize: 12.5, color: WF.t3, background: WF.fill, padding: '3px 7px', borderRadius: 5 }}>{it.key}</span><span style={{ fontSize: 17, fontWeight: 750 }}>Work item</span></span>}
      footer={<><PButton variant="subtle" onClick={onClose}>Close</PButton><PButton onClick={save}>Save changes</PButton></>}>
      <PField label="Subject"><PInput value={subject} onChange={(e) => setSubject(e.target.value)} /></PField>
      <PField label="Description"><PTextarea value={desc} placeholder="No description yet — add detail, acceptance criteria, links…" onChange={(e) => setDesc(e.target.value)} /></PField>
      <div style={{ display: 'flex', gap: 12 }}>
        <PField label="Work stream" style={{ flex: 1 }}><PSelect value={wsId} onChange={(e) => setWsId(e.target.value)}>
          {r.workStreams.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </PSelect></PField>
        <PField label="Sprint" style={{ flex: 1 }}><PSelect value={sprintN} onChange={(e) => setSprintN(e.target.value)}>
          {r.sprints.map((s) => <option key={s.n} value={s.n}>{s.name}</option>)}
        </PSelect></PField>
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        <PField label="Status" style={{ flex: 1 }}><PSelect value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </PSelect></PField>
        <PField label="Points" style={{ flex: 1.4 }}><PointSeg value={points} onChange={setPoints} /></PField>
      </div>
    </Modal>
  );
}

Object.assign(window, { TeamModal, WorkStreamModal, EventModal, SprintModal, WorkItemModal, WorkItemDetailModal });
