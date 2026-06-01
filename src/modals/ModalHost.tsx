// ModalHost — renders the active modal based on the ModalSpec. Mirrors the
// modal switch at the bottom of proto-app.jsx's App().

import type { ModalSpec } from '../app-context';
import { EventModal, SprintModal, TeamModal, WorkItemDetailModal, WorkItemModal, WorkStreamModal } from './modals';

export function ModalHost({ modal, onClose }: { modal: ModalSpec | null; onClose: () => void }) {
  if (!modal) return null;
  switch (modal.type) {
    case 'team':
      return <TeamModal teamId={modal.teamId} onClose={onClose} />;
    case 'stream':
      return <WorkStreamModal releaseId={modal.releaseId} onClose={onClose} />;
    case 'event':
      return <EventModal releaseId={modal.releaseId} onClose={onClose} />;
    case 'sprint':
      return <SprintModal releaseId={modal.releaseId} sprintN={modal.sprintN} onClose={onClose} />;
    case 'item':
      return (
        <WorkItemModal
          releaseId={modal.releaseId}
          presetStreamId={modal.presetStreamId}
          presetSprintN={modal.presetSprintN}
          onClose={onClose}
        />
      );
    case 'itemDetail':
      return <WorkItemDetailModal itemId={modal.itemId} onClose={onClose} />;
    default:
      return null;
  }
}
