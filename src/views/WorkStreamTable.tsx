import { useRef, useState } from 'react';
import type { WorkStreamViewProps } from '../hooks/useWorkStreamView';
import { itemColumnsDep, itemTableColumns, useFitColumns } from '../hooks/useFitColumns';
import { usePresentationMode } from '../store/presentationMode';
import type { Member, Sprint, WorkItem } from '../types';
import { STATUSES } from '../types';
import { fmtShort } from '../lib/dates';
import { sumPoints } from '../lib/derive';
import { NewItemButton, PushButton, SyncButton, TopBar } from '../components/chrome';
import { Breadcrumb } from '../components/Breadcrumb';
import { EmptyState } from '../components/EmptyState';
import { FilterChip, ClearFiltersButton } from '../components/FilterChip';
import { Icon } from '../components/Icon';
import { Drag, useDrag } from '../components/dnd';
import { IconButton } from '../components/primitives';
import { TeamLink } from '../components/TeamLink';
import { statusVars, typeVars } from '../components/statusVars';
import { getActions } from '../store/store';
import { attributeColumns, type AttrColumn } from '../components/fields/columns';
import { ItemRow } from './ItemRow';
import styles from './SprintTable.module.css';

// ── Sprint section ────────────────────────────────────────────────────────

function SprintSection({
  sp,
  isActive,
  items,
  members,
  attrColumns,
  notify,
  onOpenItem,
}: {
  sp: Sprint;
  isActive: boolean;
  items: WorkItem[];
  members: Member[];
  attrColumns: AttrColumn[];
  notify: (msg: string) => void;
  onOpenItem: (id: string) => void;
}) {
  const pts = sumPoints(items);
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
          getActions().moveItemToSprint(it.id, sp.id);
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
          <ItemRow key={it.id} item={it} members={members} attrColumns={attrColumns} onOpen={() => onOpenItem(it.id)} />
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
              {streamTypes.map((t) => (
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

// ── Column headers ────────────────────────────────────────────────────────

function ColHeaders({ attrColumns }: { attrColumns: AttrColumn[] }) {
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
        <div className={`${styles.colBuild} ${styles.colHeaderLabel}`}>Build</div>
        {attrColumns.map((c) => (
          <div key={c.key} className={`${styles.colAttr} ${styles.colHeaderLabel}`}>{c.label}</div>
        ))}
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
  onHome,
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
  // Vocabulary columns declared by the connector's catalog snapshot (none for local releases).
  const attrCols = attributeColumns(r.catalog);

  // Fit the Key/Status columns to their content (re-measured when the item set
  // or the presentation-mode type scale changes).
  const bodyRef = useRef<HTMLDivElement>(null);
  const presentation = usePresentationMode();
  useFitColumns(bodyRef, itemTableColumns(filteredItems), [itemColumnsDep(filteredItems), presentation]);

  const sprintSections = r.sprints
    .map((sp) => ({ sp, items: filteredItems.filter((i) => i.sprintId === sp.id) }))
    .filter((s) => s.items.length > 0);

  const backlogItems = filteredItems.filter((i) => i.sprintId === null);

  return (
    <div className="wf screen">
      <TopBar
        left={<IconButton icon={Icon.chevLeft} title="Back" onClick={onBack} />}
        title={
          <Breadcrumb
            crumbs={[
              { label: 'Releases', icon: Icon.release, onClick: onHome },
              { label: r.name, onClick: onBack },
              { label: ws.name, icon: Icon.stream },
            ]}
          />
        }
        sub={team ? <TeamLink name={team.name} onClick={onOpenTeam} /> : undefined}
        right={
          <>
            <span style={{ fontSize: 'var(--rt-fs-sm)', color: 'var(--rt-t3)' }}>
              {totalItemCount} items · {totalPts} pts
            </span>
            <PushButton release={r} onPush={onPush} />
            <SyncButton release={r} onSync={onSync} />
            <NewItemButton release={r} onClick={onNewItem} icon={Icon.plus} />
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

      <div className={styles.body} ref={bodyRef}>
        <ColHeaders attrColumns={attrCols} />

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
                    <ItemRow key={it.id} item={it} members={members} attrColumns={attrCols} onOpen={() => onOpenItem(it.id)} />
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
