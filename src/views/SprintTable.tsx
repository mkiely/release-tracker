import { Fragment, useRef } from 'react';
import type { GroupBy, SprintViewProps, StreamColumn, StatusColumn } from '../hooks/useSprintView';
import { isAnyFacetActive, type FacetGroup } from '../lib/facets';
import { itemColumnsDep, itemTableColumns, useFitColumns } from '../hooks/useFitColumns';
import { useColumnWidths } from '../hooks/useColumnWidths';
import { usePresentationMode } from '../store/presentationMode';
import { fmtShort } from '../lib/dates';
import { sumPoints } from '../lib/derive';
import { SprintTopActions, TopBar } from '../components/chrome';
import { avatarPalette, memberInitials } from '../components/Avatar';
import { Breadcrumb } from '../components/Breadcrumb';
import { EmptyState } from '../components/EmptyState';
import { EventBadge } from '../components/badges';
import { FilterChip, ClearFiltersButton } from '../components/FilterChip';
import { Icon } from '../components/Icon';
import { SprintRail } from '../components/dnd';
import { IconButton } from '../components/primitives';
import { TeamLink } from '../components/TeamLink';
import { statusVars } from '../components/statusVars';
import type { Member, Status } from '../types';
import { attributeColumns, type AttrColumn } from '../components/fields/columns';
import { ResizeHandle } from './ResizeHandle';
import { ItemRow } from './ItemRow';
import styles from './SprintTable.module.css';

// ── Helpers ───────────────────────────────────────────────────────────────

const TABLE_STATUS_ORDER: Status[] = ['In Progress', 'Under Review', 'Blocked', 'Not Started', 'Complete'];

// ── Sub-components ────────────────────────────────────────────────────────

function GroupToggle({ value, onChange }: { value: GroupBy; onChange: (v: GroupBy) => void }) {
  return (
    <div className={styles.groupToggle}>
      {(['stream', 'status'] as const).map((mode) => (
        <button
          key={mode}
          onClick={() => onChange(mode)}
          title={mode === 'stream' ? 'Group by work stream' : 'Group by status'}
          className={`${styles.groupBtn} ${value === mode ? styles.groupBtnActive : ''}`}
        >
          {mode === 'stream' ? 'By Stream' : 'By Status'}
        </button>
      ))}
    </div>
  );
}

function ColHeaders({
  groupBy,
  attrColumns,
  containerRef,
}: {
  groupBy: GroupBy;
  attrColumns: AttrColumn[];
  containerRef: React.RefObject<HTMLElement | null>;
}) {
  return (
    <div className={styles.colHeaders}>
      <div className={styles.colHeaderLeft}>
        <span className={styles.colHeaderLabel}>
          {groupBy === 'stream' ? 'Work Stream' : 'Status'}
        </span>
      </div>
      <div className={styles.colHeaderRight}>
        <div className={`${styles.colKey} ${styles.colHeaderLabel}`}>Key</div>
        <div className={`${styles.colType} ${styles.colHeaderLabel} ${styles.resizeTarget}`}>
          Type
          <ResizeHandle col="type" containerRef={containerRef} />
        </div>
        <div className={`${styles.colPts} ${styles.colHeaderLabel} ${styles.resizeTarget}`}>
          Pts
          <ResizeHandle col="pts" containerRef={containerRef} />
        </div>
        <div className={`${styles.colAssignee} ${styles.colHeaderLabel}`}></div>
        <div className={`${styles.colStatus} ${styles.colHeaderLabel}`}>Status</div>
        <div className={`${styles.colBuild} ${styles.colHeaderLabel} ${styles.resizeTarget}`}>
          Build
          <ResizeHandle col="build" containerRef={containerRef} />
        </div>
        {attrColumns.map((c) => (
          <div key={c.key} className={`${styles.colAttr} ${styles.colHeaderLabel} ${styles.resizeTarget}`}>
            {c.label}
            <ResizeHandle col="attr" containerRef={containerRef} />
          </div>
        ))}
        {groupBy === 'status' && (
          <div className={`${styles.colWorkStream} ${styles.colHeaderLabel} ${styles.resizeTarget}`}>
            Work Stream
            <ResizeHandle col="workstream" containerRef={containerRef} />
          </div>
        )}
        <div className={`${styles.colTitle} ${styles.colHeaderLabel}`}>Title</div>
      </div>
    </div>
  );
}

