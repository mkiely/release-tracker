import { useRef } from 'react';
import type { RefObject } from 'react';
import type { BacklogViewProps } from '../hooks/useBacklogView';
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
import styles from './SprintTable.module.css';

// ── Sprint section (grouped mode) ─────────────────────────────────────────

function SprintSection({
  sp,
  isActive,
  items,
  members,
  attrColumns,
  onOpenItem,
}: {
  sp: Sprint;
  isActive: boolean;
  items: WorkItem[];
  members: Member[];
  attrColumns: AttrColumn[];
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
          <ItemRow key={it.id} item={it} members={members} attrColumns={attrColumns} onOpen={() => onOpenItem(it.id)} />
        ))}
      </div>
    </div>
  );
}

// ── Col headers ───────────────────────────────────────────────────────────

function ColHeaders({
  groupBySprint,
  attrColumns,
  containerRef,
}: {
  groupBySprint: boolean;
  attrColumns: AttrColumn[];
  containerRef: RefObject<HTMLElement | null>;
}) {
  const itemCols = (
    <>
      <div className={`${styles.colKey} ${styles.colHeaderLabel}`}>Key</div>
      <div className={`${styles.colType} ${styles.colHeaderLabel} ${styles.resizeTarget}`}>
        Type
        <ResizeHandle col="type" containerRef={containerRef} />
      </div>
      <div className={`${styles.colPts} ${styles.colHeaderLabel} ${styles.resizeTarget}`}>
        Pts
        <ResizeHandle col="pts" containerRef={containerRef} />
      </div>
      <div className={`${styles.colAssignee} ${styles.colHeaderLabel}`}>Assignee</div>
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
      {!groupBySprint && (
        <div className={`${styles.colSprint} ${styles.colHeaderLabel} ${styles.resizeTarget}`}>
          Sprint
          <ResizeHandle col="sprint" containerRef={containerRef} />
        </div>
      )}
      <div className={`${styles.colTitle} ${styles.colHeaderLabel}`}>Title</div>
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

export function BacklogView({
  release: r,
  team,
  filteredItems,
  activeSprintId,
  totalItemCount,
  totalPts,
  facetGroups,
  isFiltered,
  groupBySprint,
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
}: BacklogViewProps) {
  const members = team?.members ?? [];
  const attrCols = attributeColumns(r.catalog);

  const bodyRef = useRef<HTMLDivElement>(null);
  const presentation = usePresentationMode();
  useFitColumns(bodyRef, itemTableColumns(filteredItems), [itemColumnsDep(filteredItems), presentation]);
  useColumnWidths(bodyRef);

  // Grouped mode: sprint sections in release order + "No sprint" at the end
  const sprintSections = groupBySprint
    ? r.sprints
        .map((sp) => ({ sp, items: filteredItems.filter((i) => i.sprintId === sp.id) }))
        .filter((s) => s.items.length > 0)
    : [];
  const noSprintItems = groupBySprint ? filteredItems.filter((i) => i.sprintId === null) : [];

  // Flat mode: sprint name lookup for inline column
  const sprintById = new Map(r.sprints.map((sp) => [sp.id, sp.name]));

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
              { label: 'Backlog', icon: Icon.stream },
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
              ariaLabel="Group backlog by"
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
        <ColHeaders groupBySprint={groupBySprint} attrColumns={attrCols} containerRef={bodyRef} />

        {isEmpty ? (
          <EmptyState>
            {isFiltered ? 'No items match the current filters.' : 'No unassigned items — all work has been organized into streams.'}
          </EmptyState>
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
                    <ItemRow key={it.id} item={it} members={members} attrColumns={attrCols} onOpen={() => onOpenItem(it.id)} />
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className={styles.section} style={{ border: 'none' }}>
            <div className={styles.sectionRight} style={{ flex: 1 }}>
              {filteredItems.map((it) => (
                <ItemRow
                  key={it.id}
                  item={it}
                  members={members}
                  attrColumns={attrCols}
                  sprintName={it.sprintId ? (sprintById.get(it.sprintId) ?? '—') : 'No sprint'}
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
