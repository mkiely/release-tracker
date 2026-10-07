// Part of the app's modal set. Reads what it needs from the store and commits
// through getActions(), so callers supply only ids and an onClose.

import { useState } from 'react';
import { LOCAL_ITEM_TYPES, STATUSES, type Status } from '../types';
import { between } from '../lib/dates';
import { getActions, selRelease, selTeam, useStore } from '../store/store';
import { RichTextEditor } from '../components/RichTextEditor';
import { Icon } from '../components/Icon';
import { Modal, ModalSplit, PButton, PField, PInput, PointSeg, PSelect } from '../components/primitives';

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
  const [wsId, setWsId] = useState<string | null>(presetStreamId || (r.workStreams[0] && r.workStreams[0].id) || null);
  const [sprintId, setSprintId] = useState<string | null>(presetSprintId ?? defaultSprintId);
  const [status, setStatus] = useState<Status>('Not Started');
  const [points, setPoints] = useState<number | null>(null);
  const [assignedMemberId, setAssignedMemberId] = useState<string | null>(null);
  const [typeLabel, setTypeLabel] = useState<string>('');
  const canSave = !!subject.trim();
  const save = () => {
    const itemType = (!r.connector && typeLabel) ? { id: null, label: typeLabel } : null;
    getActions().createItem(releaseId, { workStreamId: wsId, sprintId, subject: subject.trim(), description: desc, status, points, assignedMemberId, itemType });
    onClose();
  };
  return (
    <Modal
      title="New work item"
      icon={Icon.item}
      onClose={onClose}
      width="var(--rt-modal-w-work-item)"
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
      <ModalSplit
        main={
          <>
            <PField label="Subject">
              <PInput autoFocus value={subject} placeholder="Short summary of the work" onChange={(e) => setSubject(e.target.value)} />
            </PField>
            <PField fill label="Description" hint="supports markdown pasted content">
              <RichTextEditor value={desc} onChange={setDesc} />
            </PField>
          </>
        }
        rail={
          <>
            <PField label="Work stream">
              <PSelect value={wsId ?? ''} onChange={(e) => setWsId(e.target.value || null)}>
                <option value="">None (unassigned)</option>
                {r.workStreams.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </PSelect>
            </PField>
            <PField label="Sprint">
              <PSelect value={sprintId ?? ''} onChange={(e) => setSprintId(e.target.value || null)}>
                <option value="">No sprint</option>
                {r.sprints.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </PSelect>
            </PField>
            <PField label="Assignee">
              <PSelect value={assignedMemberId ?? ''} onChange={(e) => setAssignedMemberId(e.target.value || null)}>
                <option value="">Unassigned</option>
                {(team?.members ?? []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </PSelect>
            </PField>
            <PField label="Status">
              <PSelect value={status} onChange={(e) => setStatus(e.target.value as Status)}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </PSelect>
            </PField>
            {!r.connector && (
              <PField label="Type">
                <PSelect value={typeLabel} onChange={(e) => setTypeLabel(e.target.value)}>
                  <option value="">None</option>
                  {LOCAL_ITEM_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </PSelect>
              </PField>
            )}
            <PField label="Points" hint="approximate effort">
              <PointSeg value={points} onChange={setPoints} />
            </PField>
          </>
        }
      />
    </Modal>
  );
}
