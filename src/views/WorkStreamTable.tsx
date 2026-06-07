import { useState } from 'react';
import type { WorkStreamViewProps } from '../hooks/useWorkStreamView';
import type { Member, Sprint, WorkItem } from '../types';
import { STATUSES } from '../types';
import { fmtShort } from '../lib/dates';
import { PushButton, SyncButton, TopBar } from '../components/chrome';
import { Icon } from '../components/Icon';
import { Drag, setDragGhost, useDrag } from '../components/dnd';
import { IconButton, PButton } from '../components/primitives';
import { TeamLink } from '../components/TeamLink';
import { statusVars } from '../components/statusVars';
import { getActions } from '../store/store';
import styles from './SprintTable.module.css';

// ── Helpers (shared with SprintTable) ─────────────────────────────────────

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

// ── Item row ──────────────────────────────────────────────────────────────

function ItemRow({
  item,
  members,
  onOpen,
}: {
  item: WorkItem;
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
        style={{ cursor: 'grab' }}
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
        {assignee && (
          <div
            className={styles.avatar}
            title={assignee.name}
            style={{ background: avatarPalette(assignee.id).bg, color: avatarPalette(assignee.id).color }}
          >
            {memberInitials(assignee.name)}
          </div>
        )}
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
      <div className={styles.colTitle}>{item.subject}</div>
    </div>
  );
}

// ── Sprint section ────────────────────────────────────────────────────────

