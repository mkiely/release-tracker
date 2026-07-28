// Which work streams override the release code freeze, and when. The release
// header could only say how many ("+2"); this is the one place that names them,
// short of opening each stream's assessment modal in turn.

import { fmtShort } from '../../lib/dates';
import { Icon } from '../Icon';
import styles from './FreezeOverrideList.module.css';

export function FreezeOverrideList({
  overrides,
  codeFreezeISO,
  onOpenStream,
}: {
  overrides: Array<{ id: string; name: string; dateISO: string }>;
  /** The release freeze each override is measured against. */
  codeFreezeISO: string;
  onOpenStream: (wsId: string) => void;
}) {
  if (overrides.length === 0) return null;
  return (
    <div className={`card ${styles.list}`}>
      <span className={`tag ${styles.label}`}>
        Overridden by {overrides.length} work stream{overrides.length === 1 ? '' : 's'}
      </span>
      {overrides.map((o) => (
        <button
          key={o.id}
          type="button"
          className={styles.row}
          onClick={() => onOpenStream(o.id)}
          title={`Edit ${o.name}'s code freeze`}
        >
          <span className={styles.flake}>{Icon.snowflake}</span>
          <span className={styles.name}>{o.name}</span>
          <span className={`mono ${styles.date}`}>{fmtShort(o.dateISO)}</span>
          <span className={styles.rel}>
            {o.dateISO < codeFreezeISO ? 'earlier' : o.dateISO > codeFreezeISO ? 'later' : 'pinned'}
          </span>
        </button>
      ))}
    </div>
  );
}
