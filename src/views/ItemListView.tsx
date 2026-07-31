import { useRef, useState } from 'react';
import type { ItemListViewProps } from '../hooks/useItemListView';
import { itemColumnsDep, useFitColumns } from '../hooks/useFitColumns';
import { useColumnWidths } from '../hooks/useColumnWidths';
import { usePresentationMode } from '../store/presentationMode';
import type { WorkItem } from '../types';
import { fmtShort } from '../lib/dates';
import { sumPoints } from '../lib/derive';
import { ListChrome } from '../components/ListChrome';
import { EmptyState } from '../components/EmptyState';
import { SegmentedToggle } from '../components/SegmentedToggle';
import { statusVars } from '../components/statusVars';
import { fitSpecs, type ItemCellCtx } from '../components/fields/columns';
import { useItemColumns } from '../hooks/useItemColumns';
import { ColumnMenu } from './table/ColumnMenu';
import { ColHeaders } from './table/ColHeaders';
import { ActiveBadge, SprintBand } from './table/SprintBand';
import { TableFacetBar } from './table/TableFacetBar';
import { ItemRow } from './table/ItemRow';
import { sortItems, nextSort, type ItemSort, type SortCtx } from './table/itemSort';
import styles from './table/table.module.css';

// ── Main component ────────────────────────────────────────────────────────

/** The flat item list backing both Backlog and Unassigned (`variant` picks which).
 *  Groups by sprint or shows one flat list — a persisted per-view preference. */
