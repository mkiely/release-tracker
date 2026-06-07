import type { WorkStreamViewProps } from '../hooks/useWorkStreamView';
import { PushButton, SyncButton, TopBar } from '../components/chrome';
import { Icon } from '../components/Icon';
import { StreamSprintColumn } from '../components/dnd';
import { WorkItemCard } from '../components/WorkItemCard';
import { IconButton, PButton } from '../components/primitives';
import { TeamLink } from '../components/TeamLink';
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
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                fontSize: 'var(--rt-fs-sm)',
                color: 'var(--rt-t3)',
                marginBottom: 3,
                whiteSpace: 'nowrap',
              }}
            >
              <span onClick={onBack} style={{ cursor: 'pointer' }}>
                {r.name}
              </span>
              {Icon.chevRight}
              <span style={{ fontWeight: 'var(--rt-fw-semibold)', color: 'var(--rt-t2)' }}>Work stream</span>
            </div>
            <div
              style={{
                fontSize: 'var(--rt-fs-xl)',
                fontWeight: 'var(--rt-fw-heading)',
                letterSpacing: '-0.02em',
                lineHeight: 1,
                whiteSpace: 'nowrap',
              }}
            >
              {ws.name}
            </div>
          </>
        }
        sub={team ? <TeamLink name={team.name} onClick={onOpenTeam} /> : undefined}
        right={
          <>
            <span style={{ fontSize: 'var(--rt-fs-sm)', color: 'var(--rt-t3)' }}>
              {totalItemCount} items · {totalPts} pts · drag cards between sprints
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
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: active ? sv.dot : 'var(--rt-t3)',
                  flexShrink: 0,
                }}
              />
              {s}
            </button>
          );
        })}
        {streamTypes.length > 0 && (
          <>
            <span style={{ width: 1, height: 16, background: 'var(--rt-line)', flexShrink: 0 }} />
            {streamTypes.map((t) => {
              const active = typeFilter.has(t);
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
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: active ? 'var(--rt-ink)' : 'var(--rt-t3)',
                      flexShrink: 0,
                    }}
                  />
                  {t}
                </button>
              );
            })}
          </>
        )}
        {isFiltered && (
          <>
            <span style={{ width: 1, height: 16, background: 'var(--rt-line)', flexShrink: 0 }} />
            <button
              onClick={onClearFilters}
              title="Clear filters"
              style={{
                fontSize: 'var(--rt-fs-xs)',
                fontWeight: 'var(--rt-fw-semibold)',
                color: 'var(--rt-t3)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'var(--rt-sans)',
                padding: '2px 4px',
              }}
            >
              Clear
            </button>
          </>
        )}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '18px 24px' }}>
        {filteredItems.length === 0 ? (
          <div
            className="card dash"
            style={{ padding: 40, textAlign: 'center', color: 'var(--rt-t3)', fontSize: 'var(--rt-fs-md)' }}
          >
            {isFiltered ? 'No items match the current filters.' : 'No work items yet. Create one to get started.'}
          </div>
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
