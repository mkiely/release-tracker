import { useRef, useState } from 'react';
import type { GroupBy, SprintViewProps, StreamColumn, StatusColumn } from '../hooks/useSprintView';
import { itemColumnsDep, itemTableColumns, useFitColumns } from '../hooks/useFitColumns';
import { useColumnWidths } from '../hooks/useColumnWidths';
import { usePresentationMode } from '../store/presentationMode';
import { fmtShort } from '../lib/dates';
import { sumPoints } from '../lib/derive';
import { EditSprintButton, ReleaseActions, TopBar } from '../components/AppChrome';
import { SprintMeta } from '../components/SprintMeta';
import { Breadcrumb } from '../components/Breadcrumb';
import { EmptyState } from '../components/EmptyState';
import { EventBadge } from '../components/Badges';
import { Icon } from '../components/Icon';
import { SprintRail } from '../components/Dnd';
import { SegmentedToggle } from '../components/SegmentedToggle';
import { IconButton } from '../components/primitives';
import { statusVars } from '../components/statusVars';
import type { Member, Status } from '../types';
import { attributeColumns, type AttrColumn } from '../components/fields/columns';
import { ColHeaders } from './table/ColHeaders';
import { ActiveBadge } from './table/SprintBand';
import { TableFacetBar } from './table/TableFacetBar';
import { ItemRow } from './table/ItemRow';
import { sortItems, nextSort, type ItemSort, type SortCtx } from './table/itemSort';
import styles from './table/table.module.css';

// ── Helpers ───────────────────────────────────────────────────────────────

const TABLE_STATUS_ORDER: Status[] = ['In Progress', 'Under Review', 'Blocked', 'Not Started', 'Complete'];

// ── Sub-components ────────────────────────────────────────────────────────

// Was a hand-rolled pair of buttons with its own .groupToggle/.groupBtn styles,
// while the card presenter used the SegmentedToggle primitive for the same
// control. Same control, one implementation.
function GroupToggle({ value, onChange }: { value: GroupBy; onChange: (v: GroupBy) => void }) {
  return (
    <SegmentedToggle<GroupBy>
      ariaLabel="Group work items by"
      value={value}
      onChange={onChange}
      options={[
        { value: 'stream', label: 'By stream', title: 'Group by work stream' },
        { value: 'status', label: 'By status', title: 'Group by status' },
      ]}
    />
  );
}

function StreamSection({
  col,
  members,
  attrColumns,
  sort,
  sortCtx,
  onOpenItem,
  onNavigateToStream,
}: {
  col: StreamColumn;
  members: Member[];
  attrColumns: AttrColumn[];
  sort: ItemSort | null;
  sortCtx: SortCtx;
  onOpenItem: (id: string) => void;
  onNavigateToStream: (wsId: string) => void;
}) {
  const pts = sumPoints(col.items);
  const items = sortItems(col.items, sort, sortCtx);
  return (
    <div className={styles.section}>
      <div className={styles.sectionLeft}>
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}
          onClick={() => onNavigateToStream(col.ws.id)}
          title={`Go to ${col.ws.name}`}
        >
          <span className={styles.sectionName}>{col.ws.name}</span>
          <span style={{ color: 'var(--rt-t3)', display: 'flex', flexShrink: 0 }}>{Icon.chevRight}</span>
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
            onOpen={() => onOpenItem(it.id)}
          />
        ))}
      </div>
    </div>
  );
}

