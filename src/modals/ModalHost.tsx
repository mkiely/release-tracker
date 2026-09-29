// ModalHost — renders the active modal for a ModalSpec. One switch, so opening a
// modal anywhere in the app is a plain data value rather than local state.

import type { ModalSpec } from '../app-context';
import { CodeFreezeModal } from './CodeFreezeModal';
import { ConfirmModal } from './ConfirmModal';
import { EventModal } from './EventModal';
import { LoadShareModal } from './LoadShareModal';
import { PushReviewModal } from './PushReviewModal';
import { SprintModal } from './SprintModal';
import { StreamHealthModal } from './StreamHealthModal';
import { TeamModal } from './TeamModal';
import { WorkItemDetailModal } from './WorkItemDetailModal';
import { WorkItemModal } from './WorkItemModal';
import { WorkStreamModal } from './WorkStreamModal';
import { ConnectorItemModal } from './ConnectorItemModal';
import { MetricsModal } from './MetricsModal';
import { TimelineModal } from './TimelineModal';
import { PushResultModal } from './PushResultModal';

export function ModalHost({ modal, onClose }: { modal: ModalSpec | null; onClose: () => void }) {
  if (!modal) return null;
  switch (modal.type) {
    case 'team':
      return <TeamModal teamId={modal.teamId} onClose={onClose} />;
    case 'stream':
      return <WorkStreamModal releaseId={modal.releaseId} wsId={modal.wsId} onClose={onClose} />;
    case 'streamHealth':
      return <StreamHealthModal releaseId={modal.releaseId} wsId={modal.wsId} onClose={onClose} />;
    case 'metrics':
      return <MetricsModal releaseId={modal.releaseId} section={modal.section} onClose={onClose} />;
    case 'timeline':
      return <TimelineModal releaseId={modal.releaseId} onClose={onClose} />;
    case 'event':
      return <EventModal releaseId={modal.releaseId} eventId={modal.eventId} onClose={onClose} />;
    case 'codeFreeze':
      return <CodeFreezeModal releaseId={modal.releaseId} onClose={onClose} />;
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
    case 'connectorItem':
      return (
        <ConnectorItemModal
          releaseId={modal.releaseId}
          presetStreamId={modal.presetStreamId}
          presetSprintId={modal.presetSprintId}
          onClose={onClose}
        />
      );
    case 'itemDetail':
      return <WorkItemDetailModal itemId={modal.itemId} onClose={onClose} />;
    case 'pushReview':
      return <PushReviewModal releaseId={modal.releaseId} onConfirm={modal.onConfirm} onClose={onClose} />;
    case 'pushResult':
      return (
        <PushResultModal
          releaseId={modal.releaseId}
          pushed={modal.pushed}
          failures={modal.failures}
          onOpenItem={modal.onOpenItem}
          onRetry={modal.onRetry}
          onClose={onClose}
        />
      );
    case 'confirm':
      return <ConfirmModal title={modal.title} body={modal.body} confirmLabel={modal.confirmLabel} onConfirm={modal.onConfirm} onClose={onClose} />;
    case 'loadShare':
      return <LoadShareModal payload={modal.payload} onConfirm={modal.onConfirm} onClose={onClose} />;
    default:
      return null;
  }
}
