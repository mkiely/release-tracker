import { useEffect, useRef, useState } from 'react';
import type { WorkStreamViewProps } from '../hooks/useWorkStreamView';
import { itemColumnsDep, itemTableColumns, useFitColumns } from '../hooks/useFitColumns';
import { useColumnWidths } from '../hooks/useColumnWidths';
import { usePresentationMode } from '../store/presentationMode';
import type { Member, Sprint, WorkItem } from '../types';
import { fmtShort } from '../lib/dates';
import { streamCodeFreezeChip, sumPoints } from '../lib/derive';
import { WorkStreamChrome } from '../components/WorkStreamChrome';
import { EmptyState } from '../components/EmptyState';
import { EventBadge } from '../components/Badges';
import { Drag, useDrag, useDragAutoScroll } from '../components/Dnd';
import { statusVars } from '../components/statusVars';
import { getActions } from '../store/store';
import { attributeColumns, type AttrColumn } from '../components/fields/columns';
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
  members,
  attrColumns,
  sort,
  sortCtx,
  freezeChip,
  notify,
  onOpenItem,
}: {
  sp: Sprint;
  isActive: boolean;
  items: WorkItem[];
  members: Member[];
  attrColumns: AttrColumn[];
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
  const draggingItem = useDrag();
  const [over, setOver] = useState(false);

  // Highlight state is driven by an enter/leave depth counter rather than
  // inspecting `relatedTarget`: during a real drag the browser fires bubbling
  // dragenter/dragleave for every child row the pointer crosses, and reports a
  // null `relatedTarget` often enough that a `contains()` check flickers the
  // highlight off mid-drop. Counting enters vs leaves keeps `over` true until
  // the pointer has truly left the whole band. See useDragAutoScroll for the
  // scroll-to-far-sprint half of the reliability fix.
  const dragDepth = useRef(0);

  // Reset when any drag ends (dropped elsewhere, or cancelled) so a stray
  // enter without a matching leave can't leave the band stuck highlighted.
  useEffect(() => {
    if (!draggingItem) {
      dragDepth.current = 0;
      setOver(false);
    }
  }, [draggingItem]);

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
        <ItemRow key={it.id} item={it} members={members} attrColumns={attrColumns} onOpen={() => onOpenItem(it.id)} />
      )}
      dropTarget={{
        over,
        handlers: {
          onDragEnter: (e) => {
            const it = Drag.get();
            if (it && it.sprintId !== sp.id) {
              e.preventDefault();
              dragDepth.current += 1;
              if (!over) setOver(true);
            }
          },
          onDragOver: (e) => {
            const it = Drag.get();
            if (it && it.sprintId !== sp.id) {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (!over) setOver(true);
            }
          },
          onDragLeave: () => {
            dragDepth.current -= 1;
            if (dragDepth.current <= 0) {
              dragDepth.current = 0;
              setOver(false);
            }
          },
          onDrop: (e) => {
            const it = Drag.get();
            if (it && it.sprintId !== sp.id) {
              e.preventDefault();
              getActions().moveItemToSprint(it.id, sp.id);
              notify(`Moved ${it.key} → ${sp.name}`);
            }
            dragDepth.current = 0;
            setOver(false);
            Drag.end();
          },
        },
      }}
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
  // Vocabulary columns declared by the connector's catalog snapshot (none for local releases).
  const attrCols = attributeColumns(r.catalog);

  // Fit the Key/Status columns to their content (re-measured when the item set
  // or the presentation-mode type scale changes).
  const bodyRef = useRef<HTMLDivElement>(null);
  const presentation = usePresentationMode();
  useFitColumns(bodyRef, itemTableColumns(filteredItems), [itemColumnsDep(filteredItems), presentation]);
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
    attrColumns: attrCols,
  };

  // Every release sprint gets a section — including ones with no items yet from
  // this stream — so each is a valid drop target (dragging in from another sprint
  // must be able to land on a currently-empty one, not just ones already populated).
  const sprintSections = r.sprints.map((sp) => ({ sp, items: filteredItems.filter((i) => i.sprintId === sp.id) }));

  const backlogItems = filteredItems.filter((i) => i.sprintId === null);

  return (
    <WorkStreamChrome
      {...props}
      toolbar={<TableFacetBar groups={facetGroups} onToggle={onToggleFacet} onClear={onClearFilters} />}
    >
      <div className={styles.body} ref={bodyRef}>
        <ColHeaders groupLabel="Sprint" attrColumns={attrCols} containerRef={bodyRef} sort={sort} onSort={onSort} />

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
                members={members}
                attrColumns={attrCols}
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
                  <ItemRow key={it.id} item={it} members={members} attrColumns={attrCols} onOpen={() => onOpenItem(it.id)} />
                )}
              />
            )}
          </>
        )}
      </div>
    </WorkStreamChrome>
  );
}
