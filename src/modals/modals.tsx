// Interactive modals wired to the store — ported from proto-modals.jsx.

import { useState, type ReactNode } from 'react';
import { STATUSES, type Member, type Status } from '../types';
import { between, fmtShort, workdaysInRange } from '../lib/dates';
import { capPct, fullCap, sprintVel } from '../lib/derive';
import { getActions, selItem, selRelease, selTeam, useStore } from '../store/store';
import { Icon } from '../components/Icon';
import { IconButton, Modal, PButton, PField, PInput, PointSeg, PSelect, PTextarea } from '../components/primitives';
import { WF } from '../components/tokens';

// ── Team create / edit modal ───────────────────────────────────────────
export function TeamModal({ teamId, onClose }: { teamId?: string; onClose: () => void }) {
  const editing = !!teamId;
  const existing = useStore((s) => (teamId ? selTeam(s, teamId) : undefined));

  // Track members as objects to preserve id + externalId on edit.
  type LocalMember = { id: string; name: string; externalId: string | null };
  const [name, setName] = useState(existing ? existing.name : '');
  const [velocity, setVelocity] = useState(existing ? String(existing.velocity) : '');
  const [members, setMembers] = useState<LocalMember[]>(
    existing && existing.members.length
      ? existing.members.map((m) => ({ id: m.id, name: m.name, externalId: m.externalId }))
      : [{ id: `m_${Math.random().toString(36).slice(2)}`, name: '', externalId: null }],
  );

  const setMemberName = (i: number, v: string) =>
    setMembers((ms) => ms.map((m, j) => (j === i ? { ...m, name: v } : m)));
  const addMember = () =>
    setMembers((ms) => [...ms, { id: `m_${Math.random().toString(36).slice(2)}`, name: '', externalId: null }]);
  const rmMember = (i: number) => setMembers((ms) => ms.filter((_, j) => j !== i));

  const canSave = name.trim().length > 0;
  const save = () => {
    const filteredMembers: Member[] = members
      .filter((m) => m.name.trim())
      .map((m) => ({ id: m.id, name: m.name.trim(), externalId: m.externalId }));
    if (editing && teamId) {
      getActions().updateTeam(teamId, {
        name: name.trim(),
        velocity: Number(velocity) || 0,
        members: filteredMembers,
      });
    } else {
      getActions().createTeam({ name, velocity, members: filteredMembers.map((m) => m.name) });
    }
    onClose();
  };

  const named = members.filter((m) => m.name.trim()).length;
  return (
    <Modal
      title={editing ? 'Edit team' : 'Create team'}
      icon={Icon.users}
      onClose={onClose}
      width={470}
      footer={
        <>
          <PButton variant="subtle" onClick={onClose}>
            Cancel
          </PButton>
          <PButton onClick={save} disabled={!canSave}>
            {editing ? 'Save team' : 'Create team'}
          </PButton>
        </>
      }
    >
      <PField label="Team name">
        <PInput autoFocus value={name} placeholder="e.g. Platform Core" onChange={(e) => setName(e.target.value)} />
      </PField>
      <PField label="Velocity (points / sprint)" hint="points the team finishes at full capacity">
        <PInput type="number" min="0" value={velocity} placeholder="e.g. 40" onChange={(e) => setVelocity(e.target.value)} />
      </PField>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span className="wf-flabel">Members</span>
          <span style={{ fontSize: 12, color: WF.t3 }}>{named}</span>
        </div>
        {members.map((m, i) => {
          const isSynced = !!m.externalId;
          return (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span className="wf-avatar">
                {m.name.trim() ? m.name.trim().split(' ').map((p) => p[0]).slice(0, 2).join('') : i + 1}
              </span>
              <PInput
                value={m.name}
                placeholder="Member name"
                disabled={isSynced}
                onChange={(e) => setMemberName(i, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addMember();
                  }
                }}
                style={{ flex: 1 }}
              />
              {isSynced ? (
                <span className="wf-tag" style={{ flex: '0 0 auto', fontSize: 10.5, color: WF.t3 }}>
                  synced
                </span>
              ) : (
                <IconButton
                  icon={Icon.trash}
                  title="Remove"
                  onClick={() => rmMember(i)}
                  style={{ border: 'none', color: WF.t3, visibility: members.length > 1 ? 'visible' : 'hidden' }}
                />
              )}
            </div>
          );
        })}
        <button className="pt-btn subtle sm" onClick={addMember} style={{ alignSelf: 'flex-start' }}>
          {Icon.plus} Add member
        </button>
      </div>
    </Modal>
  );
}

