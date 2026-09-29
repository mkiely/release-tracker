// Part of the app's modal set. Reads what it needs from the store and commits
// through getActions(), so callers supply only ids and an onClose.

import { useConnectorMeta } from '../hooks/useConnectorMeta';
import type { SharePayload } from '../lib/shareRelease';
import { Icon } from '../components/Icon';
import { Modal, PButton } from '../components/primitives';

// Shown when the app opens with a `?share=` link. Confirms loading a release
// from a decoded share payload (config + events + days off); work items and
// streams are not included and arrive when the user syncs.
export function LoadShareModal({
  payload,
  onConfirm,
  onClose,
}: {
  payload: SharePayload;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const meta = useConnectorMeta(payload.connector.type);
  const connName = meta?.label ?? payload.connector.type;
  const eventCount = payload.events.length;
  const sprintCount = payload.sprints.length;
  const handleConfirm = () => { onConfirm(); onClose(); };
  return (
    <Modal
      title="Load shared release"
      icon={Icon.release}
      onClose={onClose}
      width={460}
      footer={
        <>
          <PButton variant="subtle" onClick={onClose}>
            Cancel
          </PButton>
          <PButton onClick={handleConfirm}>
            Load release
          </PButton>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 'var(--rt-fs-md)', color: 'var(--rt-t2)', lineHeight: 'var(--rt-lh-normal)' }}>
        <span>
          Load <strong style={{ color: 'var(--rt-ink)' }}>{payload.name}</strong> as a new release connected to{' '}
          <strong style={{ color: 'var(--rt-ink)' }}>{connName}</strong>?
        </span>
        <span style={{ color: 'var(--rt-t3)', fontSize: 'var(--rt-fs-sm)' }}>
          This brings over the connector configuration{eventCount > 0 ? `, ${eventCount} event${eventCount !== 1 ? 's' : ''}` : ''}
          {sprintCount > 0 ? `, and ${sprintCount} sprint${sprintCount !== 1 ? 's' : ''} with days off` : ''}. Work items and
          work streams aren’t included — click Sync after loading to fetch them from your backend.
        </span>
      </div>
    </Modal>
  );
}
