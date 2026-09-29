// Small pieces shared between modals, living here rather than in whichever modal
// happened to declare them first — that is how files start importing each other.

import { type ReactNode } from 'react';
import { Modal } from '../components/primitives';
import styles from './parts.module.css';

/** A labelled key/value line inside a calc block; `big` is the emphasised variant
 *  for a block's headline figure. Used by the sprint and metrics modals. */
export function Row({ k, v, big }: { k: ReactNode; v: ReactNode; big?: boolean }) {
  return (
    <div className={`calc ${styles.row}`} data-big={big || undefined}>
      <span title={typeof k === 'string' ? k : undefined} className={styles.key}>{k}</span>
      <span className={`mono ${styles.value}`}>{v}</span>
    </div>
  );
}

/**
 * The modal a screen shows when the thing it was opened for is gone — deleted in
 * another tab, or dropped by a sync that landed while the dialog was open.
 *
 * Six modals each hand-rolled this: the same frame, the same muted line, differing
 * only in the noun. Keeping it in one place also keeps the wording consistent,
 * which matters more than it looks — this is the only message in the app that has
 * to explain an absence the user did not cause.
 */
export function GoneModal({
  title,
  icon,
  noun,
  onClose,
  width = 520,
}: {
  title: string;
  icon?: ReactNode;
  /** The thing that vanished, as it reads mid-sentence: "release", "work item". */
  noun: string;
  onClose: () => void;
  width?: number;
}) {
  return (
    <Modal title={title} icon={icon} onClose={onClose} width={width}>
      <span className="t3">This {noun} no longer exists.</span>
    </Modal>
  );
}
