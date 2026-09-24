// The release's work streams on a continuous date axis.
//
// A panel rather than a third axis mode: axis (sprint/stream) crosses with density
// (cards/table) to give four presenters, and a timeline has no density variant to
// offer — adding it there would double the matrix for a view that renders one way.
// If it earns a permanent place on the plan screen, promoting it is a later move
// that costs nothing now.
//
// Muted streams are excluded (see WorkStream.muted): this is a picture of what the
// team is delivering, which is exactly what muting says a stream is not.

import { Icon } from '../components/Icon';
import { StreamGantt } from '../components/StreamGantt';
import { Modal, PButton } from '../components/primitives';
import { useApp } from '../app-context';
import { effectiveStreamCodeFreeze } from '../lib/derive';
import { todayISO } from '../lib/dates';
import { segmentsOfItems, sprintIndex, type TimelineRow } from '../lib/streamTimeline';
import { assessStreams } from '../lib/streamAssessment';
import { selItemsFor, selRelease, selTeam, useStore } from '../store/store';

export function TimelineModal({ releaseId, onClose }: { releaseId: string; onClose: () => void }) {
  const r = useStore((s) => selRelease(s, releaseId));
  const team = useStore((s) => (r ? selTeam(s, r.teamId) : undefined));
  const items = useStore((s) => selItemsFor(s, releaseId));
  const { openModal } = useApp();

  if (!r) {
    return (
      <Modal title="Timeline" icon={Icon.timeline} onClose={onClose} width={520}>
        <span style={{ color: 'var(--rt-t3)' }}>This release no longer exists.</span>
      </Modal>
    );
  }

  const today = todayISO();
  const byId = sprintIndex(r.sprints);
  // Verdicts come from the shared assessment, so a bar can't read amber here and
  // green on the plan screen. Assessed across every stream as always — muting is
  // handled inside assessStreams; here we only choose what to DRAW.
  const assessment = assessStreams(r, team, items, { today });

  const rows: TimelineRow[] = r.workStreams
    .filter((ws) => !ws.muted)
    .map((ws) => {
      const a = assessment.byId.get(ws.id);
      const health = a?.health;
      const streamItems = a?.items ?? [];
      return {
        id: ws.id,
        name: ws.name,
        segments: segmentsOfItems(streamItems, byId),
        freezeISO: effectiveStreamCodeFreeze(r, ws),
        itemCount: health?.itemCount ?? 0,
        totalPts: health?.totalPts ?? 0,
        remainingPts: health?.remainingPts ?? 0,
        // 'complete' and 'on-track' both read green; everything un-judgeable reads
        // neutral rather than borrowing a verdict it hasn't earned.
        tone:
          a?.forecast.verdict === 'at-risk'
            ? 'risk'
            : a?.forecast.verdict === 'on-track' || a?.forecast.verdict === 'complete'
              ? 'ok'
              : 'neutral',
      };
    });

  const mutedCount = r.workStreams.filter((ws) => ws.muted).length;

  return (
    <Modal
      title="Timeline"
      icon={Icon.timeline}
      onClose={onClose}
      width="var(--rt-modal-w-work-item)"
      footer={
        <>
          <span style={{ marginRight: 'auto', fontSize: 'var(--rt-fs-xs)', color: 'var(--rt-t3)' }}>
            Each bar spans the sprints holding that stream&rsquo;s work, on a real date axis.
            {mutedCount > 0 && ` ${mutedCount} muted stream${mutedCount === 1 ? '' : 's'} hidden.`}
          </span>
          <PButton variant="subtle" onClick={onClose}>
            Close
          </PButton>
        </>
      }
    >
      <StreamGantt
        sprints={r.sprints}
        rows={rows}
        todayISO={today}
        onSelectRow={(wsId) => openModal({ type: 'streamHealth', releaseId, wsId })}
      />
    </Modal>
  );
}
