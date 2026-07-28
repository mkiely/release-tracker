import type { WorkStreamViewProps } from '../hooks/useWorkStreamView';
import { streamCodeFreezeChip } from '../lib/derive';
import { WorkStreamChrome } from '../components/WorkStreamChrome';
import { EmptyState } from '../components/EmptyState';
import { FacetBar } from '../components/FacetBar';
import { StreamSprintColumn } from '../components/dnd';
import { WorkItemCard } from '../components/WorkItemCard';
import styles from './WorkStreamView.module.css';

/** The card presenter for one work stream: a column per sprint, cards draggable
 *  between them. Chrome comes from WorkStreamChrome; this renders the board. */
export function WorkStreamView(props: WorkStreamViewProps) {
  const {
    release: r,
    workStream: ws,
    team,
    allItems,
    filteredItems,
    activeSprintId,
    facetGroups,
    isFiltered,
    onOpenItem,
    onToggleFacet,
    onClearFilters,
    notify,
  } = props;

  return (
    <WorkStreamChrome
      {...props}
      hint="drag cards between sprints"
      toolbar={
        <div className={styles.facetBar}>
          <FacetBar groups={facetGroups} onToggle={onToggleFacet} onClear={onClearFilters} />
        </div>
      }
    >
      <div className={styles.board}>
        {filteredItems.length === 0 ? (
          <EmptyState>
            {isFiltered ? 'No items match the current filters.' : 'No work items yet. Create one to get started.'}
          </EmptyState>
        ) : (
          <div className={styles.columns}>
            {r.sprints.map((sp) => (
              <StreamSprintColumn
                key={sp.id}
                sp={sp}
                team={team}
                isCur={sp.id === activeSprintId}
                streamItems={filteredItems.filter((i) => i.sprintId === sp.id)}
                allItems={allItems}
                freezeChip={streamCodeFreezeChip(r, sp, ws)}
                notify={notify}
                renderCard={(it) => (
                  <WorkItemCard
                    key={it.id}
                    it={it}
                    releaseTeamId={r.teamId}
                    draggable
                    onOpen={() => onOpenItem(it.id)}
                  />
                )}
              />
            ))}
          </div>
        )}
      </div>
    </WorkStreamChrome>
  );
}
