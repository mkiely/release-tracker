import type { SprintViewProps } from '../hooks/useSprintView';
import { fmtShort } from '../lib/dates';
import { TeamLink } from './TeamLink';
import styles from './SprintMeta.module.css';

type SprintMetaProps = Pick<
  SprintViewProps,
  'sprint' | 'team' | 'onOpenTeam' | 'vel' | 'pct' | 'totalPts' | 'sprintItemCount'
>;

/**
 * The sprint's reading: team, dates, capacity, days off and planned load.
 *
 * Content only — no framing, and no event badges. Both sprint presenters need
 * exactly this line, but they frame it differently (the card view in the TopBar
 * subtitle, the table view in an identity block beside a 310px name column that
 * lines up with the rows beneath) and they place the sprint's events differently
 * too (a dedicated strip vs inline here). Those are real layout decisions, so
 * only the shared reading lives here.
 */
export function SprintMeta({
  sprint: sp,
  team,
  onOpenTeam,
  vel,
  pct,
  totalPts,
  sprintItemCount,
}: SprintMetaProps) {
  const over = totalPts > vel;
  return (
    <>
      {team && (
        <>
          <TeamLink name={team.name} onClick={onOpenTeam} />
          <span className={styles.dot}>·</span>
        </>
      )}
      <span>
        {fmtShort(sp.startISO)} – {fmtShort(sp.endISO)}
      </span>
      <span className={styles.dot}>·</span>
      <span>
        {vel} pts capacity{pct < 100 ? ` (${pct}%)` : ''}
      </span>
      <span className={styles.dot}>·</span>
      <span>
        {sp.daysOff} person-day{sp.daysOff === 1 ? '' : 's'} off
      </span>
      <span className={styles.dot}>·</span>
      {/* Overcommitment is the one number here worth interrupting for. */}
      <span className={over ? styles.over : undefined}>
        {sprintItemCount} items · {totalPts} pts planned
        {over ? ` · over by ${totalPts - vel}` : ''}
      </span>
    </>
  );
}
