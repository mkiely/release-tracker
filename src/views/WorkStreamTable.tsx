import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { WorkStreamViewProps } from '../hooks/useWorkStreamView';
import { itemColumnsDep, itemTableColumns, useFitColumns } from '../hooks/useFitColumns';
import { useColumnWidths } from '../hooks/useColumnWidths';
import { usePresentationMode } from '../store/presentationMode';
import type { Member, Sprint, WorkItem } from '../types';
import { fmtShort } from '../lib/dates';
import { streamCodeFreezeChip, sumPoints } from '../lib/derive';
import { NewItemButton, PushButton, SyncButton, TopBar } from '../components/chrome';
import { Breadcrumb } from '../components/Breadcrumb';
import { EmptyState } from '../components/EmptyState';
import { EventBadge } from '../components/badges';
import { Icon } from '../components/Icon';
import { Drag, useDrag, useDragAutoScroll } from '../components/dnd';
import { IconButton } from '../components/primitives';
import { TeamLink } from '../components/TeamLink';
import { StreamAttrSummary } from '../components/StreamAttrSummary';
import { statusVars } from '../components/statusVars';
import { TableFacetBar } from './SprintTable';
import { getActions } from '../store/store';
import { attributeColumns, type AttrColumn } from '../components/fields/columns';
import { ItemRow } from './ItemRow';
import { HeaderCell } from './HeaderCell';
import { sortItems, nextSort, type ItemSort, type SortCtx } from './itemSort';
import styles from './SprintTable.module.css';

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
    <div
      className={styles.section}
      data-over={over || undefined}
      style={over ? { background: 'var(--rt-fill)' } : undefined}
      onDragEnter={(e) => {
        const it = Drag.get();
        if (it && it.sprintId !== sp.id) {
          e.preventDefault();
          dragDepth.current += 1;
          if (!over) setOver(true);
        }
      }}
      onDragOver={(e) => {
        const it = Drag.get();
        if (it && it.sprintId !== sp.id) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          if (!over) setOver(true);
        }
      }}
      onDragLeave={() => {
        dragDepth.current -= 1;
        if (dragDepth.current <= 0) {
          dragDepth.current = 0;
          setOver(false);
        }
      }}
      onDrop={(e) => {
        const it = Drag.get();
        if (it && it.sprintId !== sp.id) {
          e.preventDefault();
          getActions().moveItemToSprint(it.id, sp.id);
          notify(`Moved ${it.key} → ${sp.name}`);
        }
        dragDepth.current = 0;
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
        {freezeChip && (
          <div style={{ marginTop: 4 }}>
            <EventBadge date={fmtShort(freezeChip.dateISO)} critical>
              {freezeChip.label}
            </EventBadge>
          </div>
        )}
      </div>
      <div className={styles.sectionRight}>
        {items.map((it) => (
          <ItemRow key={it.id} item={it} members={members} attrColumns={attrColumns} onOpen={() => onOpenItem(it.id)} />
        ))}
        {items.length === 0 && (
          <div className="card dash" style={{ padding: '9px 12px', color: 'var(--rt-t3)', fontSize: 'var(--rt-fs-sm)' }}>
            No items
          </div>
        )}
      </div>
    </div>
  );
}

// ── Column headers ────────────────────────────────────────────────────────

function ColHeaders({
  attrColumns,
  containerRef,
  sort,
  onSort,
}: {
  attrColumns: AttrColumn[];
  containerRef: RefObject<HTMLElement | null>;
  sort: ItemSort | null;
  onSort: (col: string) => void;
}) {
  const hp = { sort, onSort, containerRef };
  return (
    <div className={styles.colHeaders}>
      <div className={styles.colHeaderLeft}>
        <span className={styles.colHeaderLabel}>Sprint</span>
      </div>
      <div className={styles.colHeaderRight}>
        <HeaderCell {...hp} colClass={styles.colKey} label="Key" sortCol="key" />
        <HeaderCell {...hp} colClass={styles.colType} label="Type" sortCol="type" resizeCol="type" />
        <HeaderCell {...hp} colClass={styles.colPts} label="Pts" sortCol="pts" resizeCol="pts" />
        <HeaderCell {...hp} colClass={styles.colAssignee} label="Assignee" sortCol="assignee" />
        <HeaderCell {...hp} colClass={styles.colStatus} label="Status" sortCol="status" />
        <HeaderCell {...hp} colClass={styles.colBuild} label="Build" sortCol="build" resizeCol="build" />
        {attrColumns.map((c) => (
          <HeaderCell {...hp} key={c.key} colClass={styles.colAttr} label={c.label} sortCol={`attr:${c.key}`} resizeCol="attr" />
        ))}
        <HeaderCell {...hp} colClass={styles.colTitle} label="Title" sortCol="title" />
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
  facetGroups,
  isFiltered,
  onHome,
  onBack,
  onNewItem,
  onOpenItem,
  onToggleFacet,
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
    attrCell: (item, key) => attrCols.find((c) => c.key === key)?.cell(item) ?? '',
  };

  // Every release sprint gets a section — including ones with no items yet from
  // this stream — so each is a valid drop target (dragging in from another sprint
  // must be able to land on a currently-empty one, not just ones already populated).
  const sprintSections = r.sprints.map((sp) => ({ sp, items: filteredItems.filter((i) => i.sprintId === sp.id) }));

  const backlogItems = filteredItems.filter((i) => i.sprintId === null);

  return (
    <div className="wf screen">
      <TopBar
        left={<IconButton icon={Icon.chevLeft} title="Back" onClick={onBack} />}
        title={
          <>
            <Breadcrumb
              marginBottom={3}
              crumbs={[
                { label: 'Releases', icon: Icon.release, onClick: onHome },
                { label: r.name, onClick: onBack },
                { label: 'Work stream' },
              ]}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ display: 'inline-flex', color: 'var(--rt-t2)', flexShrink: 0 }}>{Icon.stream}</span>
              <span
                style={{
                  fontSize: 'var(--rt-fs-xl)',
                  fontWeight: 'var(--rt-fw-heading)',
                  letterSpacing: '-0.02em',
                  lineHeight: 1,
                  whiteSpace: 'nowrap',
                }}
              >
                {ws.name}
              </span>
              {ws.externalUrl && (
                <a
                  href={ws.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open this work stream in the external system (new tab)"
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 28, height: 28, flexShrink: 0,
                    color: 'var(--rt-accent)', borderRadius: 6,
                    border: '1.5px solid var(--rt-line)', background: 'var(--rt-fill)',
                  }}
                >
                  {Icon.external}
                </a>
              )}
              <StreamAttrSummary release={r} ws={ws} />
            </div>
          </>
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

      <TableFacetBar groups={facetGroups} onToggle={onToggleFacet} onClear={onClearFilters} />

      <div className={styles.body} ref={bodyRef}>
        <ColHeaders attrColumns={attrCols} containerRef={bodyRef} sort={sort} onSort={onSort} />

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
              <div className={styles.section}>
                <div className={styles.sectionLeft}>
                  <span className={styles.sectionName} style={{ color: 'var(--rt-t3)', fontStyle: 'italic' }}>No sprint</span>
                  <div className={styles.sectionMeta}>{backlogItems.length} item{backlogItems.length !== 1 ? 's' : ''}</div>
                </div>
                <div className={styles.sectionRight}>
                  {sortItems(backlogItems, sort, sortCtx).map((it) => (
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
