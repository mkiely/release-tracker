// CapBarInline — inline capacity meter for the sprint-row meta strip: a track
// plus a planned/cap label. Turns red and shows the overflow segment once
// planned points exceed capacity.

import styles from './CapBarInline.module.css';

export function CapBarInline({ planned, cap, w = 134 }: { planned: number; cap: number; w?: number }) {
  const over = planned > cap;
  const ratio = cap > 0 ? Math.min(planned / cap, 1) : planned > 0 ? 1 : 0;
  const overW = over && cap > 0 ? Math.min((planned - cap) / cap, 0.5) : 0;
  return (
    <div
      title={over ? `Over capacity by ${planned - cap} pts` : `${Math.max(0, cap - planned)} pts of capacity remaining`}
      className={styles.root}
      style={{ width: w }}
    >
      <div className={styles.track}>
        <div className={over ? `${styles.fill} ${styles.fillOver}` : styles.fill} style={{ flex: ratio }} />
        {over
          ? <div className={styles.overflow} style={{ flex: overW }} />
          : <div className={styles.remainder} style={{ flex: 1 - ratio }} />}
      </div>
      <span className={`mono ${over ? `${styles.label} ${styles.labelOver}` : styles.label}`}>
        {planned}<span className={styles.sub}>/{cap} pts</span>
      </span>
    </div>
  );
}
