import styles from './SegmentedToggle.module.css';

export interface SegOption<T extends string> {
  value: T;
  label: string;
  /** Tooltip for the segment (e.g. what grouping it selects). */
  title?: string;
}

/**
 * A small pill-group control: one active segment among a few. Shared by the
 * sprint view's group-by toggle and the release view's sprint/stream axis.
 */
export function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: SegOption<T>[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div className={styles.toggle} role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          title={o.title}
          aria-pressed={value === o.value}
          className={`${styles.btn} ${value === o.value ? styles.btnActive : ''}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