export function ItemListView(props: ItemListViewProps) {
  const {
    variant,
    release: r,
    team,
    filteredItems,
    activeSprintId,
    facetGroups,
    isFiltered,
    groupBySprint,
    showStreamColumn,
    onToggleGroupBy,
    onOpenItem,
    onToggleFacet,
    onClearFilters,
  } = props;
  const members = team?.members ?? [];

  const bodyRef = useRef<HTMLDivElement>(null);
  const presentation = usePresentationMode();

  const [sort, setSort] = useState<ItemSort | null>(null);
  const onSort = (col: string) => setSort((cur) => nextSort(cur, col));

  const crumbLabel = variant === 'backlog' ? 'Backlog' : 'Unassigned';
  const emptyMessage = isFiltered
    ? 'No items match the current filters.'
    : variant === 'backlog'
      ? 'Backlog is clear — no incomplete work in this release.'
      : 'No unassigned items — all work on this build has been organized into streams.';

  const streamNameById = new Map(r.workStreams.map((ws) => [ws.id, ws.name]));
  const streamOf = showStreamColumn
    ? (it: WorkItem) => ({ id: it.workStreamId, name: it.workStreamId ? (streamNameById.get(it.workStreamId) ?? '—') : '—' })
    : undefined;

  // Grouped mode bands rows by sprint, so the Sprint column would repeat the band
  // heading; supplying the accessor only in flat mode is what makes the column
  // appear (see SPRINT_COLUMN.applies).
  const sprintById = new Map(r.sprints.map((sp) => [sp.id, sp.name]));
  const sprintOrderById = new Map(r.sprints.map((sp, i) => [sp.id, i]));
  const cellCtx: ItemCellCtx = {
    members,
    workStream: streamOf,
    sprintName: groupBySprint
      ? undefined
      : (it) => (it.sprintId ? (sprintById.get(it.sprintId) ?? '—') : 'No sprint'),
  };
  const cols = useItemColumns(r.catalog, cellCtx);
  const { columns } = cols;
  const sortCtx: SortCtx = {
    memberName: (id) => (id ? (members.find((m) => m.id === id)?.name ?? '') : ''),
    sprintOrder: (id) => (id ? (sprintOrderById.get(id) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER),
    streamName: (id) => (id ? (streamNameById.get(id) ?? '') : ''),
    columns,
  };

  // Fit the Key/Status columns to their content (re-measured when the item set or
  // the presentation-mode type scale changes).
  useFitColumns(bodyRef, fitSpecs(columns, filteredItems), [itemColumnsDep(filteredItems), presentation]);
  useColumnWidths(bodyRef);

  // Grouped mode: sprint sections in release order + "No sprint" at the end.
  // Sorting applies within each section (and the flat list) so grouping wins.
  const sprintSections = groupBySprint
    ? r.sprints
        .map((sp) => ({ sp, items: sortItems(filteredItems.filter((i) => i.sprintId === sp.id), sort, sortCtx) }))
        .filter((s) => s.items.length > 0)
    : [];
  const noSprintItems = groupBySprint
    ? sortItems(filteredItems.filter((i) => i.sprintId === null), sort, sortCtx)
    : [];
  const flatItems = groupBySprint ? filteredItems : sortItems(filteredItems, sort, sortCtx);

  const isEmpty = filteredItems.length === 0;

  return (
    <ListChrome
      {...props}
      toolbar={
        <TableFacetBar
          groups={facetGroups}
          onToggle={onToggleFacet}
          onClear={onClearFilters}
          trailing={
            <div className={styles.filterGroup} style={{ justifyContent: 'flex-end' }}>
              <span className={styles.filterLabel}>Group by</span>
              <SegmentedToggle<'flat' | 'sprint'>
                ariaLabel={`Group ${crumbLabel.toLowerCase()} by`}
                value={groupBySprint ? 'sprint' : 'flat'}
                onChange={(v) => { if ((v === 'sprint') !== groupBySprint) onToggleGroupBy(); }}
                options={[
                  { value: 'flat', label: 'All items', title: 'Show all items in one list' },
                  { value: 'sprint', label: 'By sprint', title: 'Group items by sprint' },
                ]}
              />
              <ColumnMenu {...cols} />
            </div>
          }
        />
      }
    >
      <div className={styles.body} ref={bodyRef}>
        <ColHeaders
          groupLabel={groupBySprint ? 'Sprint' : null}
          columns={columns}
          containerRef={bodyRef}
          sort={sort}
          onSort={onSort}
          onMoveColumn={cols.onMoveColumn}
        />

        {isEmpty ? (
          <EmptyState>{emptyMessage}</EmptyState>
        ) : groupBySprint ? (
          <>
            {sprintSections.map(({ sp, items }) => (
              <SprintBand
                key={sp.id}
                title={sp.name}
                dates={`${fmtShort(sp.startISO)} – ${fmtShort(sp.endISO)}`}
                count={items.length}
                points={sumPoints(items)}
                badge={sp.id === activeSprintId ? <ActiveBadge /> : undefined}
                accent={sp.id === activeSprintId ? statusVars('In Progress').dot : undefined}
                items={items}
                sort={null /* already sorted per section */}
                sortCtx={sortCtx}
                renderRow={(it) => (
                  <ItemRow key={it.id} item={it} columns={columns} ctx={cellCtx} onOpen={() => onOpenItem(it.id)} />
                )}
              />
            ))}
            {noSprintItems.length > 0 && (
              <SprintBand
                title="No sprint"
                variant="unassigned"
                count={noSprintItems.length}
                items={noSprintItems}
                sort={null}
                sortCtx={sortCtx}
                renderRow={(it) => (
                  <ItemRow key={it.id} item={it} columns={columns} ctx={cellCtx} onOpen={() => onOpenItem(it.id)} />
                )}
              />
            )}
          </>
        ) : (
          <div className={styles.section} style={{ border: 'none' }}>
            <div className={styles.sectionRight} style={{ flex: 1 }}>
              {flatItems.map((it) => (
                <ItemRow key={it.id} item={it} columns={columns} ctx={cellCtx} onOpen={() => onOpenItem(it.id)} />
              ))}
            </div>
          </div>
        )}
      </div>
    </ListChrome>
  );
}
