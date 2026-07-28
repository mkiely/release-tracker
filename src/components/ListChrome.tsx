import type { ReactNode } from 'react';
import type { ItemListViewProps } from '../hooks/useItemListView';
import { ReleaseActions } from './AppChrome';
import { ScreenScaffold } from './ScreenScaffold';
import { Icon } from './Icon';
import { IconButton } from './primitives';
import { TeamLink } from './TeamLink';
import styles from './WorkStreamChrome.module.css';

type ListChromeProps = Pick<
  ItemListViewProps,
  | 'variant'
  | 'release'
  | 'team'
  | 'onOpenTeam'
  | 'onBack'
  | 'onHome'
  | 'onNewItem'
  | 'onSync'
  | 'onPush'
  | 'totalItemCount'
  | 'totalPts'
> & {
  toolbar?: ReactNode;
  children: ReactNode;
};

/** Shared chrome for the two flat item lists — Backlog (every incomplete item)
 *  and Unassigned (on-build items not yet in a stream). They differ only by
 *  label and icon, so the whole header is shared. */
export function ListChrome({
  variant,
  release: r,
  team,
  onOpenTeam,
  onBack,
  onHome,
  onNewItem,
  onSync,
  onPush,
  totalItemCount,
  totalPts,
  toolbar,
  children,
}: ListChromeProps) {
  const label = variant === 'backlog' ? 'Backlog' : 'Unassigned';
  return (
    <ScreenScaffold
      left={<IconButton icon={Icon.chevLeft} title="Back" onClick={onBack} />}
      crumbs={[
        { label: 'Releases', icon: Icon.release, onClick: onHome },
        { label: r.name, onClick: onBack },
        { label, icon: variant === 'backlog' ? Icon.backlog : Icon.stream },
      ]}
      title={null}
      sub={team ? <TeamLink name={team.name} onClick={onOpenTeam} /> : undefined}
      right={
        <>
          <span className={styles.summary}>
            {totalItemCount} item{totalItemCount !== 1 ? 's' : ''} · {totalPts} pts
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
