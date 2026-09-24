// What the push actually did — shown whenever any part of it failed.
//
// This exists because the toast could not do the job. A push is not
// all-or-nothing: some items land and others are rejected, and the old surface
// reported `pushed > 0` as a flat success, so a partial failure was invisible.
// Even when it did report a failure, it had one line, 2.4 seconds, no item names
// and no way to act.
//
// The unit here is the ITEM, not the push: every failure names the work item it
// belongs to, and the row opens it. Field-level detail is rendered against the
// connector's own field labels where it attributed one, because "Severity is
// required" is actionable and "Acme rejected the new item (1 field error)" is not.

import type { PushFailure } from '../store/actions';
import { selRelease, useStore } from '../store/store';
import { useConnectorMeta } from '../hooks/useConnectorMeta';
import { fieldLabel, itemTypeFor } from '../lib/connectorFields';
import { connectorLabel } from '../sync/client';
import { Icon } from '../components/Icon';
import { Modal, PButton } from '../components/primitives';
import styles from './PushResultModal.module.css';

export function PushResultModal({
  releaseId,
  pushed,
  failures,
  onOpenItem,
  onRetry,
  onClose,
}: {
  releaseId: string;
  /** Items written successfully — stated even when the modal is here for failures,
   *  so the user knows the push wasn't a total loss. */
  pushed: number;
  failures: PushFailure[];
  onOpenItem: (itemId: string) => void;
  onRetry: () => void;
  onClose: () => void;
}) {
  const r = useStore((s) => selRelease(s, releaseId));
  const items = useStore((s) => s.items);
  const meta = useConnectorMeta(r?.connector?.type);
  const connName = r?.connector ? connectorLabel(r.connector.type) : 'the external system';

  /**
   * The connector's own label for a field key, so an error reads in the vocabulary
   * the user saw on the form. Resolved per item, because the catalog is per item
   * TYPE — a key means whatever that type says it means. Falls back to the raw key
   * rather than hiding the error, which would be the one unrecoverable outcome.
   */
  const labelFor = (failure: PushFailure, key: string): string => {
    const it = items.find((i) => i.id === failure.itemId);
    return fieldLabel(itemTypeFor(it?.itemType?.id, meta?.itemTypes ?? r?.catalog?.itemTypes), key);
  };

  const n = failures.length;

  return (
    <Modal
      title={`Push finished with ${n} problem${n === 1 ? '' : 's'}`}
      icon={Icon.alert}
      onClose={onClose}
      width={620}
      footer={
        <>
          <span style={{ marginRight: 'auto', fontSize: 'var(--rt-fs-xs)', color: 'var(--rt-t3)' }}>
            Failed items keep their edits and stay queued — nothing was lost.
          </span>
          <PButton variant="subtle" onClick={onClose}>
            Close
          </PButton>
          <PButton icon={Icon.push} onClick={onRetry}>
            Retry push
          </PButton>
        </>
      }
    >
      <p className={styles.intro}>
        {pushed > 0 ? (
          <>
            <strong>{pushed}</strong> item{pushed === 1 ? '' : 's'} reached {connName}.{' '}
            <strong>{n}</strong> did not:
          </>
        ) : (
          <>Nothing reached {connName}. {n === 1 ? 'One item was' : `${n} items were`} rejected:</>
        )}
      </p>

      <div className={styles.list}>
        {failures.map((f) => (
          <button key={f.itemId} type="button" className={styles.row} onClick={() => onOpenItem(f.itemId)}>
            <span className={styles.head}>
              <span className={styles.key}>{f.key}</span>
              <span className={styles.subject}>{f.subject}</span>
              <span className={styles.kind}>{f.kind === 'create' ? 'not created' : 'not updated'}</span>
            </span>
            <span className={styles.message}>{f.message}</span>
            {f.fieldErrors.length > 0 && (
              <span className={styles.fields}>
                {f.fieldErrors.map((fe, i) => (
                  <span key={`${fe.field}-${i}`} className={styles.fieldRow}>
                    <span className={styles.fieldName}>{labelFor(f, fe.field)}</span> — {fe.message}
                  </span>
                ))}
              </span>
            )}
          </button>
        ))}
      </div>
    </Modal>
  );
}
