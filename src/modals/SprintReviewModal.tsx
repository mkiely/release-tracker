// Part of the app's modal set. Reads what it needs from the store, so callers
// supply only ids and an onClose.
//
// A sprint review from the sprint's own readings (Sprint.opening/closing): what it
// committed to, what was pulled in or moved out, what got done and what was left.
// Everything here is the record — a never-observed sprint gets an explanation, not
// numbers, and a late or stale reading says so above the figures it qualifies.

import { fmtShort, todayISO } from '../lib/dates';
import { sprintReview } from '../lib/sprintHistory';
import { ptsLabel, readingCaveats, reviewReadout } from '../lib/historyReadouts';
import { selRelease, useStore } from '../store/store';
import { useApp } from '../app-context';
import { Icon } from '../components/Icon';
import { Modal, PButton } from '../components/primitives';
import type { SprintReadingItem, WorkItem } from '../types';
import { Row, GoneModal } from './parts';
import modalStyles from './modals.module.css';

export function SprintReviewModal({ releaseId, sprintId, onClose }: { releaseId: string; sprintId: string; onClose: () => void }) {
  const r = useStore((s) => selRelease(s, releaseId));
  const allItems = useStore((s) => s.items);
  const { openModal } = useApp();

  const sp = r?.sprints.find((s) => s.id === sprintId);
  if (!r || !sp) return <GoneModal title="Sprint review" icon={Icon.sprint} noun="sprint" onClose={onClose} />;

  const today = todayISO();
  const review = sprintReview(r, sp, today);
  const close = (
    <PButton variant="subtle" onClick={onClose}>
      Close
    </PButton>
  );
  const title = `${sp.name} review`;

  if (!review) {
    return (
      <Modal title={title} icon={Icon.sprint} onClose={onClose} width={560} footer={close}>
        <div className={`card dash ${modalStyles.emptyCard}`}>
          {sp.startISO > today
            ? 'This sprint hasn’t started. Its commitment is recorded on the first day the app is open while it runs.'
            : 'This sprint was never observed while it ran, so there is no record of what it committed to or finished. Readings are taken whenever the app is open during a sprint; they are never reconstructed afterwards.'}
        </div>
      </Modal>
    );
  }

  const readout = reviewReadout(review, today);
  const caveats = readingCaveats(sp, today);
  const live = new Map(allItems.filter((i) => i.releaseId === releaseId).map((i) => [i.id, i]));
  const { pts, final } = review;

  const lists: { label: string; items: SprintReadingItem[] }[] = [
    { label: final ? 'Carried over' : 'Still open', items: review.unfinished },
    { label: 'Added mid-sprint', items: review.added },
    { label: 'Moved out mid-sprint', items: review.removed },
    { label: 'Completed', items: review.completed },
  ];

  return (
    <Modal title={title} icon={Icon.sprint} onClose={onClose} width={620} footer={close}>
      <div className={modalStyles.lede}>{readout.sentence}</div>

      {caveats.map((c) => (
        <div key={c} className={modalStyles.note}>
          <strong className="t2">Incomplete reading.</strong> {c}
        </div>
      ))}

      <div className={`card ${modalStyles.block}`}>
        <span className={`tag ${modalStyles.blockLabel}`}>{final ? 'As it ended' : 'So far'}</span>
        <Row k="Committed at the opening" v={`${ptsLabel(pts.committed)} · ${review.committed.length} items`} />
        <Row k="Of that, completed" v={`${ptsLabel(pts.committedCompleted)}`} />
        <Row k="Added mid-sprint" v={`${ptsLabel(pts.added)} · ${review.added.length} items`} />
        <Row k="Moved out mid-sprint" v={`${ptsLabel(pts.removed)} · ${review.removed.length} items`} />
        <Row k="Completed in all" v={`${ptsLabel(pts.completed)} · ${review.completed.length} items`} />
        <hr className={`divider ${modalStyles.rule}`} />
        <Row
          k={final ? 'Commitment met' : 'Commitment met so far'}
          v={review.commitmentMetPct === null ? 'nothing committed' : `${review.commitmentMetPct}%`}
          big
        />
      </div>

      {lists
        .filter((l) => l.items.length > 0)
        .map((l) => (
          <div key={l.label} className={`card ${modalStyles.block}`}>
            <span className={`tag ${modalStyles.blockLabel}`}>
              {l.label} · {l.items.length}
            </span>
            {l.items.map((it) => (
              <ReviewItemRow key={it.id} reading={it} live={live.get(it.id)} onOpen={() => openModal({ type: 'itemDetail', itemId: it.id })} />
            ))}
          </div>
        ))}

      <div className={modalStyles.note}>
        Taken from what the app recorded while the sprint ran: the commitment on its first day, the rest as last seen
        {final ? ' before it ended' : ''} ({fmtShort(sp.closing!.dateISO)}). Points are as recorded, not as they stand now.
      </div>
    </Modal>
  );
}

/** One recorded item. The subject is the live one — a reading copies only key and
 *  points — so an item since forgotten keeps its row, with nothing to open. */
function ReviewItemRow({ reading, live, onOpen }: { reading: SprintReadingItem; live: WorkItem | undefined; onOpen: () => void }) {
  const content = (
    <>
      <span className="mono t3">{reading.key}</span>
      <span className={modalStyles.itemRowSubject}>{live ? live.subject : <span className="t3">no longer in this release</span>}</span>
      <span className="mono t3">{reading.points == null ? '—' : ptsLabel(reading.points)}</span>
    </>
  );
  return live ? (
    <button type="button" className={modalStyles.itemRow} onClick={onOpen}>
      {content}
    </button>
  ) : (
    <div className={`${modalStyles.itemRow} ${modalStyles.itemRowStatic}`}>{content}</div>
  );
}
