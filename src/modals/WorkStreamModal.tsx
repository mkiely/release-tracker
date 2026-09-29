// Part of the app's modal set. Reads what it needs from the store and commits
// through getActions(), so callers supply only ids and an onClose.

import { useState } from 'react';
import { type PlanningState } from '../types';
import { fmtShort } from '../lib/dates';
import { effectiveCodeFreeze } from '../lib/derive';
import { getActions, selRelease, useStore } from '../store/store';
import { Icon } from '../components/Icon';
import { Modal, PButton, PField, PInput } from '../components/primitives';
import { SegmentedToggle } from '../components/SegmentedToggle';

export function WorkStreamModal({ releaseId, wsId, onClose }: { releaseId: string; wsId?: string; onClose: () => void }) {
  const r = useStore((s) => selRelease(s, releaseId));
  const existing = wsId ? r?.workStreams.find((w) => w.id === wsId) : undefined;
  const editing = !!existing;
  // The connector owns the names of synced streams — keep the field read-only so a
  // local rename can't be silently overwritten on the next sync. engineersRequired is
  // app-owned and stays editable regardless.
  const nameLocked = !!existing?.externalId;
  const [name, setName] = useState(existing ? existing.name : '');
  const [engineers, setEngineers] = useState(
    existing && existing.engineersRequired != null ? String(existing.engineersRequired) : '',
  );
  const [planning, setPlanning] = useState<PlanningState>(existing ? existing.planningState : 'open');
  const [codeFreeze, setCodeFreeze] = useState(existing?.codeFreezeISO ?? '');
  const [muted, setMuted] = useState(existing ? existing.muted : false);
  const parseEngineers = (): number | null => {
    const n = Number(engineers);
    return engineers.trim() && Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
  };
  const save = () => {
    if (!name.trim()) return;
    const codeFreezeISO = codeFreeze || null;
    if (editing && wsId) {
      getActions().updateWorkStream(releaseId, wsId, { name: name.trim(), engineersRequired: parseEngineers(), planningState: planning, codeFreezeISO, muted });
    } else {
      const ws = getActions().createWorkStream(releaseId, name.trim());
      const er = parseEngineers();
      if (ws && (er != null || planning !== 'open' || codeFreezeISO || muted)) {
        getActions().updateWorkStream(releaseId, ws.id, { engineersRequired: er, planningState: planning, codeFreezeISO, muted });
      }
    }
    onClose();
  };
  return (
    <Modal
      title={editing ? 'Edit work stream' : 'New work stream'}
      icon={Icon.stream}
      onClose={onClose}
      width={520}
      footer={
        <>
          <PButton variant="subtle" onClick={onClose}>
            Cancel
          </PButton>
          <PButton onClick={save} disabled={!name.trim()}>
            {editing ? 'Save' : 'Create'}
          </PButton>
        </>
      }
    >
      <PField label="Name" hint={nameLocked ? 'managed by the connector' : undefined}>
        <PInput
          autoFocus={!nameLocked}
          value={name}
          disabled={nameLocked}
          placeholder="e.g. Checkout API"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
          }}
        />
      </PField>
      <PField label="Engineers required" hint="drives the capacity-fit health forecast">
        <PInput
          autoFocus={nameLocked}
          type="number"
          min="0"
          step="1"
          value={engineers}
          placeholder="e.g. 2"
          onChange={(e) => setEngineers(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
          }}
        />
      </PField>
      <PField label="Planning status">
        <SegmentedToggle
          value={planning}
          onChange={setPlanning}
          ariaLabel="Planning status"
          options={[
            { value: 'open', label: 'Open', title: 'Planning in progress — under-planned capacity is flagged and can raise the alarm' },
            { value: 'deferred', label: 'Deferred', title: 'Tickets intentionally not written yet (e.g. research pending) — mutes the alarm only' },
            { value: 'complete', label: 'Scope complete', title: 'All work is defined — reserved capacity beyond the scope reads as over-reservation' },
          ]}
        />
        <span style={{ display: 'block', marginTop: 6, fontSize: 'var(--rt-fs-sm)', color: 'var(--rt-t3)', lineHeight: 1.45 }}>
          {planning === 'open'
            ? 'Planning in progress. Reserved capacity with little created work flags as under-planned.'
            : planning === 'deferred'
              ? 'Alarm muted (tickets deferred, e.g. research pending). Still reads un-judgeable, never on-track.'
              : 'Scope is fully defined — the created work is the whole scope. Reserved engineers beyond it read as over-reserved and feed the rebalancing suggestion.'}
        </span>
      </PField>
      <PField
        label="Code freeze override"
        hint={r ? `leave blank to inherit ${fmtShort(effectiveCodeFreeze(r))} from the release` : 'leave blank to inherit the release date'}
      >
        <PInput
          type="date"
          value={codeFreeze}
          min={r?.sprints.length ? r.sprints[0].startISO : undefined}
          onChange={(e) => setCodeFreeze(e.target.value)}
        />
      </PField>
      <PField label="Counts toward this release">
        <SegmentedToggle
          value={muted ? 'muted' : 'counted'}
          onChange={(v) => setMuted(v === 'muted')}
          ariaLabel="Whether this stream counts toward the release"
          options={[
            { value: 'counted', label: 'Counted', title: 'Normal: this stream is the team’s work and appears in every export, summary and capacity figure' },
            { value: 'muted', label: 'Muted', title: 'Informational only: kept and browsable, but left out of exports, summaries and the release’s capacity maths' },
          ]}
        />
        <span style={{ display: 'block', marginTop: 6, fontSize: 'var(--rt-fs-sm)', color: 'var(--rt-t3)', lineHeight: 1.45 }}>
          {muted
            ? 'Muted. Still synced and browsable, but left out of TSV exports, summary reports, and the release’s capacity maths — its engineer reservation isn’t contended for and its points aren’t counted as scope.'
            : 'Counted normally. Mute a stream that exists for reporting rather than for work this team delivers — a vestigial epic, or a roll-up someone else owns.'}
        </span>
      </PField>
      <span style={{ fontSize: 'var(--rt-fs-sm)', color: 'var(--rt-t3)' }}>
        {nameLocked
          ? "This stream's name is managed by the connector. Engineers required is kept locally and survives sync."
          : "A work stream groups related work items across the release's sprints. Engineers required is kept locally and survives connector sync."}
      </span>
    </Modal>
  );
}
