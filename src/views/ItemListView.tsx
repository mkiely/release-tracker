import { useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { ItemListViewProps } from '../hooks/useItemListView';
import { itemColumnsDep, itemTableColumns, useFitColumns } from '../hooks/useFitColumns';
import { useColumnWidths } from '../hooks/useColumnWidths';
import { usePresentationMode } from '../store/presentationMode';
import type { Member, Sprint, WorkItem } from '../types';
import { fmtShort } from '../lib/dates';
import { sumPoints } from '../lib/derive';
import { NewItemButton, PushButton, SyncButton, TopBar } from '../components/chrome';
import { ShareButton } from '../components/ShareButton';
import { Breadcrumb } from '../components/Breadcrumb';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { IconButton } from '../components/primitives';
import { TeamLink } from '../components/TeamLink';
import { SegmentedToggle } from '../components/SegmentedToggle';
import { statusVars } from '../components/statusVars';
import { TableFacetBar } from './SprintTable';
import { attributeColumns, type AttrColumn } from '../components/fields/columns';
import { ResizeHandle } from './ResizeHandle';
import { ItemRow } from './ItemRow';
import { sortItems, nextSort, type ItemSort, type SortCtx } from './itemSort';
import styles from './SprintTable.module.css';

// ── Sprint section (grouped mode) ─────────────────────────────────────────

function SprintSection({
  sp,
  isActive,
  items,
  members,
  attrColumns,
  streamNameOf,
  onOpenItem,
}: {
  sp: Sprint;
  isActive: boolean;
  items: WorkItem[];
  members: Member[];
  attrColumns: AttrColumn[];
  /** Present when the list mixes streams (backlog): resolves the row's Work Stream cell. */
  streamNameOf?: (it: WorkItem) => string;
  onOpenItem: (id: string) => void;
}) {
  const pts = sumPoints(items);
  const sv = statusVars('In Progress');

  return (
    <div className={styles.section}>
      <div
        className={styles.sectionLeft}
        style={isActive ? { boxShadow: `inset 4px 0 0 ${sv.dot}` } : undefined}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          <span
            style={{
              fontSize: 'var(--rt-fs-lg)',
              fontWeight: 'var(--rt-fw-display)',
              letterSpacing: '-0.022em',
              color: 'var(--rt-ink)',
              lineHeight: 1.2,
            }}
          >
            {sp.name}
          </span>
          {isActive && (
            <span
              style={{
                fontSize: 'var(--rt-fs-micro)',
                fontWeight: 'var(--rt-fw-display)',
                letterSpacing: '0.07em',
                textTransform: 'uppercase',
                background: 'var(--rt-st-ac-dot)',
                color: '#fff',
                borderRadius: 3,
                padding: '2px 5px',
                lineHeight: 1,
                flexShrink: 0,
              }}
            >
              Active
            </span>
          )}
        </div>
        <div className={styles.sectionMeta} style={{ marginTop: 3 }}>
          {fmtShort(sp.startISO)} – {fmtShort(sp.endISO)}
        </div>
        <div className={styles.sectionMeta}>
          {items.length} item{items.length !== 1 ? 's' : ''} · {pts} pts
        </div>
      </div>
      <div className={styles.sectionRight}>
        {items.map((it) => (
          <ItemRow
            key={it.id}
            item={it}
            members={members}
            attrColumns={attrColumns}
            workStreamName={streamNameOf ? streamNameOf(it) : undefined}
            onOpen={() => onOpenItem(it.id)}
          />
        ))}
      </div>
    </div>
  );
}

// ── Col headers ───────────────────────────────────────────────────────────

/** One clickable, sortable column header. `resizeCol` (when set) mounts the
 *  resize handle — its own mousedown stops propagation, so dragging never sorts. */
function HeaderCell({
  colClass,
  label,
  sortCol,
  resizeCol,
  sort,
  onSort,
  containerRef,
}: {
  colClass: string;
  label: string;
  sortCol: string;
  resizeCol?: string;
  sort: ItemSort | null;
  onSort: (col: string) => void;
  containerRef: RefObject<HTMLElement | null>;
}) {
  const active = sort?.col === sortCol;
  return (
    <div
      className={
        `${colClass} ${styles.colHeaderLabel} ${styles.sortable}` +
        (active ? ` ${styles.sortActive}` : '') +
        (resizeCol ? ` ${styles.resizeTarget}` : '')
      }
      role="button"
      tabIndex={0}
      aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      title={`Sort by ${label}`}
      onClick={() => onSort(sortCol)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSort(sortCol); }
      }}
    >
      {label}
      {active && (
        <span
          className={styles.sortArrow}
          style={sort!.dir === 'asc' ? { transform: 'rotate(180deg)' } : undefined}
          aria-hidden
        >
          {Icon.chevDown}
        </span>
      )}
      {resizeCol && <ResizeHandle col={resizeCol} containerRef={containerRef} />}
    </div>
  );
}

