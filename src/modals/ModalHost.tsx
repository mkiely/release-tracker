// ModalHost — renders the active modal based on the ModalSpec. Mirrors the
// modal switch at the bottom of proto-app.jsx's App().

import type { ModalSpec } from '../app-context';
import { ConfirmModal, EventModal, SprintModal, TeamModal, WorkItemDetailModal, WorkItemModal, WorkStreamModal } from './modals';

export function ModalHost({ modal, onClose }: { modal: ModalSpec | null; onClose: () => void }) {
  if (!modal) return null;
  switch (modal.type) {
    case 'team':
      return <TeamModal teamId={modal.teamId} onClose={onClose} />;
    case 'stream':
      return <WorkStreamModal releaseId={modal.releaseId} onClose={onClose} />;
    case 'event':
      return <EventModal releaseId={modal.releaseId} eventId={modal.eventId} onClose={onClose} />;
    case 'sprint':
      return <SprintModal releaseId={modal.releaseId} sprintId={modal.sprintId} onClose={onClose} />;
    case 'item':
      return (
        <WorkItemModal
          releaseId={modal.releaseId}
          presetStreamId={modal.presetStreamId}
          presetSprintId={modal.presetSprintId}
          onClose={onClose}
        />
      );
    case 'itemDetail':
      return <WorkItemDetailModal itemId={modal.itemId} onClose={onClose} />;
    case 'confirm':
      return <ConfirmModal title={modal.title} body={modal.body} confirmLabel={modal.confirmLabel} onConfirm={modal.onConfirm} onClose={onClose} />;
    default:
      return null;
  }
}
