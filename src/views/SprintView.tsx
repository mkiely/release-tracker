import type { SprintViewProps, GroupBy } from '../hooks/useSprintView';
import { fmtShort } from '../lib/dates';
import { groupItemsByStream, sumPoints } from '../lib/derive';
import { SprintTopActions, TopBar } from '../components/chrome';
import { Breadcrumb } from '../components/Breadcrumb';
import { EmptyState } from '../components/EmptyState';
import { FacetBar } from '../components/FacetBar';
import { Icon } from '../components/Icon';
import { EventBadge, StatusPill } from '../components/badges';
import { SprintRail } from '../components/dnd';
import { WorkItemCard } from '../components/WorkItemCard';
import { IconButton } from '../components/primitives';
import { SegmentedToggle } from '../components/SegmentedToggle';
import { TeamLink } from '../components/TeamLink';
import sprintStyles from '../routes/Sprint.module.css';

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

export function SprintView({
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
                { label: 'Sprint' },
              ]}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={{ display: 'inline-flex', color: 'var(--rt-t2)', flexShrink: 0 }}>{Icon.sprint}</span>
              <span
                style={{
                  fontSize: 'var(--rt-fs-xl)',
                  fontWeight: 'var(--rt-fw-heading)',
                  letterSpacing: '-0.02em',
                  lineHeight: 1,
                  whiteSpace: 'nowrap',
                }}
              >
                {sp.name}
              </span>
              {isActive && <span className={sprintStyles.now}>Active</span>}
            </div>
          </>
        }
        sub={
          <>
            {team && (
              <>
                <TeamLink name={team.name} onClick={onOpenTeam} />
                <span style={{ opacity: 0.5 }}>·</span>
              </>
            )}
            <span>
              {fmtShort(sp.startISO)} – {fmtShort(sp.endISO)}
            </span>
            <span style={{ opacity: 0.5 }}>·</span>
            <span>
              {vel} pts capacity{pct < 100 ? ` (${pct}%)` : ''}
            </span>
            <span style={{ opacity: 0.5 }}>·</span>
            <span>
              {sp.daysOff} person-day{sp.daysOff === 1 ? '' : 's'} off
            </span>
            <span style={{ opacity: 0.5 }}>·</span>
            <span style={totalPts > vel ? { color: 'var(--rt-st-bl-text)', fontWeight: 'var(--rt-fw-bold)' } : undefined}>
              {sprintItemCount} items · {totalPts} pts planned
              {totalPts > vel ? ` · over by ${totalPts - vel}` : ''}
            </span>
          </>
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

      {evts.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 24px',
            borderBottom: `1.5px solid ${'var(--rt-line)'}`,
            background: 'var(--rt-paper)',
            flexWrap: 'wrap',
          }}
        >
          <span className="tag">Events</span>
          {evts.map((e) => (
            <EventBadge key={e.id} date={fmtShort(e.dateISO)} critical={e.critical} onClick={() => onOpenEvent(e.id)}>
              {e.label}
            </EventBadge>
          ))}
        </div>
      )}

      <SprintRail
        release={r}
        currentSprintId={sp.id}
        team={team}
        allItems={allItems}
        notify={notify}
        onGo={onGoToSprint}
      />

      {/* Filter bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '7px 24px',
          borderBottom: `1.5px solid ${'var(--rt-line)'}`,
          background: 'var(--rt-bg)',
          flexWrap: 'wrap',
        }}
      >
        <GroupToggle value={groupBy} onChange={onSetGroupBy} />
        <FacetBar groups={facetGroups} onToggle={onToggleFacet} onClear={onClearFilters} leadingDivider />
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '18px 24px' }}>
        {filteredItems.length === 0 ? (
          <EmptyState>
            {isFiltered ? 'No items match the current filters.' : 'No work items in this sprint yet.'}
          </EmptyState>
        ) : groupBy === 'stream' ? (
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            {streamCols.map((col) => (
              <div
                key={col.ws.id}
                style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}
              >
                <div
                  onClick={() => onNavigateToStream(col.ws.id)}
                  style={{ display: 'flex', alignItems: 'center', padding: '0 2px', cursor: 'pointer', gap: 8 }}
                >
                  <span
                    style={{
                      fontWeight: 'var(--rt-fw-heading)',
                      fontSize: 'var(--rt-fs-base)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      minWidth: 0,
                    }}
                  >
                    {col.ws.name}
                  </span>
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      marginLeft: 'auto',
                      flex: '0 0 auto',
                      color: 'var(--rt-t3)',
                    }}
                  >
                    <span className="mono" style={{ fontSize: 'var(--rt-fs-xs)', fontWeight: 'var(--rt-fw-bold)' }}>
                      {sumPoints(col.items)} pts
                    </span>
                    {Icon.chevRight}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {col.items.map((it) => (
                    <WorkItemCard
                      key={it.id}
                      it={it}
                      releaseTeamId={r.teamId}
                      draggable
                      onOpen={() => onOpenItem(it.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
            {unassignedItems.length > 0 && (
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', padding: '0 2px', gap: 8 }}>
                  <span style={{ fontWeight: 'var(--rt-fw-heading)', fontSize: 'var(--rt-fs-base)', color: 'var(--rt-t3)', fontStyle: 'italic' }}>
                    No stream
                  </span>
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      marginLeft: 'auto',
                      flex: '0 0 auto',
                      color: 'var(--rt-t3)',
                    }}
                  >
                    <span className="mono" style={{ fontSize: 'var(--rt-fs-xs)', fontWeight: 'var(--rt-fw-bold)' }}>
                      {sumPoints(unassignedItems)} pts
                    </span>
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {unassignedItems.map((it) => (
                    <WorkItemCard
                      key={it.id}
                      it={it}
                      releaseTeamId={r.teamId}
                      draggable
                      onOpen={() => onOpenItem(it.id)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 7, alignItems: 'stretch' }}>
            {statusCols.map((col, idx) => {
              const isLast = idx === statusCols.length - 1;
              return (
                <div
                  key={col.status}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    ...(isLast ? {} : { paddingRight: 7, borderRight: '1px solid var(--rt-line)' }),
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', padding: '0 2px', gap: 8 }}>
                    <StatusPill status={col.status} />
                    <span
                      className="mono"
                      style={{ fontSize: 'var(--rt-fs-xs)', fontWeight: 'var(--rt-fw-bold)', color: 'var(--rt-t3)', marginLeft: 'auto' }}
                    >
                      {sumPoints(col.items)} pts
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {groupItemsByStream(col.items, r.workStreams).map((grp) => (
                      <div
                        key={grp.wsId ?? '__unassigned__'}
                        style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 2px' }}>
                          <span
                            style={{
                              fontSize: 'var(--rt-fs-sm)',
                              fontWeight: 'var(--rt-fw-bold)',
                              color: grp.wsName ? 'var(--rt-t2)' : 'var(--rt-t3)',
                              fontStyle: grp.wsName ? undefined : 'italic',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {grp.wsName ?? 'No stream'}
                          </span>
                          <span className="mono" style={{ fontSize: 'var(--rt-fs-xs)', color: 'var(--rt-t3)', flex: '0 0 auto' }}>
                            {sumPoints(grp.items)} pts
                          </span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                          {grp.items.map((it) => (
                            <WorkItemCard
                              key={it.id}
                              it={it}
                              releaseTeamId={r.teamId}
                              draggable
                              onOpen={() => onOpenItem(it.id)}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
