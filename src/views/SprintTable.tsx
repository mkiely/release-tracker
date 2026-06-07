import type { GroupBy, SprintViewProps, StreamColumn, StatusColumn } from '../hooks/useSprintView';
import { fmtShort } from '../lib/dates';
import { PushButton, SyncButton, TopBar } from '../components/chrome';
import { Icon } from '../components/Icon';
import { EventBadge } from '../components/badges';
import { Drag, SprintRail, setDragGhost, useDrag } from '../components/dnd';
import { IconButton, PButton } from '../components/primitives';
import { TeamLink } from '../components/TeamLink';
import { statusVars } from '../components/statusVars';
import { STATUSES, type Member, type Status } from '../types';
import styles from './SprintTable.module.css';

// ── Helpers ───────────────────────────────────────────────────────────────

const TABLE_STATUS_ORDER: Status[] = ['In Progress', 'Under Review', 'Blocked', 'Not Started', 'Complete'];

const AVATAR_PALETTES = [
  { bg: 'var(--rt-st-ac-soft)', color: 'var(--rt-st-ac-text)' },
  { bg: 'var(--rt-st-co-soft)', color: 'var(--rt-st-co-text)' },
  { bg: 'var(--rt-st-ur-soft)', color: 'var(--rt-st-ur-text)' },
  { bg: 'var(--rt-st-bl-soft)', color: 'var(--rt-st-bl-text)' },
  { bg: 'var(--rt-st-ns-soft)', color: 'var(--rt-st-ns-text)' },
];

function avatarPalette(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0;
  return AVATAR_PALETTES[Math.abs(h) % AVATAR_PALETTES.length];
}