// ── Work Stream create modal ───────────────────────────────────────────
export function WorkStreamModal({ releaseId, onClose }: { releaseId: string; onClose: () => void }) {
  const [name, setName] = useState('');
  const save = () => {
    if (name.trim()) getActions().createWorkStream(releaseId, name.trim());
    onClose();
  };
  return (
    <Modal
      title="New work stream"
      onClose={onClose}
      width={440}
      footer={
        <>
          <PButton variant="subtle" onClick={onClose}>
            Cancel
          </PButton>
          <PButton onClick={save} disabled={!name.trim()}>
            Create
          </PButton>
        </>
      }
    >
      <PField label="Name">
        <PInput
          autoFocus
          value={name}
          placeholder="e.g. Checkout API"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
          }}
        />
      </PField>
      <span style={{ fontSize: 12.5, color: WF.t3 }}>
        A work stream groups related work items across the release's sprints.
      </span>
    </Modal>
  );
}

// ── Event create modal ──────────────────────────────────────────────────
export function EventModal({ releaseId, onClose }: { releaseId: string; onClose: () => void }) {
  const r = useStore((s) => selRelease(s, releaseId))!;
  const [label, setLabel] = useState('');
  const [date, setDate] = useState('');
  const sp = date ? r.sprints.find((s) => between(date, s.startISO, s.endISO)) : null;
  const save = () => {
    if (label.trim() && date) getActions().createEvent(releaseId, { label: label.trim(), dateISO: date });
    onClose();
  };
  return (
    <Modal
      title="New event"
      icon={Icon.cal}
      onClose={onClose}
      width={460}
      footer={
        <>
          <PButton variant="subtle" onClick={onClose}>
            Cancel
          </PButton>
          <PButton onClick={save} disabled={!label.trim() || !date}>
            Add event
          </PButton>
        </>
      }
    >
      <PField label="Label">
        <PInput autoFocus value={label} placeholder="e.g. Code freeze" onChange={(e) => setLabel(e.target.value)} />
      </PField>
      <PField label="Date">
        <PInput
          type="date"
          value={date}
          min={r.sprints[0].startISO}
          max={r.sprints[r.sprints.length - 1].endISO}
          onChange={(e) => setDate(e.target.value)}
        />
      </PField>
      <div className="wf-card" style={{ background: WF.bg, padding: '13px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 9, height: 9, borderRadius: 2, background: sp ? WF.status.Active.dot : WF.lineStrong, flex: '0 0 auto' }} />
        <span style={{ fontSize: 13, color: WF.t2, lineHeight: 1.45 }}>
          {!date ? (
            'Pick a date within the release to place this event on a sprint.'
          ) : sp ? (
            <>
              Falls inside <strong style={{ color: WF.ink }}>{sp.name}</strong> ({fmtShort(sp.startISO)} – {fmtShort(sp.endISO)}) — it'll
              show on that sprint row.
            </>
          ) : (
            'That date is outside the release range.'
          )}
        </span>
      </div>
    </Modal>
  );
}

// ── Sprint edit modal (name + days off → capacity) ─────────────────────
function Row({ k, v, big }: { k: ReactNode; v: ReactNode; big?: boolean }) {
  return (
    <div className="wf-calc" style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, fontSize: big ? 15 : 13 }}>
      <span style={{ color: big ? WF.ink : WF.t2, fontWeight: big ? 700 : 400, whiteSpace: 'nowrap' }}>{k}</span>
      <span className="wf-mono" style={{ fontWeight: 600, color: big ? WF.status.Active.text : WF.ink, whiteSpace: 'nowrap', fontSize: big ? 15 : 13 }}>
        {v}
      </span>
    </div>
  );
}

