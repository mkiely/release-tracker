// Part of the app's modal set. Reads what it needs from the store and commits
// through getActions(), so callers supply only ids and an onClose.

import { useState } from 'react';
import { fmtShort, workdaysInRange } from '../lib/dates';
import { capPct, fullCap, sprintVel } from '../lib/derive';
import { getActions, selRelease, selTeam, useStore } from '../store/store';
import { Icon } from '../components/Icon';
import { Modal, PButton, PField, PInput } from '../components/primitives';
import { CalcCard } from '../components/ui/Callout';
import { Row } from './parts';

export function SprintModal({ releaseId, sprintId, onClose }: { releaseId: string; sprintId: string; onClose: () => void }) {
  const r = useStore((s) => selRelease(s, releaseId))!;
  const team = useStore((s) => selTeam(s, r.teamId));
  const sp = r.sprints.find((s) => s.id === sprintId)!;
  const isConnector = !!r.connector;
  const [name, setName] = useState(sp.name);
  const [daysOff, setDaysOff] = useState(String(sp.daysOff));
  const off = Math.max(0, Number(daysOff) || 0);
  const workdays = workdaysInRange(sp.startISO, sp.endISO);
  const full = fullCap(team, sp);
  const pct = Math.round(capPct(team, sp, off) * 100);
  const vel = sprintVel(team, sp, off);
  // Capacity counts only contributing members — must match fullCap()'s filter so
  // the displayed "members × workdays = full" equation is internally consistent.
  const memberCount = team ? team.members.filter((m) => !m.nonContributing).length : 0;
  const save = () => {
    getActions().updateSprint(releaseId, sprintId, { name: name.trim() || sp.name, daysOff: off });
    onClose();
  };
  return (
    <Modal
      title={isConnector ? `${sp.name} · Days off` : `Edit ${sp.name}`}
      icon={isConnector ? Icon.cal : Icon.sprint}
      onClose={onClose}
      width={500}
      footer={
        <>
          <PButton variant="subtle" onClick={onClose}>
            Cancel
          </PButton>
          <PButton onClick={save}>{isConnector ? 'Save' : 'Save sprint'}</PButton>
        </>
      }
    >
      {isConnector && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', marginBottom: 4, fontSize: 'var(--rt-fs-xs)', color: 'var(--rt-t3)', background: 'var(--rt-fill)', border: `1.5px solid ${'var(--rt-line)'}`, borderRadius: 7 }}>
          {Icon.sync}
          <span>Sprint details are managed by the connector. <strong style={{ color: 'var(--rt-t2)', fontWeight: 'var(--rt-fw-semibold)' }}>Days off</strong> is stored locally.</span>
        </div>
      )}
      {!isConnector && (
        <PField label="Sprint name">
          <PInput autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </PField>
      )}
      <div style={{ display: 'flex', gap: 12 }}>
        <PField label="Days off (person-days)" style={{ flex: 1 }}>
          <PInput autoFocus={isConnector} type="number" min="0" value={daysOff} onChange={(e) => setDaysOff(e.target.value)} />
        </PField>
        <PField label="Sprint dates" style={{ flex: 1 }}>
          <span style={{
            display: 'flex', alignItems: 'center',
            width: '100%', border: '1.5px solid var(--rt-line-strong)',
            background: 'var(--rt-paper)', borderRadius: 9,
            padding: '11px 13px', fontSize: 'var(--rt-fs-md)', fontFamily: 'inherit',
            color: 'var(--rt-t2)', minHeight: 46,
          }}>
            {fmtShort(sp.startISO)} – {fmtShort(sp.endISO)}
          </span>
        </PField>
      </div>
      <span style={{ fontSize: 'var(--rt-fs-xs)', color: 'var(--rt-t3)', marginTop: -4 }}>
        One holiday for a team of {memberCount} = {memberCount} days off.
      </span>
      <CalcCard label="Expected velocity">
        <Row k="Team velocity" v={`${team ? team.velocity : 0} pts`} />
        <Row k="Full capacity" v={`${memberCount} × ${workdays} = ${full} person-days`} />
        <Row k="Days off" v={`− ${off}`} />
        <Row k="% of capacity" v={`${full - off} / ${full} = ${pct}%`} />
        <hr className="divider" style={{ margin: '3px 0' }} />
        <Row k="Sprint velocity" v={`${team ? team.velocity : 0} × ${pct}% = ${vel} pts`} big />
      </CalcCard>
    </Modal>
  );
}