function StreamSection({
  col,
  members,
  attrColumns,
  onOpenItem,
  onNavigateToStream,
}: {
  col: StreamColumn;
  members: Member[];
  attrColumns: AttrColumn[];
  onOpenItem: (id: string) => void;
  onNavigateToStream: (wsId: string) => void;
}) {
  const pts = sumPoints(col.items);
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
          {col.items.length} item{col.items.length !== 1 ? 's' : ''} · {pts} pts
        </div>
      </div>
      <div className={styles.sectionRight}>
        {col.items.map((it) => (
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
  onOpenItem,
}: {
  col: StatusColumn;
  workStreams: SprintViewProps['release']['workStreams'];
  members: Member[];
  attrColumns: AttrColumn[];
  onOpenItem: (id: string) => void;
}) {
  const sv = statusVars(col.status);
  const pts = sumPoints(col.items);
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
          {col.items.length} item{col.items.length !== 1 ? 's' : ''} · {pts} pts
        </div>
      </div>
      <div className={styles.sectionRight}>
        {col.items.map((it) => {
          const ws = it.workStreamId
            ? workStreams.find((w) => w.id === it.workStreamId)
            : undefined;
          return (
            <ItemRow
              key={it.id}
              item={it}
              workStreamName={ws?.name ?? 'Unassigned'}
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

// ── Filter bar ────────────────────────────────────────────────────────────
// The table's labeled-group presentation of the generic facet groups — every
// facet (built-in and connector-declared) renders here with no per-field
// wiring. Member facets keep the leading-avatar chip style.

export function TableFacetBar<T>({
  groups,
  onToggle,
  onClear,
  trailing,
}: {
  groups: FacetGroup<T>[];
  onToggle: (facetKey: string, value: string) => void;
  onClear: () => void;
  /** Extra bar content after the facets (e.g. the backlog's group-by toggle). */
  trailing?: React.ReactNode;
}) {
  const visible = groups.filter((g) => g.visible);
  if (visible.length === 0 && !trailing) return null;
  const isFiltered = isAnyFacetActive(groups);
  return (
    <div className={styles.filterBar}>
      {visible.map((g, gi) => (
        <Fragment key={g.def.key}>
          {gi > 0 && <div className={styles.filterDivider} />}
          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>{g.def.label}</span>
            <div className={styles.filterChips}>
              {g.options.map((o) => {
                const active = g.selection.has(o.value);
                const title = active ? `Remove filter: ${o.label}` : `Filter: ${o.label}`;
                if (g.def.chip?.render === 'avatar') {
                  const pal = avatarPalette(o.value);
                  return (
                    <FilterChip
                      key={o.value}
                      active={active}
                      label={o.label.split(' ')[0]}
                      title={title}
                      onClick={() => onToggle(g.def.key, o.value)}
                      leading={
                        <span
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: '50%',
                            background: active ? pal.bg : 'var(--rt-fill)',
                            color: active ? pal.color : 'var(--rt-t3)',
                            fontSize: 'var(--rt-fs-micro)',
                            fontWeight: 'var(--rt-fw-bold)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          {memberInitials(o.label)}
                        </span>
                      }
                    />
                  );
                }
                return (
                  <FilterChip
                    key={o.value}
                    active={active}
                    vars={g.def.chip?.vars?.(o.value)}
                    dotShape={g.def.chip?.dotShape}
                    label={o.label}
                    title={title}
                    onClick={() => onToggle(g.def.key, o.value)}
                  />
                );
              })}
            </div>
          </div>
        </Fragment>
      ))}
      {isFiltered && (
        <div className={styles.filterClear}>
          <ClearFiltersButton onClick={onClear} />
        </div>
      )}
      {trailing && (
        <>
          {visible.length > 0 && <div className={styles.filterDivider} />}
          {trailing}
        </>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

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

  // status cols reordered for table view
  const orderedStatusCols = TABLE_STATUS_ORDER
    .map((s) => statusCols.find((c) => c.status === s)!)
    .filter((c) => c && c.items.length > 0);

  return (
    <div className="wf screen">
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
          <SprintTopActions
            release={r}
            onEditSprint={onEditSprint}
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
          {isActive && <span className={styles.activeBadge}>Active</span>}
        </div>
        <div className={styles.identityRight}>
          <div className={styles.identityMeta}>
            {team && (
              <>
                <TeamLink name={team.name} onClick={onOpenTeam} />
                <span className={styles.identityDot}>·</span>
              </>
            )}
            <span>{fmtShort(sp.startISO)} – {fmtShort(sp.endISO)}</span>
            <span className={styles.identityDot}>·</span>
            <span>{vel} pts capacity{pct < 100 ? ` (${pct}%)` : ''}</span>
            <span className={styles.identityDot}>·</span>
            <span>{sp.daysOff} person-day{sp.daysOff === 1 ? '' : 's'} off</span>
            <span className={styles.identityDot}>·</span>
            <span style={totalPts > vel ? { color: 'var(--rt-st-bl-text)', fontWeight: 'var(--rt-fw-bold)' } : undefined}>
              {sprintItemCount} items · {totalPts} pts planned
              {totalPts > vel ? ` · over by ${totalPts - vel}` : ''}
            </span>
            {evts.map((e) => (
              <EventBadge key={e.id} date={fmtShort(e.dateISO)} onClick={() => onOpenEvent(e.id)}>
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
        <ColHeaders groupBy={groupBy} attrColumns={attrCols} containerRef={bodyRef} />

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
                onOpenItem={onOpenItem}
                onNavigateToStream={onNavigateToStream}
              />
            ))}
            {unassignedItems.length > 0 && (
              <div className={styles.section}>
                <div className={styles.sectionLeft}>
                  <span className={styles.sectionName} style={{ color: 'var(--rt-t3)', fontStyle: 'italic' }}>Unassigned</span>
                  <div className={styles.sectionMeta}>
                    {unassignedItems.length} item{unassignedItems.length !== 1 ? 's' : ''} · {sumPoints(unassignedItems)} pts
                  </div>
                </div>
                <div className={styles.sectionRight}>
                  {unassignedItems.map((it) => (
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
              onOpenItem={onOpenItem}
            />
          ))
        )}
      </div>
    </div>
  );
}
