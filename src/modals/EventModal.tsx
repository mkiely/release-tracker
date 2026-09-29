// Part of the app's modal set. Reads what it needs from the store and commits
// through getActions(), so callers supply only ids and an onClose.

import { useState } from 'react';
import { between, fmtShort } from '../lib/dates';
import { getActions, selRelease, useStore } from '../store/store';
import { Icon } from '../components/Icon';
import { Modal, PButton, PField, PInput } from '../components/primitives';
import { Callout } from '../components/ui/Callout';

export function EventModal({ releaseId, eventId, onClose }: { releaseId: string; eventId?: string; onClose: () => void }) {
  const r = useStore((s) => selRelease(s, releaseId))!;
  const existing = eventId ? r.events.find((e) => e.id === eventId) : null;
  const editing = !!existing;
  const [label, setLabel] = useState(existing ? existing.label : '');
  const [date, setDate] = useState(existing ? existing.dateISO : '');
  const sp = date ? r.sprints.find((s) => between(date, s.startISO, s.endISO)) : null;
  const save = () => {
    if (!label.trim() || !date) return;
    if (editing) {
      getActions().updateEvent(releaseId, eventId!, { label: label.trim(), dateISO: date });
    } else {
      getActions().createEvent(releaseId, { label: label.trim(), dateISO: date });
    }
    onClose();
  };
  const remove = () => {
    getActions().deleteEvent(releaseId, eventId!);
    onClose();
  };
  const minDate = r.sprints.length ? r.sprints[0].startISO : undefined;
  const maxDate = r.sprints.length ? r.sprints[r.sprints.length - 1].endISO : undefined;
  return (
    <Modal
      title={editing ? 'Edit event' : 'New event'}
      icon={Icon.event}
      onClose={onClose}
      width={460}
      footer={
        <>
          {editing && (
            <PButton variant="danger" onClick={remove} style={{ marginRight: 'auto' }}>
              Delete
            </PButton>
          )}
          <PButton variant="subtle" onClick={onClose}>
            Cancel
          </PButton>
          <PButton onClick={save} disabled={!label.trim() || !date}>
            {editing ? 'Save event' : 'Add event'}
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
          min={minDate}
          max={maxDate}
          onChange={(e) => setDate(e.target.value)}
        />
      </PField>
      <Callout tone={sp ? 'active' : 'neutral'}>
        <>
          {!date ? (
            'Pick a date within the release to place this event on a sprint.'
          ) : sp ? (
            <>
              Falls inside <strong style={{ color: 'var(--rt-ink)' }}>{sp.name}</strong> ({fmtShort(sp.startISO)} – {fmtShort(sp.endISO)}) — it'll
              show on that sprint row.
            </>
          ) : (
            'That date is outside the release range.'
          )}
        </>
      </Callout>
    </Modal>
  );
}