function SprintSection({
  sp,
  isActive,
  items,
  members,
  notify,
  onOpenItem,
}: {
  sp: Sprint;
  isActive: boolean;
  items: WorkItem[];
  members: Member[];
  notify: (msg: string) => void;
  onOpenItem: (id: string) => void;
}) {
  const pts = items.reduce((a, i) => a + i.points, 0);
  const sv = statusVars('In Progress');
  const draggingItem = useDrag();
  const [over, setOver] = useState(false);
  const canDrop = !!draggingItem && draggingItem.sprintId !== sp.id;

  return (
    <div
      className={styles.section}
      data-over={over || undefined}
      style={over ? { background: 'var(--rt-fill)' } : undefined}
      onDragOver={(e) => {
        const it = Drag.get();
        if (it && it.sprintId !== sp.id) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          if (!over) setOver(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false);
      }}
      onDrop={(e) => {
        const it = Drag.get();
        if (it && it.sprintId !== sp.id) {
          e.preventDefault();
          getActions().updateItem(it.id, { sprintId: sp.id });
          notify(`Moved ${it.key} → ${sp.name}`);
        }
        setOver(false);
        Drag.end();
      }}
    >
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
        {canDrop && (
          <div style={{ marginTop: 4, fontSize: 'var(--rt-fs-micro)', fontWeight: 'var(--rt-fw-bold)', color: over ? 'var(--rt-st-ac-text)' : 'var(--rt-t3)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            {over ? 'Drop to move here' : 'Drop to reassign'}
          </div>
        )}
      </div>
      <div className={styles.sectionRight}>
        {items.map((it) => (
          <ItemRow key={it.id} item={it} members={members} onOpen={() => onOpenItem(it.id)} />
        ))}
      </div>
    </div>
  );
}

// ── Filter bar ────────────────────────────────────────────────────────────

function FilterBar({
  streamTypes,
  statusFilter,
  typeFilter,
  isFiltered,
  onToggleStatus,
  onToggleType,
  onClearFilters,
}: Pick<
  WorkStreamViewProps,
  'streamTypes' | 'statusFilter' | 'typeFilter' | 'isFiltered'
  | 'onToggleStatus' | 'onToggleType' | 'onClearFilters'
>) {
  return (
    <div className={styles.filterBar}>
      {streamTypes.length > 0 && (
        <>
          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>Type</span>
            <div className={styles.filterChips}>
              {streamTypes.map((t) => {
                const active = typeFilter.has(t);
                const tv = typeVars(t);
                return (
                  <button
                    key={t}
                    onClick={() => onToggleType(t)}
                    title={active ? `Remove filter: ${t}` : `Filter: ${t}`}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '2px 9px 2px 7px', borderRadius: 20,
                      border: `1.5px solid ${active ? tv.dot : 'var(--rt-line)'}`,
                      background: active ? tv.soft : 'transparent',
                      color: active ? tv.text : 'var(--rt-t3)',
                      cursor: 'pointer', fontSize: 'var(--rt-fs-xs)',
                      fontWeight: active ? 700 : 500, fontFamily: 'var(--rt-sans)', whiteSpace: 'nowrap',
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
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '2px 9px 2px 7px', borderRadius: 20,
                  border: `1.5px solid ${active ? sv.dot : 'var(--rt-line)'}`,
                  background: active ? sv.soft : 'transparent',
                  color: active ? sv.text : 'var(--rt-t3)',
                  cursor: 'pointer', fontSize: 'var(--rt-fs-xs)',
                  fontWeight: active ? 700 : 500, fontFamily: 'var(--rt-sans)', whiteSpace: 'nowrap',
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

// ── Column headers ────────────────────────────────────────────────────────

function ColHeaders() {
  return (
    <div className={styles.colHeaders}>
      <div className={styles.colHeaderLeft}>
        <span className={styles.colHeaderLabel}>Sprint</span>
      </div>
      <div className={styles.colHeaderRight}>
        <div className={`${styles.colKey} ${styles.colHeaderLabel}`}>Key</div>
        <div className={`${styles.colType} ${styles.colHeaderLabel}`}>Type</div>
        <div className={`${styles.colPts} ${styles.colHeaderLabel}`}>Pts</div>
        <div className={`${styles.colAssignee} ${styles.colHeaderLabel}`}>Assignee</div>
        <div className={`${styles.colStatus} ${styles.colHeaderLabel}`}>Status</div>
        <div className={`${styles.colTitle} ${styles.colHeaderLabel}`}>Title</div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export function WorkStreamTable({
  release: r,
  workStream: ws,
  team,
  onOpenTeam,
  filteredItems,
  activeSprintId,
  totalItemCount,
  totalPts,
  streamTypes,
  statusFilter,
  typeFilter,
  isFiltered,
  onBack,
  onNewItem,
  onOpenItem,
  onToggleStatus,
  onToggleType,
  onClearFilters,
  onSync,
  onPush,
  notify,
}: WorkStreamViewProps) {
  const members = team?.members ?? [];

  const sprintSections = r.sprints
    .map((sp) => ({ sp, items: filteredItems.filter((i) => i.sprintId === sp.id) }))
    .filter((s) => s.items.length > 0);

  const backlogItems = filteredItems.filter((i) => i.sprintId === null);

  return (
    <div className="wf screen">
      <TopBar
        left={<IconButton icon={Icon.chevLeft} title="Back" onClick={onBack} />}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 'var(--rt-fs-sm)', color: 'var(--rt-t3)', whiteSpace: 'nowrap' }}>
            <span onClick={onBack} style={{ cursor: 'pointer' }}>{r.name}</span>
            {Icon.chevRight}
            <span style={{ fontWeight: 'var(--rt-fw-semibold)', color: 'var(--rt-t2)' }}>{ws.name}</span>
          </div>
        }
        sub={team ? <TeamLink name={team.name} onClick={onOpenTeam} /> : undefined}
        right={
          <>
            <span style={{ fontSize: 'var(--rt-fs-sm)', color: 'var(--rt-t3)' }}>
              {totalItemCount} items · {totalPts} pts
            </span>
            <PushButton release={r} onPush={onPush} />
            <SyncButton release={r} onSync={onSync} />
            <PButton
              sm
              icon={Icon.plus}
              disabled={!!r.connector}
              title={r.connector ? 'Work items are managed by the connector' : undefined}
              onClick={onNewItem}
            >
              New work item
            </PButton>
          </>
        }
      />

      <FilterBar
        streamTypes={streamTypes}
        statusFilter={statusFilter}
        typeFilter={typeFilter}
        isFiltered={isFiltered}
        onToggleStatus={onToggleStatus}
        onToggleType={onToggleType}
        onClearFilters={onClearFilters}
      />

      <div className={styles.body}>
        <ColHeaders />

        {filteredItems.length === 0 ? (
          <div className={`card dash ${styles.empty}`}>
            {isFiltered ? 'No items match the current filters.' : 'No work items yet. Create one to get started.'}
          </div>
        ) : (
          <>
            {sprintSections.map(({ sp, items }) => (
              <SprintSection
                key={sp.id}
                sp={sp}
                isActive={sp.id === activeSprintId}
                items={items}
                members={members}
                notify={notify}
                onOpenItem={onOpenItem}
              />
            ))}
            {backlogItems.length > 0 && (
              <div className={styles.section}>
                <div className={styles.sectionLeft}>
                  <span className={styles.sectionName} style={{ color: 'var(--rt-t3)', fontStyle: 'italic' }}>Backlog</span>
                  <div className={styles.sectionMeta}>{backlogItems.length} item{backlogItems.length !== 1 ? 's' : ''}</div>
                </div>
                <div className={styles.sectionRight}>
                  {backlogItems.map((it) => (
                    <ItemRow key={it.id} item={it} members={members} onOpen={() => onOpenItem(it.id)} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
