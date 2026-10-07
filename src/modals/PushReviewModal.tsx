// Part of the app's modal set. Reads what it needs from the store and commits
// through getActions(), so callers supply only ids and an onClose.

import { useState, type CSSProperties } from 'react';
import { type AttrValue } from '../types';
import { getActions, selItemsFor, selRelease, useStore } from '../store/store';
import { buildPushPreview, type PushItemPreview } from '../sync/push';
import { htmlToText } from '../lib/htmlNormalize';
import { displayValue } from '../components/fields/registry';
import { useConnectorMeta } from '../hooks/useConnectorMeta';
import { getBackup } from '../store/backup';
import { relTime } from '../lib/dates';
import { Icon } from '../components/Icon';
import { Modal, PButton } from '../components/primitives';
import { statusVars } from '../components/statusVars';
import { GoneModal } from './parts';
import modalStyles from './modals.module.css';
import styles from './PushReviewModal.module.css';

// Summarizes the pending push: per item, which writeable fields are changing
// (synced → local) before anything is sent. Writeability is derived per item from
// the connector's itemTypes catalog. Each row can be removed, which reverts that
// item's dirty fields back to its synced value.

export function PushReviewModal({
  releaseId,
  onConfirm,
  onClose,
}: {
  releaseId: string;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}) {
  const r = useStore((s) => selRelease(s, releaseId));
  const items = useStore((s) => selItemsFor(s, releaseId));
  const meta = useConnectorMeta(r?.connector?.type);
  const [busy, setBusy] = useState(false);

  if (!r) {
    return (
      <GoneModal title="Push changes" icon={Icon.sync} noun="release" onClose={onClose} />
    );
  }

  const sprintName = (id: string | null): string =>
    id == null ? 'No sprint' : (r.sprints.find((s) => s.id === id)?.name ?? 'Unknown sprint');
  const streamName = (id: string | null): string =>
    id == null ? 'No stream' : (r.workStreams.find((w) => w.id === id)?.name ?? 'Unknown stream');
  const statusVocab = meta?.statuses?.length ? meta.statuses : (r.catalog?.statuses ?? []);
  const valueText = (d: PushItemPreview['diffs'][number], v: AttrValue): string => {
    if (d.field === 'sprint') return sprintName(v as string | null);
    if (d.field === 'status') return statusVocab.find((sd) => sd.id === v)?.label ?? (v == null ? '—' : String(v));
    // Descriptions are long rich-text HTML; show a plain-text projection (clipped
    // at render). The point of the row is to flag that description is included,
    // not to render the whole document.
    if (d.field === 'description') return htmlToText(v == null ? '' : String(v)) || '—';
    if (d.spec) return displayValue(d.spec, v); // vocabulary: enum labels, Yes/No, em-dash
    return v == null ? '—' : String(v);
  };

  // Restored from a backup and not pulled since: some of these "pending" edits may
  // have landed before the backup was taken. A pull clears the ones the connector
  // already has (applySync); pushing first would send them again.
  const restoredAt = getBackup()?.restoredAt() ?? null;
  const pullFirst = restoredAt !== null && (!r.sync?.lastISO || r.sync.lastISO < restoredAt);

  const previews = buildPushPreview(items, meta?.itemTypes);
  // Queued creates (pendingCreate) ride the same push. They have no old→new diff — the
  // whole item is new — so they render as their own row kind above the edits.
  const creates = items.filter((i) => i.pendingCreate);
  const total = previews.length + creates.length;

  // Deliberately does NOT close itself. The push's outcome decides what should be
  // on screen next — a toast over nothing, or the result modal listing what failed
  // — and only the provider that runs the push knows which. This used to `await
  // onConfirm(); onClose();`, which tore down the result modal the handler had just
  // opened, so a failed push looked like a silent no-op. Staying open until told
  // otherwise also keeps `busy` meaningful while the request is in flight.
  const doPush = async () => {
    if (busy || total === 0) return;
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  const arrow = (
    <span className={modalStyles.emMuted} aria-label="changes to">→</span>
  );

  return (
    <Modal
      title="Push changes"
      icon={Icon.sync}
      onClose={onClose}
      width={560}
      footer={
        <>
          <PButton variant="subtle" onClick={onClose}>
            Cancel
          </PButton>
          <PButton onClick={doPush} disabled={busy || total === 0}>
            {busy ? 'Pushing…' : total > 0 ? `Push ${total} change${total !== 1 ? 's' : ''}` : 'Nothing to push'}
          </PButton>
        </>
      }
    >
      {total === 0 ? (
        <span className={modalStyles.lede}>
          No pending changes to push — everything is in sync with the external system.
        </span>
      ) : (
        <>
          {pullFirst && (
            <div className={styles.pullFirst} role="note">
              <span className={styles.pullFirstIcon}>{Icon.alert}</span>
              <span>
                This browser was restored from a backup {relTime(restoredAt!)} and hasn’t pulled since.{' '}
                <strong>Pull first</strong> — changes the connector already has are then dropped from this list
                instead of being sent again.
              </span>
            </div>
          )}
          <div className={`${modalStyles.note} ${modalStyles.introNote}`}>
            {total} item{total !== 1 ? 's' : ''} will be written back to{' '}
            <strong className={modalStyles.em}>{r.name}</strong>
            {creates.length > 0 && (
              <> — including <strong className={modalStyles.em}>{creates.length} new item{creates.length !== 1 ? 's' : ''}</strong> to create</>
            )}
            . Review each change, or remove one to drop it from the push.
          </div>
          <div className={`${modalStyles.stack} ${modalStyles.stackRow} ${modalStyles.scrollList}`}>
            {creates.map((c) => (
              <div
                key={c.id}
                className={styles.itemCard}
              >
                <div className={modalStyles.grow}>
                  <div className={`${modalStyles.row} ${modalStyles.rowTight} ${modalStyles.rowHeader}`}>
                    <span
                      className={styles.newChip}
                      style={{ '--chip-text': statusVars('In Progress').text, '--chip-soft': statusVars('In Progress').soft } as CSSProperties}
                    >
                      New
                    </span>
                    {c.itemType && (
                      <span className={styles.typeChip}>{c.itemType.label}</span>
                    )}
                    <span
                      title={c.subject}
                      className={styles.subjectStrong}
                    >
                      {c.subject}
                    </span>
                  </div>
                  <div className={styles.createMeta}>
                    <span><span className="t3">Stream</span> {streamName(c.workStreamId)}</span>
                    <span><span className="t3">Sprint</span> {sprintName(c.sprintId)}</span>
                    {c.points != null && <span><span className="t3">Points</span> {c.points}</span>}
                  </div>
                </div>
                <PButton
                  variant="subtle"
                  sm
                  onClick={() => getActions().discardPendingCreate(c.id)}
                  disabled={busy}
                  title="Remove this queued item from the push"
                  className={modalStyles.fixed}
                >
                  Remove
                </PButton>
              </div>
            ))}
            {previews.map((p) => (
              <div
                key={p.itemId}
                className={styles.itemCard}
              >
                <div className={modalStyles.grow}>
                  <div className={`${modalStyles.row} ${modalStyles.rowTight} ${modalStyles.rowHeader}`}>
                    <span
                      className={`mono ${styles.keyChip}`}
                    >
                      {p.key}
                    </span>
                    <span
                      title={p.subject}
                      className={styles.subject}
                    >
                      {p.subject}
                    </span>
                  </div>
                  <div className={`${modalStyles.stack} ${modalStyles.stackTight}`}>
                    {p.diffs.map((d) => {
                      // Long free-text values (description) clip to one ellipsized
                      // line so a row stays a single line; the full text is on the
                      // title tooltip.
                      const clip = d.field === 'description';
                      const clipCls = clip ? ` ${styles.clip}` : '';
                      const fromText = valueText(d, d.from);
                      const toText = valueText(d, d.to);
                      return (
                        <div key={d.field} className={styles.diff}>
                          <span className={styles.diffLabel}>{d.label}</span>
                          <span title={clip ? fromText : undefined} className={`${styles.diffFrom}${clipCls}`}>{fromText}</span>
                          {arrow}
                          <span title={clip ? toText : undefined} className={`${styles.diffTo}${clipCls}`}>{toText}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <PButton
                  variant="subtle"
                  sm
                  onClick={() => getActions().revertItem(p.itemId)}
                  disabled={busy}
                  title="Revert this item to its synced value"
                  className={modalStyles.fixed}
                >
                  Remove
                </PButton>
              </div>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}