function ColHeaders({
  groupBySprint,
  showStream,
  attrColumns,
  containerRef,
  sort,
  onSort,
}: {
  groupBySprint: boolean;
  showStream: boolean;
  attrColumns: AttrColumn[];
  containerRef: RefObject<HTMLElement | null>;
  sort: ItemSort | null;
  onSort: (col: string) => void;
}) {
  const hp = { sort, onSort, containerRef };
  const itemCols = (
    <>
      <HeaderCell {...hp} colClass={styles.colKey} label="Key" sortCol="key" />
      <HeaderCell {...hp} colClass={styles.colType} label="Type" sortCol="type" resizeCol="type" />
      <HeaderCell {...hp} colClass={styles.colPts} label="Pts" sortCol="pts" resizeCol="pts" />
      <HeaderCell {...hp} colClass={styles.colAssignee} label="Assignee" sortCol="assignee" />
      <HeaderCell {...hp} colClass={styles.colStatus} label="Status" sortCol="status" />
      <HeaderCell {...hp} colClass={styles.colBuild} label="Build" sortCol="build" resizeCol="build" />
      {attrColumns.map((c) => (
        <HeaderCell {...hp} key={c.key} colClass={styles.colAttr} label={c.label} sortCol={`attr:${c.key}`} resizeCol="attr" />
      ))}
      {!groupBySprint && (
        <HeaderCell {...hp} colClass={styles.colSprint} label="Sprint" sortCol="sprint" resizeCol="sprint" />
      )}
      {showStream && (
        <HeaderCell {...hp} colClass={styles.colWorkStream} label="Work Stream" sortCol="workstream" resizeCol="workstream" />
      )}
      <HeaderCell {...hp} colClass={styles.colTitle} label="Title" sortCol="title" />
    </>
  );

  if (groupBySprint) {
    return (
      <div className={styles.colHeaders}>
        <div className={styles.colHeaderLeft}>Sprint</div>
        <div className={styles.colHeaderRight}>{itemCols}</div>
      </div>
    );
  }

  return (
    <div className={styles.colHeaders}>
      <div className={styles.colHeaderRight} style={{ flex: 1 }}>{itemCols}</div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export function ItemListView({
  variant,
  release: r,
  team,
  filteredItems,
  activeSprintId,
  totalItemCount,
  totalPts,
  facetGroups,
  isFiltered,
  groupBySprint,
  showStreamColumn,
  onToggleGroupBy,
  onHome,
  onBack,
  onOpenTeam,
  onNewItem,
  onOpenItem,
  onToggleFacet,
  onClearFilters,
  onSync,
  onPush,
}: ItemListViewProps) {
  const members = team?.members ?? [];
  const attrCols = attributeColumns(r.catalog);

  const bodyRef = useRef<HTMLDivElement>(null);
  const presentation = usePresentationMode();
  useFitColumns(bodyRef, itemTableColumns(filteredItems), [itemColumnsDep(filteredItems), presentation]);
  useColumnWidths(bodyRef);

  const [sort, setSort] = useState<ItemSort | null>(null);
  const onSort = (col: string) => setSort((cur) => nextSort(cur, col));

  const crumbLabel = variant === 'backlog' ? 'Backlog' : 'Unassigned';
  const emptyMessage = isFiltered
    ? 'No items match the current filters.'
    : variant === 'backlog'
      ? 'Backlog is clear — no incomplete work in this release.'
      : 'No unassigned items — all work on this build has been organized into streams.';

  const streamNameById = new Map(r.workStreams.map((ws) => [ws.id, ws.name]));
  const streamNameOf = showStreamColumn
    ? (it: WorkItem) => (it.workStreamId ? (streamNameById.get(it.workStreamId) ?? '—') : '—')
    : undefined;

  // Flat mode: sprint name lookup for inline column
  const sprintById = new Map(r.sprints.map((sp) => [sp.id, sp.name]));
  const sprintOrderById = new Map(r.sprints.map((sp, i) => [sp.id, i]));
  const attrByKey = new Map(attrCols.map((c) => [c.key, c]));
  const sortCtx: SortCtx = {
    memberName: (id) => (id ? (members.find((m) => m.id === id)?.name ?? '') : ''),
    sprintOrder: (id) => (id ? (sprintOrderById.get(id) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER),
    streamName: (id) => (id ? (streamNameById.get(id) ?? '') : ''),
    attrCell: (item, key) => attrByKey.get(key)?.cell(item) ?? '',
  };

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
    <div className="wf screen">
      <TopBar
        left={<IconButton icon={Icon.chevLeft} title="Back" onClick={onBack} />}
        title={
          <Breadcrumb
            crumbs={[
              { label: 'Releases', icon: Icon.release, onClick: onHome },
              { label: r.name, onClick: onBack },
              { label: crumbLabel, icon: variant === 'backlog' ? Icon.backlog : Icon.stream },
            ]}
          />
        }
        sub={team ? <TeamLink name={team.name} onClick={onOpenTeam} /> : undefined}
        right={
          <>
            <span style={{ fontSize: 'var(--rt-fs-sm)', color: 'var(--rt-t3)' }}>
              {totalItemCount} item{totalItemCount !== 1 ? 's' : ''} · {totalPts} pts
            </span>
            <ShareButton release={r} />
            <PushButton release={r} onPush={onPush} />
            <SyncButton release={r} onSync={onSync} />
            <NewItemButton release={r} onClick={onNewItem} icon={Icon.plus} />
          </>
        }
      />

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
          </div>
        }
      />

      <div className={styles.body} ref={bodyRef}>
        <ColHeaders
          groupBySprint={groupBySprint}
          showStream={showStreamColumn}
          attrColumns={attrCols}
          containerRef={bodyRef}
          sort={sort}
          onSort={onSort}
        />

        {isEmpty ? (
          <EmptyState>{emptyMessage}</EmptyState>
        ) : groupBySprint ? (
          <>
            {sprintSections.map(({ sp, items }) => (
              <SprintSection
                key={sp.id}
                sp={sp}
                isActive={sp.id === activeSprintId}
                items={items}
                members={members}
                attrColumns={attrCols}
                streamNameOf={streamNameOf}
                onOpenItem={onOpenItem}
              />
            ))}
            {noSprintItems.length > 0 && (
              <div className={styles.section}>
                <div className={styles.sectionLeft}>
                  <span className={styles.sectionName} style={{ color: 'var(--rt-t3)', fontStyle: 'italic' }}>No sprint</span>
                  <div className={styles.sectionMeta}>{noSprintItems.length} item{noSprintItems.length !== 1 ? 's' : ''}</div>
                </div>
                <div className={styles.sectionRight}>
                  {noSprintItems.map((it) => (
                    <ItemRow
                      key={it.id}
                      item={it}
                      members={members}
                      attrColumns={attrCols}
                      workStreamName={streamNameOf ? streamNameOf(it) : undefined}
                      onOpen={() => onOpenItem(it.id)}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className={styles.section} style={{ border: 'none' }}>
            <div className={styles.sectionRight} style={{ flex: 1 }}>
              {flatItems.map((it) => (
                <ItemRow
                  key={it.id}
                  item={it}
                  members={members}
                  attrColumns={attrCols}
                  sprintName={it.sprintId ? (sprintById.get(it.sprintId) ?? '—') : 'No sprint'}
                  workStreamName={streamNameOf ? streamNameOf(it) : undefined}
                  onOpen={() => onOpenItem(it.id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
