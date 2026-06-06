import type { SprintViewProps, GroupBy } from '../hooks/useSprintView';
import { fmtShort } from '../lib/dates';
import { groupItemsByStream } from '../lib/derive';
import { PushButton, SyncButton, TopBar } from '../components/chrome';
import { Icon } from '../components/Icon';
import { EventBadge } from '../components/badges';
import { SprintRail } from '../components/dnd';
import { WorkItemCard } from '../components/WorkItemCard';
import { IconButton, PButton } from '../components/primitives';
import { statusVars } from '../components/statusVars';
import { STATUSES } from '../types';
import sprintStyles from '../routes/Sprint.module.css';

function GroupToggle({ value, onChange }: { value: GroupBy; onChange: (v: GroupBy) => void }) {
  return (
    <div className={sprintStyles.groupToggle}>
      {(['stream', 'status'] as const).map((mode) => (
        <button
          key={mode}
          onClick={() => onChange(mode)}
          title={mode === 'stream' ? 'Group by work stream' : 'Group by status'}
          className={`${sprintStyles.groupBtn} ${value === mode ? sprintStyles.groupBtnActive : ''}`}
        >
          {mode === 'stream' ? 'By stream' : 'By status'}
        </button>
      ))}
    </div>
  );
}

export function SprintView({
  release: r,
  sprint: sp,
  team,
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
              <span style={{ fontWeight: 'var(--rt-fw-semibold)', color: 'var(--rt-t2)' }}>Sprint</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
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
        <span style={{ width: 1, height: 16, background: 'var(--rt-line)', flexShrink: 0 }} />

        {sprintMembers.map((m) => {
          const isActive = memberFilter.has(m.id);
          const initials = m.name
            .trim()
            .split(' ')
            .map((p) => p[0])
            .slice(0, 2)
            .join('')
            .toUpperCase();
          return (
            <button
              key={m.id}
              title={isActive ? `Hide ${m.name}` : `Filter: ${m.name}`}
              onClick={() => onToggleMember(m.id)}
              style={{
                width: 26,
                height: 26,
                borderRadius: '50%',
                border: isActive ? `2px solid ${'var(--rt-ink)'}` : `1.5px solid ${'var(--rt-line)'}`,
                background: isActive ? 'var(--rt-fill)' : 'transparent',
                cursor: 'pointer',
                fontSize: 'var(--rt-fs-micro)',
                fontWeight: 'var(--rt-fw-bold)',
                color: isActive ? 'var(--rt-ink)' : 'var(--rt-t3)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                fontFamily: 'var(--rt-sans)',
              }}
            >
              {initials}
            </button>
          );
        })}

        {sprintMembers.length > 0 && (
          <span style={{ width: 1, height: 16, background: 'var(--rt-line)', flexShrink: 0 }} />
        )}

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

        {sprintTypes.length > 0 && (
          <>
            <span style={{ width: 1, height: 16, background: 'var(--rt-line)', flexShrink: 0 }} />
            {sprintTypes.map((t) => {
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

        {sprintBuilds.length > 0 && (
          <>
            <span style={{ width: 1, height: 16, background: 'var(--rt-line)', flexShrink: 0 }} />
            {sprintBuilds.map((b) => {
              const active = buildFilter.has(b);
              return (
                <button
                  key={b}
                  onClick={() => onToggleBuild(b)}
                  title={active ? `Remove filter: ${b}` : `Filter: ${b}`}
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
                      borderRadius: 2,
                      background: active ? 'var(--rt-ink)' : 'var(--rt-t3)',
                      flexShrink: 0,
                    }}
                  />
                  {b}
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
              title="Clear all filters"
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
            {isFiltered ? 'No items match the current filters.' : 'No work items in this sprint yet.'}
          </div>
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
                      {col.items.reduce((a, i) => a + i.points, 0)} pts
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
                      {unassignedItems.reduce((a, i) => a + i.points, 0)} pts
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
              const sv = statusVars(col.status);
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
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        padding: '2px 9px 2px 7px',
                        borderRadius: 20,
                        background: sv.soft,
                        color: sv.text,
                        fontSize: 'var(--rt-fs-xs)',
                        fontWeight: 'var(--rt-fw-bold)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: sv.dot }} />
                      {col.status}
                    </span>
                    <span
                      className="mono"
                      style={{ fontSize: 'var(--rt-fs-xs)', fontWeight: 'var(--rt-fw-bold)', color: 'var(--rt-t3)', marginLeft: 'auto' }}
                    >
                      {col.items.reduce((a, i) => a + i.points, 0)} pts
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
                            {grp.items.reduce((a, i) => a + i.points, 0)} pts
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
