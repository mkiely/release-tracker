import type { SprintViewProps, GroupBy } from '../hooks/useSprintView';
import { fmtShort } from '../lib/dates';
import { groupItemsByStream, sumPoints } from '../lib/derive';
import { SprintTopActions, TopBar } from '../components/chrome';
import { Breadcrumb } from '../components/Breadcrumb';
import { EmptyState } from '../components/EmptyState';
import { FilterChip, ClearFiltersButton } from '../components/FilterChip';
import { Icon } from '../components/Icon';
import { EventBadge, StatusPill } from '../components/badges';
import { memberInitials } from '../components/Avatar';
import { SprintRail } from '../components/dnd';
import { WorkItemCard } from '../components/WorkItemCard';
import { IconButton } from '../components/primitives';
import { SegmentedToggle } from '../components/SegmentedToggle';
import { TeamLink } from '../components/TeamLink';
import { VDivider } from '../components/VDivider';
import { statusVars } from '../components/statusVars';
import { STATUSES } from '../types';
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
  sprintMembers,
  sprintTypes,
  sprintBuilds,
  groupBy,
  memberFilter,
  statusFilter,
  typeFilter,
  buildFilter,
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
  onToggleBuild,
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
            <EventBadge key={e.id} date={fmtShort(e.dateISO)} onClick={() => onOpenEvent(e.id)}>
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
        <VDivider />

        {sprintMembers.map((m) => {
          const isMemberActive = memberFilter.has(m.id);
          return (
            <button
              key={m.id}
              title={isMemberActive ? `Hide ${m.name}` : `Filter: ${m.name}`}
              onClick={() => onToggleMember(m.id)}
              style={{
                width: 26,
                height: 26,
                borderRadius: '50%',
                border: isMemberActive ? `2px solid ${'var(--rt-ink)'}` : `1.5px solid ${'var(--rt-line)'}`,
                background: isMemberActive ? 'var(--rt-fill)' : 'transparent',
                cursor: 'pointer',
                fontSize: 'var(--rt-fs-micro)',
                fontWeight: 'var(--rt-fw-bold)',
                color: isMemberActive ? 'var(--rt-ink)' : 'var(--rt-t3)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                fontFamily: 'var(--rt-sans)',
              }}
            >
              {memberInitials(m.name)}
            </button>
          );
        })}

        {sprintMembers.length > 0 && <VDivider />}

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

        {sprintTypes.length > 0 && (
          <>
            <VDivider />
            {sprintTypes.map((t) => (
              <FilterChip
                key={t}
                active={typeFilter.has(t)}
                label={t}
                title={typeFilter.has(t) ? `Remove filter: ${t}` : `Filter: ${t}`}
                onClick={() => onToggleType(t)}
              />
            ))}
          </>
        )}

        {sprintBuilds.length > 0 && (
          <>
            <VDivider />
            {sprintBuilds.map((b) => (
              <FilterChip
                key={b}
                active={buildFilter.has(b)}
                dotShape="square"
                label={b}
                title={buildFilter.has(b) ? `Remove filter: ${b}` : `Filter: ${b}`}
                onClick={() => onToggleBuild(b)}
              />
            ))}
          </>
        )}

        {isFiltered && (
          <>
            <VDivider />
            <ClearFiltersButton onClick={onClearFilters} title="Clear all filters" />
          </>
        )}
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
                    Unassigned
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
                            {grp.wsName ?? 'Unassigned'}
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