function StatusSection({
  col,
  workStreams,
  members,
  attrColumns,
  sort,
  sortCtx,
  onOpenItem,
}: {
  col: StatusColumn;
  workStreams: SprintViewProps['release']['workStreams'];
  members: Member[];
  attrColumns: AttrColumn[];
  sort: ItemSort | null;
  sortCtx: SortCtx;
  onOpenItem: (id: string) => void;
}) {
  const sv = statusVars(col.status);
  const pts = sumPoints(col.items);
  const items = sortItems(col.items, sort, sortCtx);
  return (
    <div className={styles.section}>
      <div
        className={styles.sectionLeft}
        style={{ boxShadow: `inset 4px 0 0 ${sv.dot}` }}
      >
        <div className={styles.statusName} style={{ color: sv.text }}>
          <span className={styles.statusDot} style={{ background: sv.dot }} />
          {col.status}
        </div>
        <div className={styles.sectionMeta}>
          {items.length} item{items.length !== 1 ? 's' : ''} · {pts} pts
        </div>
      </div>
      <div className={styles.sectionRight}>
        {items.map((it) => {
          const ws = it.workStreamId
            ? workStreams.find((w) => w.id === it.workStreamId)
            : undefined;
          return (
            <ItemRow
              key={it.id}
              item={it}
              workStream={{ id: it.workStreamId, name: ws?.name ?? 'No stream' }}
              members={members}
              attrColumns={attrColumns}
              onOpen={() => onOpenItem(it.id)}
            />
          );
        })}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

/** One sprint as a table: rows banded by work stream or status, sortable within
 *  each band. Grouping always wins over sort, so a sort never scatters a band. */
export function SprintTable({
  release: r,
  sprint: sp,
  team,
  onOpenTeam,
  isActive,
  vel,
  pct,
  totalPts,
  events: evts,
  allItems,
  filteredItems,
  streamCols,
  unassignedItems,
  statusCols,
  facetGroups,
  groupBy,
  sprintItemCount,
  isFiltered,
  onHome,
  onBack,
  onGoToSprint,
  onNavigateToStream,
  onEditSprint,
  onNewItem,
  onOpenItem,
  onOpenEvent,
  onSetGroupBy,
  onToggleFacet,
  onClearFilters,
  onSync,
  onPush,
  notify,
}: SprintViewProps) {
  const members = team?.members ?? [];
  // Vocabulary columns declared by the connector's catalog snapshot (none for local releases).
  const attrCols = attributeColumns(r.catalog);

  // Fit the Key/Status columns to their content (re-measured when the item set
  // or the presentation-mode type scale changes).
  const bodyRef = useRef<HTMLDivElement>(null);
  const presentation = usePresentationMode();
  useFitColumns(bodyRef, itemTableColumns(filteredItems), [itemColumnsDep(filteredItems), presentation]);
  useColumnWidths(bodyRef);

  // Column sorting applies within each existing grouping (stream/status section) —
  // grouping itself always wins, matching the backlog/unassigned tables.
  const [sort, setSort] = useState<ItemSort | null>(null);
  const onSort = (col: string) => setSort((cur) => nextSort(cur, col));
  const streamNameById = new Map(r.workStreams.map((ws) => [ws.id, ws.name]));
  const sortCtx: SortCtx = {
    memberName: (id) => (id ? (members.find((m) => m.id === id)?.name ?? '') : ''),
    sprintOrder: () => 0, // no Sprint column in this table — never invoked
    streamName: (id) => (id ? (streamNameById.get(id) ?? '') : ''),
    attrCell: (item, key) => attrCols.find((c) => c.key === key)?.cell(item) ?? '',
  };

  // status cols reordered for table view
  const orderedStatusCols = TABLE_STATUS_ORDER
    .map((s) => statusCols.find((c) => c.status === s)!)
    .filter((c) => c && c.items.length > 0);

  return (
    <div className="screen">
      <TopBar
        left={<IconButton icon={Icon.chevLeft} title="Back" onClick={onBack} />}
        title={
          <Breadcrumb
            crumbs={[
              { label: 'Releases', icon: Icon.release, onClick: onHome },
              { label: r.name, onClick: onBack },
              { label: sp.name, icon: Icon.sprint },
            ]}
          />
        }
        right={
          <ReleaseActions
            release={r}
            leading={<EditSprintButton release={r} onEditSprint={onEditSprint} />}
            onPush={onPush}
            onSync={onSync}
            onNewItem={onNewItem}
          />
        }
      />

      {/* Sprint Identity Block */}
      <div className={styles.identityBlock}>
        <div className={styles.identityLeft}>
          <span className={styles.sprintName}>{sp.name}</span>
          {isActive && <ActiveBadge />}
        </div>
        <div className={styles.identityRight}>
          <div className={styles.identityMeta}>
            <SprintMeta
              sprint={sp}
              team={team}
              onOpenTeam={onOpenTeam}
              vel={vel}
              pct={pct}
              totalPts={totalPts}
              sprintItemCount={sprintItemCount}
            />
            {/* This presenter inlines the sprint's events rather than giving them
                their own strip — there's room on the identity row. */}
            {evts.map((e) => (
              <EventBadge key={e.id} date={fmtShort(e.dateISO)} critical={e.critical} onClick={() => onOpenEvent(e.id)}>
                {e.label}
              </EventBadge>
            ))}
          </div>
          <GroupToggle value={groupBy} onChange={onSetGroupBy} />
        </div>
      </div>

      <SprintRail
        release={r}
        currentSprintId={sp.id}
        team={team}
        allItems={allItems}
        notify={notify}
        onGo={onGoToSprint}
      />

      <TableFacetBar groups={facetGroups} onToggle={onToggleFacet} onClear={onClearFilters} />

      <div className={styles.body} ref={bodyRef}>
        <ColHeaders groupLabel={groupBy === 'stream' ? 'Work Stream' : 'Status'} showWorkStream={groupBy === 'status'} hideAssigneeLabel attrColumns={attrCols} containerRef={bodyRef} sort={sort} onSort={onSort} />

        {filteredItems.length === 0 ? (
          <EmptyState>
            {isFiltered ? 'No items match the current filters.' : 'No work items in this sprint yet.'}
          </EmptyState>
        ) : groupBy === 'stream' ? (
          <>
            {streamCols.map((col) => (
              <StreamSection
                key={col.ws.id}
                col={col}
                members={members}
                attrColumns={attrCols}
                sort={sort}
                sortCtx={sortCtx}
                onOpenItem={onOpenItem}
                onNavigateToStream={onNavigateToStream}
              />
            ))}
            {unassignedItems.length > 0 && (
              <div className={styles.section}>
                <div className={styles.sectionLeft}>
                  <span className={styles.sectionName} style={{ color: 'var(--rt-t3)', fontStyle: 'italic' }}>No stream</span>
                  <div className={styles.sectionMeta}>
                    {unassignedItems.length} item{unassignedItems.length !== 1 ? 's' : ''} · {sumPoints(unassignedItems)} pts
                  </div>
                </div>
                <div className={styles.sectionRight}>
                  {sortItems(unassignedItems, sort, sortCtx).map((it) => (
                    <ItemRow
                      key={it.id}
                      item={it}
                      members={members}
                      attrColumns={attrCols}
                      onOpen={() => onOpenItem(it.id)}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          orderedStatusCols.map((col) => (
            <StatusSection
              key={col.status}
              col={col}
              workStreams={r.workStreams}
              members={members}
              attrColumns={attrCols}
              sort={sort}
              sortCtx={sortCtx}
              onOpenItem={onOpenItem}
            />
          ))
        )}
      </div>
    </div>
  );
}
