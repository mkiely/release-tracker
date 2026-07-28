import type { ReactNode } from 'react';
import type { WorkStreamViewProps } from '../hooks/useWorkStreamView';
import { ReleaseActions } from './AppChrome';
import { ScreenScaffold } from './ScreenScaffold';
import { Icon } from './Icon';
import { IconButton } from './primitives';
import { StreamAttrSummary } from './StreamAttrSummary';
import { StreamAssessmentChips } from './StreamAssessmentChips';
import { TeamLink } from './TeamLink';
import styles from './WorkStreamChrome.module.css';

type WorkStreamChromeProps = Pick<
  WorkStreamViewProps,
  | 'release'
  | 'workStream'
  | 'team'
  | 'onOpenTeam'
  | 'onBack'
  | 'onHome'
  | 'onNewItem'
  | 'onSync'
  | 'onPush'
  | 'totalItemCount'
  | 'totalPts'
  | 'forecast'
  | 'runway'
  | 'onOpenHealth'
  | 'onEditStream'
> & {
  /** Extra text after the item/points summary — the card view's drag hint. */
  hint?: string;
  /** The facet bar, which the two densities style differently. */
  toolbar?: ReactNode;
  children: ReactNode;
};

/**
 * Shared chrome for both Work Stream presenters (cards + table).
 *
 * This header was previously written out in full in each presenter — the same
 * ~60 lines of breadcrumb, stream name, external-link anchor, attribute summary
 * and team link, copied. They had already drifted: the table had lost its Share
 * button. Presenters now render only their body.
 */
export function WorkStreamChrome({
  release: r,
  workStream: ws,
  team,
  onOpenTeam,
  onBack,
  onHome,
  onNewItem,
  onSync,
  onPush,
  totalItemCount,
  totalPts,
  forecast,
  runway,
  onOpenHealth,
  onEditStream,
  hint,
  toolbar,
  children,
}: WorkStreamChromeProps) {
  return (
    <ScreenScaffold
      left={<IconButton icon={Icon.chevLeft} title="Back" onClick={onBack} />}
      crumbs={[
        { label: 'Releases', icon: Icon.release, onClick: onHome },
        { label: r.name, onClick: onBack },
        { label: 'Work stream' },
      ]}
      title={
        <div className={styles.titleRow}>
          <span className={styles.titleIcon}>{Icon.stream}</span>
          <span className={styles.title}>{ws.name}</span>
          {ws.externalUrl && (
            <a
              className={styles.externalLink}
              href={ws.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Open this work stream in the external system (new tab)"
            >
              {Icon.external}
            </a>
          )}
          <StreamAttrSummary release={r} ws={ws} />
        </div>
      }
      sub={
        <span className={styles.subRow}>
          {team && <TeamLink name={team.name} onClick={onOpenTeam} />}
          {/* The verdicts this screen never carried. Reaching them used to mean going
              back to the release view or opening Release analysis. */}
          <StreamAssessmentChips
            forecast={forecast}
            runway={runway}
            planningState={ws.planningState}
            onOpenDelivery={() => (forecast.verdict === 'unconfigured' ? onEditStream() : onOpenHealth())}
            onOpenPlanning={() => (runway.verdict === 'unconfigured' ? onEditStream() : onOpenHealth())}
          />
        </span>
      }
      right={
        <>
          <span className={styles.summary}>
            {totalItemCount} items · {totalPts} pts{hint ? ` · ${hint}` : ''}
          </span>
          <ReleaseActions
            release={r}
            onPush={onPush}
            onSync={onSync}
            onNewItem={onNewItem}
            newItemIcon={Icon.plus}
          />
        </>
      }
      toolbar={toolbar}
    >
      {children}
    </ScreenScaffold>
  );
}
