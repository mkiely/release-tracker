import { useRef, useState } from 'react';
import type { WorkStreamViewProps } from '../hooks/useWorkStreamView';
import { itemColumnsDep, useFitColumns } from '../hooks/useFitColumns';
import { useColumnWidths } from '../hooks/useColumnWidths';
import { usePresentationMode } from '../store/presentationMode';
import type { Sprint, WorkItem } from '../types';
import { fmtShort } from '../lib/dates';
import { streamCodeFreezeChip, sumPoints } from '../lib/derive';
import { WorkStreamChrome } from '../components/WorkStreamChrome';
import { EmptyState } from '../components/EmptyState';
import { EventBadge } from '../components/Badges';
import { useDragAutoScroll, useSprintDropTarget } from '../components/Dnd';
import { statusVars } from '../components/statusVars';
import { fitSpecs, type ItemCellCtx, type ItemColumn } from '../components/fields/columns';
import { useItemColumns } from '../hooks/useItemColumns';
import { ColumnMenu } from './table/ColumnMenu';
import { ColHeaders } from './table/ColHeaders';
import { ActiveBadge, SprintBand } from './table/SprintBand';
import { TableFacetBar } from './table/TableFacetBar';
import { ItemRow } from './table/ItemRow';
import { sortItems, nextSort, type ItemSort, type SortCtx } from './table/itemSort';
import styles from './table/table.module.css';

// ── Sprint section ────────────────────────────────────────────────────────

function SprintSection({
  sp,
  isActive,
  items: rawItems,
  columns,
  cellCtx,
  sort,
  sortCtx,
  freezeChip,
  notify,
  onOpenItem,
}: {
  sp: Sprint;
  isActive: boolean;
  items: WorkItem[];
  columns: readonly ItemColumn[];
  cellCtx: ItemCellCtx;
  sort: ItemSort | null;
  sortCtx: SortCtx;
  /** This stream's code-freeze marker, when its effective freeze falls in this sprint. */
  freezeChip: ReturnType<typeof streamCodeFreezeChip>;
  notify: (msg: string) => void;
  onOpenItem: (id: string) => void;
}) {
  const items = sortItems(rawItems, sort, sortCtx);
  const pts = sumPoints(items);
  const sv = statusVars('In Progress');
  const { over, handlers } = useSprintDropTarget(sp, notify);

  return (
    <SprintBand
      title={sp.name}
      dates={`${fmtShort(sp.startISO)} – ${fmtShort(sp.endISO)}`}
      count={items.length}
      points={pts}
      badge={isActive ? <ActiveBadge /> : undefined}
      accent={isActive ? sv.dot : undefined}
      extra={
        freezeChip && (
          <div style={{ marginTop: 4 }}>
            <EventBadge date={fmtShort(freezeChip.dateISO)} critical>
              {freezeChip.label}
            </EventBadge>
          </div>
        )
      }
      items={items}
      sort={null /* sorted above, so the band renders as given */}
      sortCtx={sortCtx}
      emptyLabel="No items"
      renderRow={(it) => (
        <ItemRow key={it.id} item={it} columns={columns} ctx={cellCtx} onOpen={() => onOpenItem(it.id)} />
      )}
      dropTarget={{ over, handlers }}
    />
  );
}

// ── Main component ────────────────────────────────────────────────────────

/** One work stream as a table, banded by sprint. Bands are drop targets, so an
 *  item moves sprint by dragging its row — including onto a currently-empty band. */
export function WorkStreamTable(props: WorkStreamViewProps) {
  const {
    release: r,
    workStream: ws,
    team,
    filteredItems,
    activeSprintId,
    facetGroups,
    isFiltered,
    onOpenItem,
    onToggleFacet,
    onClearFilters,
    notify,
  } = props;
  const members = team?.members ?? [];
  const bodyRef = useRef<HTMLDivElement>(null);
  const presentation = usePresentationMode();
  // Scoped to one stream and banded by sprint, so neither position column applies.
  const cellCtx: ItemCellCtx = { members };
  const cols = useItemColumns(r.catalog, cellCtx);
  const { columns } = cols;

  // Fit the Key/Status columns to their content (re-measured when the item set
  // or the presentation-mode type scale changes).
  useFitColumns(bodyRef, fitSpecs(columns, filteredItems), [itemColumnsDep(filteredItems), presentation]);
  useColumnWidths(bodyRef);
  // Keep far-off sprint bands reachable while dragging in this scrolling list.
  useDragAutoScroll(bodyRef);

  // Column sorting applies within each sprint section — grouping itself always wins.
  const [sort, setSort] = useState<ItemSort | null>(null);
  const onSort = (col: string) => setSort((cur) => nextSort(cur, col));
  const sortCtx: SortCtx = {
    memberName: (id) => (id ? (members.find((m) => m.id === id)?.name ?? '') : ''),
    sprintOrder: () => 0, // no Sprint column in this table — never invoked
    streamName: () => '', // no Work Stream column in this table — never invoked
    columns,
  };

  // Every release sprint gets a section — including ones with no items yet from
  // this stream — so each is a valid drop target (dragging in from another sprint
  // must be able to land on a currently-empty one, not just ones already populated).
  const sprintSections = r.sprints.map((sp) => ({ sp, items: filteredItems.filter((i) => i.sprintId === sp.id) }));

  const backlogItems = filteredItems.filter((i) => i.sprintId === null);

  return (
    <WorkStreamChrome
      {...props}
      toolbar={<TableFacetBar groups={facetGroups} onToggle={onToggleFacet} onClear={onClearFilters} trailing={<ColumnMenu {...cols} />} />}
    >
      <div className={styles.body} ref={bodyRef}>
        <ColHeaders groupLabel="Sprint" columns={columns} containerRef={bodyRef} sort={sort} onSort={onSort} onMoveColumn={cols.onMoveColumn} />

        {filteredItems.length === 0 ? (
          <EmptyState>
            {isFiltered ? 'No items match the current filters.' : 'No work items yet. Create one to get started.'}
          </EmptyState>
        ) : (
          <>
            {sprintSections.map(({ sp, items }) => (
              <SprintSection
                key={sp.id}
                sp={sp}
                isActive={sp.id === activeSprintId}
                items={items}
                columns={columns}
                cellCtx={cellCtx}
                sort={sort}
                sortCtx={sortCtx}
                freezeChip={streamCodeFreezeChip(r, sp, ws)}
                notify={notify}
                onOpenItem={onOpenItem}
              />
            ))}
            {backlogItems.length > 0 && (
              <SprintBand
                title="No sprint"
                variant="unassigned"
                count={backlogItems.length}
                items={backlogItems}
                sort={sort}
                sortCtx={sortCtx}
                renderRow={(it) => (
                  <ItemRow key={it.id} item={it} columns={columns} ctx={cellCtx} onOpen={() => onOpenItem(it.id)} />
                )}
              />
            )}
          </>
        )}
      </div>
    </WorkStreamChrome>
  );
}
