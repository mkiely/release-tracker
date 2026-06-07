import { Icon } from './Icon';
import styles from './TeamLink.module.css';

/** The release's team, surfaced as an inline link that opens the team detail modal.
 *  Inherits the surrounding text color so it sits naturally in a TopBar sub line. */
export function TeamLink({ name, onClick }: { name: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className={styles.link}
      title="View team details"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {Icon.team}
      <span className={styles.name}>{name}</span>
    </button>
  );
}
