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
import modalStyles from './modals.module.css';
import styles from './SprintModal.module.css';

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
        <div className={styles.connectorNote}>
          {Icon.sync}
          <span>Sprint details are managed by the connector. <strong className={modalStyles.em}>Days off</strong> is stored locally.</span>
        </div>
      )}
      {!isConnector && (
        <PField label="Sprint name">
          <PInput autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </PField>
      )}
      <div className={`${modalStyles.row} ${modalStyles.rowWide}`}>
        <PField label="Days off (person-days)" className={modalStyles.grow}>
          <PInput autoFocus={isConnector} type="number" min="0" value={daysOff} onChange={(e) => setDaysOff(e.target.value)} />
        </PField>
        <PField label="Sprint dates" className={modalStyles.grow}>
          <span className={styles.readonlyField}>
            {fmtShort(sp.startISO)} – {fmtShort(sp.endISO)}
          </span>
        </PField>
      </div>
      <span className={styles.fieldFootnote}>
        One holiday for a team of {memberCount} = {memberCount} days off.
      </span>
      <CalcCard label="Expected velocity">
        <Row k="Team velocity" v={`${team ? team.velocity : 0} pts`} />
        <Row k="Full capacity" v={`${memberCount} × ${workdays} = ${full} person-days`} />
        <Row k="Days off" v={`− ${off}`} />
        <Row k="% of capacity" v={`${full - off} / ${full} = ${pct}%`} />
        <hr className={`divider ${modalStyles.rule}`} />
        <Row k="Sprint velocity" v={`${team ? team.velocity : 0} × ${pct}% = ${vel} pts`} big />
      </CalcCard>
    </Modal>
  );
}
