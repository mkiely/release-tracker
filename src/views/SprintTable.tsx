import type { GroupBy, SprintViewProps, StreamColumn, StatusColumn } from '../hooks/useSprintView';
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
import { statusVars, typeVars } from '../components/statusVars';
import { STATUSES, type Member, type Status } from '../types';
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

function ColHeaders({ groupBy }: { groupBy: GroupBy }) {
  return (
    <div className={styles.colHeaders}>
      <div className={styles.colHeaderLeft}>
        <span className={styles.colHeaderLabel}>
          {groupBy === 'stream' ? 'Work Stream' : 'Status'}
        </span>
      </div>
      <div className={styles.colHeaderRight}>
        <div className={`${styles.colKey} ${styles.colHeaderLabel}`}>Key</div>
        <div className={`${styles.colType} ${styles.colHeaderLabel}`}>Type</div>
        <div className={`${styles.colPts} ${styles.colHeaderLabel}`}>Pts</div>
        <div className={`${styles.colAssignee} ${styles.colHeaderLabel}`}></div>
        <div className={`${styles.colStatus} ${styles.colHeaderLabel}`}>Status</div>
        <div className={`${styles.colBuild} ${styles.colHeaderLabel}`}>Build</div>
        {groupBy === 'status' && (
          <div className={`${styles.colWorkStream} ${styles.colHeaderLabel}`}>Work Stream</div>
        )}
        <div className={`${styles.colTitle} ${styles.colHeaderLabel}`}>Title</div>
      </div>
    </div>
  );
}

function StreamSection({
  col,
  members,
  onOpenItem,
  onNavigateToStream,
}: {
  col: StreamColumn;
  members: Member[];
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
  onOpenItem,
}: {
  col: StatusColumn;
  workStreams: SprintViewProps['release']['workStreams'];
  members: Member[];
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
              onOpen={() => onOpenItem(it.id)}
            />
          );
        })}
      </div>
    </div>
  );
}

// ── Filter bar ────────────────────────────────────────────────────────────

function FilterBar({
  sprintTypes,
  sprintMembers,
  memberFilter,
  statusFilter,
  typeFilter,
  isFiltered,
  onToggleMember,
  onToggleStatus,
  onToggleType,
  onClearFilters,
}: Pick<
  SprintViewProps,
  | 'sprintTypes'
  | 'sprintMembers'
  | 'memberFilter'
  | 'statusFilter'
  | 'typeFilter'
  | 'isFiltered'
  | 'onToggleMember'
  | 'onToggleStatus'
  | 'onToggleType'
  | 'onClearFilters'
>) {
  return (
    <div className={styles.filterBar}>
      {/* Type */}
      {sprintTypes.length > 0 && (
        <>
          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>Type</span>
            <div className={styles.filterChips}>
              {sprintTypes.map((t) => (
                <FilterChip
                  key={t}
                  active={typeFilter.has(t)}
                  vars={typeVars(t)}
                  label={t}
                  title={typeFilter.has(t) ? `Remove filter: ${t}` : `Filter: ${t}`}
                  onClick={() => onToggleType(t)}
                />
              ))}
            </div>
          </div>
          <div className={styles.filterDivider} />
        </>
      )}

      {/* Assignee */}
      {sprintMembers.length > 0 && (
        <>
          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>Assignee</span>
            <div className={styles.filterChips}>
              {sprintMembers.map((m) => {
                const active = memberFilter.has(m.id);
                const pal = avatarPalette(m.id);
                return (
                  <FilterChip
                    key={m.id}
                    active={active}
                    label={m.name.split(' ')[0]}
                    title={active ? `Hide ${m.name}` : `Filter: ${m.name}`}
                    onClick={() => onToggleMember(m.id)}
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
                        {memberInitials(m.name)}
                      </span>
                    }
                  />
                );
              })}
            </div>
          </div>
          <div className={styles.filterDivider} />
        </>
      )}

      {/* Status */}
      <div className={styles.filterGroup}>
        <span className={styles.filterLabel}>Status</span>
        <div className={styles.filterChips}>
          {STATUSES.map((s) => (
            <FilterChip
              key={s}
              active={statusFilter.has(s)}
              vars={statusVars(s)}
              label={s}
              title={statusFilter.has(s) ? `Remove filter: ${s}` : `Filter: ${s}`}
              onClick={() => onToggleStatus(s)}
            />
          ))}
        </div>
      </div>

      {isFiltered && (
        <div className={styles.filterClear}>
          <ClearFiltersButton onClick={onClearFilters} />
        </div>
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
  statusCols,
  sprintMembers,
  sprintTypes,
  groupBy,
  memberFilter,
  statusFilter,
  typeFilter,
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
  onToggleMember,
  onToggleStatus,
  onToggleType,
  onClearFilters,
  onSync,
  onPush,
  notify,
}: SprintViewProps) {
  const members = team?.members ?? [];

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

      <FilterBar
        sprintTypes={sprintTypes}
        sprintMembers={sprintMembers}
        memberFilter={memberFilter}
        statusFilter={statusFilter}
        typeFilter={typeFilter}
        isFiltered={isFiltered}
        onToggleMember={onToggleMember}
        onToggleStatus={onToggleStatus}
        onToggleType={onToggleType}
        onClearFilters={onClearFilters}
      />

      <div className={styles.body}>
        <ColHeaders groupBy={groupBy} />

        {filteredItems.length === 0 ? (
          <EmptyState>
            {isFiltered ? 'No items match the current filters.' : 'No work items in this sprint yet.'}
          </EmptyState>
        ) : groupBy === 'stream' ? (
          streamCols.map((col) => (
            <StreamSection
              key={col.ws.id}
              col={col}
              members={members}
              onOpenItem={onOpenItem}
              onNavigateToStream={onNavigateToStream}
            />
          ))
        ) : (
          orderedStatusCols.map((col) => (
            <StatusSection
              key={col.status}
              col={col}
              workStreams={r.workStreams}
              members={members}
              onOpenItem={onOpenItem}
            />
          ))
        )}
      </div>
    </div>
  );
}
