import type { WorkStreamViewProps } from '../hooks/useWorkStreamView';
import { NewItemButton, PushButton, SyncButton, TopBar } from '../components/chrome';
import { ShareButton } from '../components/ShareButton';
import { Breadcrumb } from '../components/Breadcrumb';
import { EmptyState } from '../components/EmptyState';
import { FilterChip, ClearFiltersButton } from '../components/FilterChip';
import { Icon } from '../components/Icon';
import { StreamSprintColumn } from '../components/dnd';
import { WorkItemCard } from '../components/WorkItemCard';
import { IconButton } from '../components/primitives';
import { TeamLink } from '../components/TeamLink';
import { VDivider } from '../components/VDivider';
import { statusVars } from '../components/statusVars';
import { STATUSES } from '../types';

export function WorkStreamView({
  release: r,
  workStream: ws,
  team,
  onOpenTeam,
  allItems,
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
            </div>
          </>
        }
        sub={team ? <TeamLink name={team.name} onClick={onOpenTeam} /> : undefined}
        right={
          <>
            <span style={{ fontSize: 'var(--rt-fs-sm)', color: 'var(--rt-t3)' }}>
              {totalItemCount} items · {totalPts} pts · drag cards between sprints
            </span>
            <ShareButton release={r} />
            <PushButton release={r} onPush={onPush} />
            <SyncButton release={r} onSync={onSync} />
            <NewItemButton release={r} onClick={onNewItem} icon={Icon.plus} />
          </>
        }
      />

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
        <span style={{ fontSize: 'var(--rt-fs-xs)', fontWeight: 'var(--rt-fw-semibold)', color: 'var(--rt-t3)', marginRight: 2 }}>Status</span>
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
        {streamTypes.length > 0 && (
          <>
            <VDivider />
            {streamTypes.map((t) => (
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
        {isFiltered && (
          <>
            <VDivider />
            <ClearFiltersButton onClick={onClearFilters} title="Clear filters" />
          </>
        )}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '18px 24px' }}>
        {filteredItems.length === 0 ? (
          <EmptyState>
            {isFiltered ? 'No items match the current filters.' : 'No work items yet. Create one to get started.'}
          </EmptyState>
        ) : (
          <div style={{ display: 'flex', gap: 14, alignItems: 'stretch', minHeight: '100%' }}>
            {r.sprints.map((sp) => (
              <StreamSprintColumn
                key={sp.id}
                sp={sp}
                team={team}
                isCur={sp.id === activeSprintId}
                streamItems={filteredItems.filter((i) => i.sprintId === sp.id)}
                allItems={allItems}
                notify={notify}
                renderCard={(it) => (
                  <WorkItemCard
                    key={it.id}
                    it={it}
                    releaseTeamId={r.teamId}
                    draggable
                    onOpen={() => onOpenItem(it.id)}
                  />
                )}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