export function SprintModal({ releaseId, sprintId, onClose }: { releaseId: string; sprintId: string; onClose: () => void }) {
  const r = useStore((s) => selRelease(s, releaseId))!;
  const team = useStore((s) => selTeam(s, r.teamId));
  const sp = r.sprints.find((s) => s.id === sprintId)!;
  const [name, setName] = useState(sp.name);
  const [daysOff, setDaysOff] = useState(String(sp.daysOff));
  const off = Math.max(0, Number(daysOff) || 0);
  const workdays = workdaysInRange(sp.startISO, sp.endISO);
  const full = fullCap(team, sp);
  const pct = Math.round(capPct(team, sp, off) * 100);
  const vel = sprintVel(team, sp, off);
  const memberCount = team ? team.members.length : 0;
  const save = () => {
    getActions().updateSprint(releaseId, sprintId, { name: name.trim() || sp.name, daysOff: off });
    onClose();
  };
  return (
    <Modal
      title={`Edit ${sp.name}`}
      icon={Icon.cal}
      onClose={onClose}
      width={500}
      footer={
        <>
          <PButton variant="subtle" onClick={onClose}>
            Cancel
          </PButton>
          <PButton onClick={save}>Save sprint</PButton>
        </>
      }
    >
      <PField label="Sprint name">
        <PInput autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      </PField>
      <div style={{ display: 'flex', gap: 12 }}>
        <PField label="Days off (person-days)" style={{ flex: 1 }}>
          <PInput type="number" min="0" value={daysOff} onChange={(e) => setDaysOff(e.target.value)} />
        </PField>
        <PField label="Sprint dates" style={{ flex: 1 }}>
          <span className="pt-in" style={{ display: 'flex', alignItems: 'center', color: WF.t2 }}>
            {fmtShort(sp.startISO)} – {fmtShort(sp.endISO)}
          </span>
        </PField>
      </div>
      <span style={{ fontSize: 11.5, color: WF.t3, marginTop: -4 }}>
        One holiday for a team of {memberCount} = {memberCount} days off.
      </span>
      <div className="wf-card" style={{ background: WF.bg, padding: '15px 16px', display: 'flex', flexDirection: 'column', gap: 9 }}>
        <span className="wf-tag" style={{ marginBottom: 2 }}>
          Expected velocity
        </span>
        <Row k="Team velocity" v={`${team ? team.velocity : 0} pts`} />
        <Row k="Full capacity" v={`${memberCount} × ${workdays} = ${full} person-days`} />
        <Row k="Days off" v={`− ${off}`} />
        <Row k="% of capacity" v={`${full - off} / ${full} = ${pct}%`} />
        <hr className="wf-divider" style={{ margin: '3px 0' }} />
        <Row k="Sprint velocity" v={`${team ? team.velocity : 0} × ${pct}% = ${vel} pts`} big />
      </div>
    </Modal>
  );
}

