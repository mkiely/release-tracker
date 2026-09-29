// Part of the app's modal set. Reads what it needs from the store and commits
// through getActions(), so callers supply only ids and an onClose.

import { useState } from 'react';
import { between, fmtShort } from '../lib/dates';
import { effectiveCodeFreeze, freezeOverrides } from '../lib/derive';
import { getActions, selRelease, useStore } from '../store/store';
import { useApp } from '../app-context';
import { Icon } from '../components/Icon';
import { Modal, PButton, PField, PInput } from '../components/primitives';
import { Callout } from '../components/ui/Callout';
import { FreezeOverrideList } from '../components/ui/FreezeOverrideList';

export function CodeFreezeModal({ releaseId, onClose }: { releaseId: string; onClose: () => void }) {
  const r = useStore((s) => selRelease(s, releaseId))!;
  const { openModal } = useApp();
  const isOverride = r.codeFreezeISO != null;
  const [date, setDate] = useState(effectiveCodeFreeze(r));
  const sp = date ? r.sprints.find((s) => between(date, s.startISO, s.endISO)) : null;
  const overrides = freezeOverrides(r);

  const save = () => {
    if (!date) return;
    getActions().setCodeFreeze(releaseId, date);
    onClose();
  };
  const useDefault = () => {
    getActions().setCodeFreeze(releaseId, null);
    onClose();
  };

  const minDate = r.sprints.length ? r.sprints[0].startISO : undefined;

  return (
    <Modal
      title="Code freeze"
      icon={Icon.snowflake}
      onClose={onClose}
      width={560}
      footer={
        <>
          {isOverride && (
            <PButton variant="subtle" onClick={useDefault} style={{ marginRight: 'auto' }}>
              Use default (last sprint end)
            </PButton>
          )}
          <PButton variant="subtle" onClick={onClose}>
            Cancel
          </PButton>
          <PButton onClick={save} disabled={!date}>
            Save
          </PButton>
        </>
      }
    >
      <PField label="Code check-in deadline" hint="defaults to the release's last sprint end when not set explicitly">
        <PInput autoFocus type="date" value={date} min={minDate} onChange={(e) => setDate(e.target.value)} />
      </PField>
      <Callout tone={sp ? 'warning' : 'neutral'}>
        <>
          {!date ? (
            'Pick the date code must be checked in for this release.'
          ) : sp ? (
            <>
              Falls inside <strong style={{ color: 'var(--rt-ink)' }}>{sp.name}</strong> ({fmtShort(sp.startISO)} – {fmtShort(sp.endISO)}) — it'll
              show as a critical chip on that sprint and cap forward capacity for streams still working past it. Individual
              work streams can override this in their own settings.
            </>
          ) : (
            "That date falls outside the release's current sprints."
          )}
        </>
      </Callout>
      {/* The overriding streams are the first thing you need when editing this date:
          moving the release freeze doesn't move theirs. */}
      <FreezeOverrideList
        overrides={overrides}
        codeFreezeISO={effectiveCodeFreeze(r)}
        onOpenStream={(wsId) => openModal({ type: 'stream', releaseId, wsId })}
      />
    </Modal>
  );
}
