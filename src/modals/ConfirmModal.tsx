// A destructive action, confirmed. Deliberately generic: the caller supplies the
// wording, so there is one danger dialog rather than one per delete site.

import { Icon } from '../components/Icon';
import { Modal, PButton } from '../components/primitives';

export function ConfirmModal({
  title,
  body,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const handleConfirm = () => { onConfirm(); onClose(); };
  return (
    <Modal
      title={title}
      icon={Icon.trash}
      onClose={onClose}
      width={420}
      footer={
        <>
          <PButton variant="subtle" onClick={onClose}>
            Cancel
          </PButton>
          <PButton variant="danger" onClick={handleConfirm}>
            {confirmLabel}
          </PButton>
        </>
      }
    >
      <span style={{ fontSize: 'var(--rt-fs-md)', color: 'var(--rt-t2)', lineHeight: 'var(--rt-lh-normal)' }}>{body}</span>
    </Modal>
  );
}