// ── Work Item create modal ──────────────────────────────────────────────
export function WorkItemModal({
  releaseId,
  presetStreamId,
  presetSprintId,
  onClose,
}: {
  releaseId: string;
  presetStreamId?: string;
  presetSprintId?: string;
  onClose: () => void;
}) {
  const r = useStore((s) => selRelease(s, releaseId))!;
  const team = useStore((s) => selTeam(s, r.teamId));
  const defaultSprintId = (() => {
    const a = r.sprints.find((s) => between(new Date().toISOString().slice(0, 10), s.startISO, s.endISO));
    return a ? a.id : (r.sprints[0]?.id ?? null); // active sprint, else first, else backlog
  })();
  const [subject, setSubject] = useState('');
  const [desc, setDesc] = useState('');
  const [wsId, setWsId] = useState(presetStreamId || (r.workStreams[0] && r.workStreams[0].id) || '');
  const [sprintId, setSprintId] = useState<string | null>(presetSprintId ?? defaultSprintId);
  const [status, setStatus] = useState<Status>('Not Started');
  const [points, setPoints] = useState(3);
  const [assignedMemberId, setAssignedMemberId] = useState<string | null>(null);
  const canSave = !!subject.trim() && !!wsId;
  const save = () => {
    getActions().createItem(releaseId, { workStreamId: wsId, sprintId, subject: subject.trim(), description: desc, status, points, assignedMemberId });
    onClose();
  };
  return (
    <Modal
      title="New work item"
      onClose={onClose}
      width={520}
      footer={
        <>
          <PButton variant="subtle" onClick={onClose}>
            Cancel
          </PButton>
          <PButton onClick={save} disabled={!canSave}>
            Create work item
          </PButton>
        </>
      }
    >
      <PField label="Subject">
        <PInput autoFocus value={subject} placeholder="Short summary of the work" onChange={(e) => setSubject(e.target.value)} />
      </PField>
      <PField label="Description">
        <PTextarea value={desc} placeholder="Add detail, acceptance criteria, links…" onChange={(e) => setDesc(e.target.value)} />
      </PField>
      <div style={{ display: 'flex', gap: 12 }}>
        <PField label="Work stream" style={{ flex: 1 }}>
          <PSelect value={wsId} onChange={(e) => setWsId(e.target.value)}>
            {r.workStreams.length === 0 && <option value="">No streams yet</option>}
            {r.workStreams.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </PSelect>
        </PField>
        <PField label="Sprint" style={{ flex: 1 }}>
          <PSelect value={sprintId ?? ''} onChange={(e) => setSprintId(e.target.value || null)}>
            <option value="">Backlog</option>
            {r.sprints.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </PSelect>
        </PField>
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        <PField label="Assignee" style={{ flex: 1 }}>
          <PSelect value={assignedMemberId ?? ''} onChange={(e) => setAssignedMemberId(e.target.value || null)}>
            <option value="">Unassigned</option>
            {(team?.members ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </PSelect>
        </PField>
        <PField label="Status" style={{ flex: 1 }}>
          <PSelect value={status} onChange={(e) => setStatus(e.target.value as Status)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </PSelect>
        </PField>
      </div>
      <PField label="Points" hint="approximate effort">
        <PointSeg value={points} onChange={setPoints} />
      </PField>
    </Modal>
  );
}

// ── Work Item detail / edit modal ───────────────────────────────────────
export function WorkItemDetailModal({ itemId, onClose }: { itemId: string; onClose: () => void }) {
  const it = useStore((s) => selItem(s, itemId));
  const r = useStore((s) => (it ? selRelease(s, it.releaseId) : undefined));
  const team = useStore((s) => (r ? selTeam(s, r.teamId) : undefined));

  const [subject, setSubject] = useState(it ? it.subject : '');
  const [desc, setDesc] = useState(it ? it.description : '');
  const [wsId, setWsId] = useState(it ? it.workStreamId : '');
  const [sprintId, setSprintId] = useState<string | null>(it?.sprintId ?? null);
  const [status, setStatus] = useState<Status>(it ? it.status : 'Not Started');
  const [points, setPoints] = useState(it ? it.points : 3);
  const [assignedMemberId, setAssignedMemberId] = useState<string | null>(it?.assignedMemberId ?? null);

  if (!it || !r) {
    return (
      <Modal title="Work item" onClose={onClose} width={520}>
        <span style={{ color: WF.t3 }}>This item no longer exists.</span>
      </Modal>
    );
  }

  const synced = !!it.externalId;
  // Writeable fields for synced items: points and sprint are unlocked.
  // All other synced fields stay read-only (external wins on next sync).
  const readOnlyCore = synced; // subject, description, status, work stream, assignee
  const isDirty = it.dirtyFields.length > 0;

  const save = () => {
    let nextDirty = [...it.dirtyFields];
    if (synced) {
      // Accumulate dirty flags only for writeable fields that changed.
      if (points !== it.points && !nextDirty.includes('points')) nextDirty.push('points');
      if (sprintId !== it.sprintId && !nextDirty.includes('sprint')) nextDirty.push('sprint');
    }
    getActions().updateItem(itemId, {
      subject: subject.trim() || it.subject,
      description: desc,
      workStreamId: wsId,
      sprintId,
      status,
      points,
      assignedMemberId,
      dirtyFields: nextDirty,
    });
    onClose();
  };

  return (
    <Modal
      onClose={onClose}
      width={520}
      title={
        <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span className="wf-mono" style={{ fontSize: 12.5, color: WF.t3, background: WF.fill, padding: '3px 7px', borderRadius: 5 }}>
            {it.key}
          </span>
          <span style={{ fontSize: 17, fontWeight: 750 }}>Work item</span>
          {isDirty && (
            <span
              title="Modified — pending push"
              style={{ width: 7, height: 7, borderRadius: '50%', background: WF.status.Active.dot, flexShrink: 0, marginLeft: 2 }}
            />
          )}
        </span>
      }
      footer={
        <>
          <PButton variant="subtle" onClick={onClose}>
            Close
          </PButton>
          <PButton onClick={save}>Save changes</PButton>
        </>
      }
    >
      {synced && (
        <div
          className="wf-card"
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', marginBottom: 14, fontSize: 12.5, color: WF.t2, background: WF.fill }}
        >
          {Icon.sync}
          <span>Synced from an external system — most fields refresh on sync. Points and sprint are writeable and will push on your next Push.</span>
        </div>
      )}
      <PField label="Subject">
        <PInput value={subject} disabled={readOnlyCore} onChange={(e) => setSubject(e.target.value)} />
      </PField>
      <PField label="Description">
        <PTextarea
          value={desc}
          disabled={readOnlyCore}
          placeholder="No description yet — add detail, acceptance criteria, links…"
          onChange={(e) => setDesc(e.target.value)}
        />
      </PField>
      <div style={{ display: 'flex', gap: 12 }}>
        <PField label="Work stream" style={{ flex: 1 }}>
          <PSelect value={wsId} disabled={readOnlyCore} onChange={(e) => setWsId(e.target.value)}>
            {r.workStreams.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </PSelect>
        </PField>
        <PField label="Sprint" style={{ flex: 1 }}>
          {/* Sprint is writeable even for synced items */}
          <PSelect value={sprintId ?? ''} onChange={(e) => setSprintId(e.target.value || null)}>
            <option value="">Backlog</option>
            {r.sprints.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </PSelect>
        </PField>
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        <PField label="Assignee" style={{ flex: 1 }}>
          <PSelect value={assignedMemberId ?? ''} disabled={readOnlyCore} onChange={(e) => setAssignedMemberId(e.target.value || null)}>
            <option value="">Unassigned</option>
            {(team?.members ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </PSelect>
        </PField>
        <PField label="Status" style={{ flex: 1 }}>
          <PSelect value={status} disabled={readOnlyCore} onChange={(e) => setStatus(e.target.value as Status)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </PSelect>
        </PField>
      </div>
      <PField label="Points">
        {/* Points is writeable even for synced items */}
        <PointSeg value={points} onChange={setPoints} />
      </PField>
    </Modal>
  );
}