function memberInitials(name: string): string {
  return name.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

function typeVars(label: string | undefined) {
  if (!label) return statusVars('Not Started');
  if (label === 'Bug') return statusVars('Blocked');
  if (label === 'User Story' || label === 'Story') return statusVars('In Progress');
  if (label === 'Investigation') return statusVars('Under Review');
  return statusVars('Not Started');
}

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

function Avatar({ member }: { member: Member }) {
  const pal = avatarPalette(member.id);
  return (
    <div
      className={styles.avatar}
      title={member.name}
      style={{ background: pal.bg, color: pal.color }}
    >
      {memberInitials(member.name)}
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
        {groupBy === 'status' && (
          <div className={`${styles.colWorkStream} ${styles.colHeaderLabel}`}>Work Stream</div>
        )}
        <div className={`${styles.colTitle} ${styles.colHeaderLabel}`}>Title</div>
      </div>
    </div>
  );
}

function ItemRow({
  item,
  workStreamName,
  members,
  onOpen,
}: {
  item: SprintViewProps['filteredItems'][0];
  workStreamName?: string;
  members: Member[];
  onOpen: () => void;
}) {
  const assignee = item.assignedMemberId
    ? members.find((m) => m.id === item.assignedMemberId)
    : undefined;
  const tv = typeVars(item.itemType?.label);
  const sv = statusVars(item.status);
  const dragging = useDrag();
  const isMe = dragging?.id === item.id;

  return (
    <div className={styles.itemRow} onClick={onOpen} style={isMe ? { opacity: 0.4 } : undefined}>
      <div
        className={styles.colKey}
        draggable
        style={{ cursor: 'grab', userSelect: 'none', WebkitUserSelect: 'none' }}
        onDragStart={(e) => {
          e.stopPropagation();
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', item.id);
          setDragGhost(e, item.key);
          Drag.start(item);
        }}
        onDragEnd={() => Drag.end()}
      >
        {item.key}
      </div>
      <div className={styles.colType}>
        {item.itemType && (
          <span
            className={styles.typeChip}
            style={{ borderColor: tv.dot, color: tv.text, background: tv.soft }}
          >
            {item.itemType.label}
          </span>
        )}
      </div>
      <div className={styles.colPts}>{item.points > 0 ? item.points : ''}</div>
      <div className={styles.colAssignee}>
        {assignee && <Avatar member={assignee} />}
      </div>
      <div className={styles.colStatus}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '1px 7px 1px 6px',
            borderRadius: 20,
            background: sv.soft,
            color: sv.text,
            fontSize: 'var(--rt-fs-xs)',
            fontWeight: 'var(--rt-fw-semibold)',
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: sv.dot, flexShrink: 0 }} />
          {item.status}
        </span>
      </div>
      {workStreamName !== undefined && (
        <div className={styles.colWorkStream}>{workStreamName}</div>
      )}
      <div className={styles.colTitle}>{item.subject}</div>
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
  const pts = col.items.reduce((a, i) => a + i.points, 0);
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
  const pts = col.items.reduce((a, i) => a + i.points, 0);
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
              {sprintTypes.map((t) => {
                const active = typeFilter.has(t);
                const tv = typeVars(t);
                return (
                  <button
                    key={t}
                    onClick={() => onToggleType(t)}
                    title={active ? `Remove filter: ${t}` : `Filter: ${t}`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      padding: '2px 9px 2px 7px',
                      borderRadius: 20,
                      border: `1.5px solid ${active ? tv.dot : 'var(--rt-line)'}`,
                      background: active ? tv.soft : 'transparent',
                      color: active ? tv.text : 'var(--rt-t3)',
                      cursor: 'pointer',
                      fontSize: 'var(--rt-fs-xs)',
                      fontWeight: active ? 700 : 500,
                      fontFamily: 'var(--rt-sans)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: active ? tv.dot : 'var(--rt-t3)', flexShrink: 0 }} />
                    {t}
                  </button>
                );
              })}
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
                  <button
                    key={m.id}
                    title={active ? `Hide ${m.name}` : `Filter: ${m.name}`}
                    onClick={() => onToggleMember(m.id)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      padding: '2px 9px 2px 5px',
                      borderRadius: 20,
                      border: `1.5px solid ${active ? 'var(--rt-ink)' : 'var(--rt-line)'}`,
                      background: active ? 'var(--rt-fill)' : 'transparent',
                      color: active ? 'var(--rt-ink)' : 'var(--rt-t3)',
                      cursor: 'pointer',
                      fontSize: 'var(--rt-fs-xs)',
                      fontWeight: active ? 700 : 500,
                      fontFamily: 'var(--rt-sans)',
                      whiteSpace: 'nowrap',
                    }}
                  >
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
                    {m.name.split(' ')[0]}
                  </button>
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
          {STATUSES.map((s) => {
            const active = statusFilter.has(s);
            const sv = statusVars(s);
            return (
              <button
                key={s}
                onClick={() => onToggleStatus(s)}
                title={active ? `Remove filter: ${s}` : `Filter: ${s}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '2px 9px 2px 7px',
                  borderRadius: 20,
                  border: `1.5px solid ${active ? sv.dot : 'var(--rt-line)'}`,
                  background: active ? sv.soft : 'transparent',
                  color: active ? sv.text : 'var(--rt-t3)',
                  cursor: 'pointer',
                  fontSize: 'var(--rt-fs-xs)',
                  fontWeight: active ? 700 : 500,
                  fontFamily: 'var(--rt-sans)',
                  whiteSpace: 'nowrap',
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: active ? sv.dot : 'var(--rt-t3)', flexShrink: 0 }} />
                {s}
              </button>
            );
          })}
        </div>
      </div>

      {isFiltered && (
        <div className={styles.filterClear}>
          <button className={styles.clearBtn} onClick={onClearFilters} title="Clear all filters">
            Clear
          </button>
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
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              fontSize: 'var(--rt-fs-sm)',
              color: 'var(--rt-t3)',
              whiteSpace: 'nowrap',
            }}
          >
            <span onClick={onHome} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              {Icon.release}Releases
            </span>
            {Icon.chevRight}
            <span onClick={onBack} style={{ cursor: 'pointer' }}>
              {r.name}
            </span>
            {Icon.chevRight}
            <span style={{ fontWeight: 'var(--rt-fw-semibold)', color: 'var(--rt-t2)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              {Icon.sprint}{sp.name}
            </span>
          </div>
        }
        right={
          <>
            {r.connector ? (
              <PButton variant="subtle" sm icon={Icon.cal} onClick={onEditSprint}>
                Days off
              </PButton>
            ) : (
              <PButton variant="subtle" sm icon={Icon.sprint} onClick={onEditSprint}>
                Edit sprint
              </PButton>
            )}
            <PushButton release={r} onPush={onPush} />
            <SyncButton release={r} onSync={onSync} />
            <PButton
              sm
              icon={Icon.item}
              disabled={!!r.connector}
              title={r.connector ? 'Work items are managed by the connector' : undefined}
              onClick={onNewItem}
            >
              New work item
            </PButton>
          </>
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
          <div className={`card dash ${styles.empty}`}>
            {isFiltered ? 'No items match the current filters.' : 'No work items in this sprint yet.'}
          </div>
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
