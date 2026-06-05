// Sprint view — columns by work stream or status, with assignee + status
// filters. Draggable item cards, sprint rail, capacity + events.

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import sprintStyles from './Sprint.module.css';
import { fmtShort } from '../lib/dates';
import { activeSprint, capPct, eventsIn, groupItemsByStream, sprintVel } from '../lib/derive';
import { selRelease, selTeam, useStore } from '../store/store';
import { useApp } from '../app-context';
import { NotFound, PushButton, SyncButton, TopBar } from '../components/chrome';
import { Icon } from '../components/Icon';
import { EventBadge } from '../components/badges';
import { SprintRail } from '../components/dnd';
import { WorkItemCard } from '../components/WorkItemCard';
import { IconButton, PButton } from '../components/primitives';
import { statusVars } from '../components/statusVars';
import { STATUSES, type Status } from '../types';

type GroupBy = 'stream' | 'status';

export function Sprint() {
  const st = useStore();
  const navigate = useNavigate();
  const { openModal, onSync, onPush, notify } = useApp();
  const { id = '', sprintId = '' } = useParams();

  const [groupBy, setGroupBy] = useState<GroupBy>('stream');
  const [memberFilter, setMemberFilter] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<Set<Status>>(new Set());
  const [buildFilter, setBuildFilter] = useState<Set<string>>(new Set());
  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set());

  useEffect(() => {
    setMemberFilter(new Set());
    setStatusFilter(new Set());
    setBuildFilter(new Set());
    setTypeFilter(new Set());
  }, [sprintId]);

  const r = selRelease(st, id);
  if (!r) return <NotFound label="Release not found." />;
  const sp = r.sprints.find((s) => s.id === sprintId);
  if (!sp) return <NotFound label="Sprint not found." />;
  const team = selTeam(st, r.teamId);
  const allItems = st.items.filter((i) => i.releaseId === r.id);
  const items = allItems.filter((i) => i.sprintId === sp.id);
  const off = sp.daysOff;
  const pct = Math.round(capPct(team, sp, off) * 100);
  const vel = sprintVel(team, sp, off);
  const act = activeSprint(r);
  const isAct = !!act && act.id === sp.id;
  const evts = eventsIn(r, sp);
  const totalPts = items.reduce((a, i) => a + i.points, 0);

  // Unique item type labels present in this sprint
  const sprintTypes = [...new Set(items.map((i) => i.itemType?.label).filter((t): t is string => t !== undefined))];

  function toggleType(t: string) {
    setTypeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }

  // Unique build labels present in this sprint (patch items from prior releases)
  const sprintBuilds = [...new Set(items.map((i) => i.build).filter((b): b is string => b !== null))];

  function toggleBuild(b: string) {
    setBuildFilter((prev) => {
      const next = new Set(prev);
      if (next.has(b)) next.delete(b);
      else next.add(b);
      return next;
    });
  }

  // Members who have at least one item in this sprint
  const sprintMembers = (team?.members ?? []).filter((m) =>
    items.some((i) => i.assignedMemberId === m.id)
  );

  function toggleMember(mid: string) {
    setMemberFilter((prev) => {
      const next = new Set(prev);
      if (next.has(mid)) next.delete(mid);
      else next.add(mid);
      return next;
    });
  }

  function toggleStatus(s: Status) {
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  const filteredItems = items
    .filter((i) => memberFilter.size === 0 || memberFilter.has(i.assignedMemberId ?? ''))
    .filter((i) => statusFilter.size === 0 || statusFilter.has(i.status))
    .filter((i) => typeFilter.size === 0 || (i.itemType !== null && typeFilter.has(i.itemType.label)))
    .filter((i) => buildFilter.size === 0 || buildFilter.has(i.build ?? ''));

  // Stream columns (filtered)
  const streamCols = r.workStreams
    .map((ws) => ({ ws, items: filteredItems.filter((i) => i.workStreamId === ws.id) }))
    .filter((c) => c.items.length > 0);
  const unassignedItems = filteredItems.filter((i) => i.workStreamId === null);

  // Status columns (filtered)
  const statusCols = STATUSES.map((s) => ({
    status: s,
    items: filteredItems.filter((i) => i.status === s),
  }));

  const isFiltered = memberFilter.size > 0 || statusFilter.size > 0 || typeFilter.size > 0 || buildFilter.size > 0;

  return (
    <div className="wf screen">
      <TopBar
        left={<IconButton icon={Icon.chevLeft} title="Back" onClick={() => navigate(`/releases/${id}`)} />}
        title={
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: 'var(--rt-t3)', marginBottom: 3, whiteSpace: 'nowrap' }}>
              <span onClick={() => navigate(`/releases/${id}`)} style={{ cursor: 'pointer' }}>
                {r.name}
              </span>
              {Icon.chevRight}
              <span style={{ fontWeight: 600, color: 'var(--rt-t2)' }}>Sprint</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={{ fontSize: 19, fontWeight: 750, letterSpacing: '-0.02em', lineHeight: 1, whiteSpace: 'nowrap' }}>{sp.name}</span>
              {isAct && <span className={sprintStyles.now}>Active</span>}
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
              {off} person-day{off === 1 ? '' : 's'} off
            </span>
            <span style={{ opacity: 0.5 }}>·</span>
            <span style={totalPts > vel ? { color: 'var(--rt-st-bl-text)', fontWeight: 700 } : undefined}>
              {items.length} items · {totalPts} pts planned{totalPts > vel ? ` · over by ${totalPts - vel}` : ''}
            </span>
          </>
        }
        right={
          <>
            {r.connector ? (
              <PButton variant="subtle" sm icon={Icon.cal} onClick={() => openModal({ type: 'sprint', releaseId: id, sprintId: sp.id })}>
                Days off
              </PButton>
            ) : (
              <PButton variant="subtle" sm icon={Icon.sprint} onClick={() => openModal({ type: 'sprint', releaseId: id, sprintId: sp.id })}>
                Edit sprint
              </PButton>
            )}
            <PushButton release={r} onPush={() => onPush(id)} />
            <SyncButton release={r} onSync={() => onSync(id)} />
            <PButton sm icon={Icon.item} disabled={!!r.connector} title={r.connector ? 'Work items are managed by the connector' : undefined} onClick={() => openModal({ type: 'item', releaseId: id, presetSprintId: sp.id })}>
              New work item
            </PButton>
          </>
        }
      />

      {evts.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 24px', borderBottom: `1.5px solid ${'var(--rt-line)'}`, background: 'var(--rt-paper)', flexWrap: 'wrap' }}>
          <span className="tag">Events</span>
          {evts.map((e) => (
            <EventBadge key={e.id} date={fmtShort(e.dateISO)} onClick={() => openModal({ type: 'event', releaseId: id, eventId: e.id })}>
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
        onGo={(sid) => navigate(`/releases/${id}/sprints/${sid}`)}
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
        {/* Group toggle */}
        <GroupToggle value={groupBy} onChange={setGroupBy} />

        <span style={{ width: 1, height: 16, background: 'var(--rt-line)', flexShrink: 0 }} />

        {/* Member filter */}
        {sprintMembers.map((m) => {
          const active = memberFilter.has(m.id);
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
              title={active ? `Hide ${m.name}` : `Filter: ${m.name}`}
              onClick={() => toggleMember(m.id)}
              style={{
                width: 26,
                height: 26,
                borderRadius: '50%',
                border: active ? `2px solid ${'var(--rt-ink)'}` : `1.5px solid ${'var(--rt-line)'}`,
                background: active ? 'var(--rt-fill)' : 'transparent',
                cursor: 'pointer',
                fontSize: 10,
                fontWeight: 700,
                color: active ? 'var(--rt-ink)' : 'var(--rt-t3)',
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

        {sprintMembers.length > 0 && <span style={{ width: 1, height: 16, background: 'var(--rt-line)', flexShrink: 0 }} />}

        {/* Status filter */}
        {STATUSES.map((s) => {
          const active = statusFilter.has(s);
          const sv = statusVars(s);
          return (
            <button
              key={s}
              onClick={() => toggleStatus(s)}
              title={active ? `Remove filter: ${s}` : `Filter: ${s}`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '2px 9px 2px 7px', borderRadius: 20,
                border: `1.5px solid ${active ? sv.dot : 'var(--rt-line)'}`,
                background: active ? sv.soft : 'transparent',
                color: active ? sv.text : 'var(--rt-t3)',
                cursor: 'pointer', fontSize: 11.5, fontWeight: active ? 700 : 500,
                fontFamily: 'var(--rt-sans)', whiteSpace: 'nowrap',
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: active ? sv.dot : 'var(--rt-t3)', flexShrink: 0 }} />
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
                  onClick={() => toggleType(t)}
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
                    fontSize: 11.5,
                    fontWeight: active ? 700 : 500,
                    fontFamily: 'var(--rt-sans)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: active ? 'var(--rt-ink)' : 'var(--rt-t3)', flexShrink: 0 }} />
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
                  onClick={() => toggleBuild(b)}
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
                    fontSize: 11.5,
                    fontWeight: active ? 700 : 500,
                    fontFamily: 'var(--rt-sans)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: 2, background: active ? 'var(--rt-ink)' : 'var(--rt-t3)', flexShrink: 0 }} />
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
              onClick={() => {
                setMemberFilter(new Set());
                setStatusFilter(new Set());
                setTypeFilter(new Set());
                setBuildFilter(new Set());
              }}
              title="Clear all filters"
              style={{
                fontSize: 11.5,
                fontWeight: 600,
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
          <div className="card dash" style={{ padding: 40, textAlign: 'center', color: 'var(--rt-t3)', fontSize: 14 }}>
            {isFiltered ? 'No items match the current filters.' : 'No work items in this sprint yet.'}
          </div>
        ) : groupBy === 'stream' ? (
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            {streamCols.map((col) => (
              <div key={col.ws.id} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div
                  onClick={() => navigate(`/releases/${id}/streams/${col.ws.id}`)}
                  style={{ display: 'flex', alignItems: 'center', padding: '0 2px', cursor: 'pointer', gap: 8 }}
                >
                  <span style={{ fontWeight: 750, fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                    {col.ws.name}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto', flex: '0 0 auto', color: 'var(--rt-t3)' }}>
                    <span className="mono" style={{ fontSize: 11.5, fontWeight: 700 }}>
                      {col.items.reduce((a, i) => a + i.points, 0)} pts
                    </span>
                    {Icon.chevRight}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {col.items.map((it) => (
                    <WorkItemCard key={it.id} it={it} releaseTeamId={r.teamId} draggable onOpen={() => openModal({ type: 'itemDetail', itemId: it.id })} />
                  ))}
                </div>
              </div>
            ))}
            {unassignedItems.length > 0 && (
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', padding: '0 2px', gap: 8 }}>
                  <span style={{ fontWeight: 750, fontSize: 13.5, color: 'var(--rt-t3)', fontStyle: 'italic' }}>Unassigned</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto', flex: '0 0 auto', color: 'var(--rt-t3)' }}>
                    <span className="mono" style={{ fontSize: 11.5, fontWeight: 700 }}>
                      {unassignedItems.reduce((a, i) => a + i.points, 0)} pts
                    </span>
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {unassignedItems.map((it) => (
                    <WorkItemCard key={it.id} it={it} releaseTeamId={r.teamId} draggable onOpen={() => openModal({ type: 'itemDetail', itemId: it.id })} />
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
                    flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10,
                    ...(isLast ? {} : { paddingRight: 7, borderRight: '1px solid var(--rt-line)' }),
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', padding: '0 2px', gap: 8 }}>
                    <span
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '2px 9px 2px 7px', borderRadius: 20,
                        background: sv.soft, color: sv.text,
                        fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap',
                      }}
                    >
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: sv.dot }} />
                      {col.status}
                    </span>
                    <span className="mono" style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--rt-t3)', marginLeft: 'auto' }}>
                      {col.items.reduce((a, i) => a + i.points, 0)} pts
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {groupItemsByStream(col.items, r.workStreams).map((grp) => (
                        <div key={grp.wsId ?? '__unassigned__'} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 2px' }}>
                            <span
                              style={{
                                fontSize: 12, fontWeight: 700, color: grp.wsName ? 'var(--rt-t2)' : 'var(--rt-t3)',
                                fontStyle: grp.wsName ? undefined : 'italic',
                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                              }}
                            >
                              {grp.wsName ?? 'Unassigned'}
                            </span>
                            <span className="mono" style={{ fontSize: 11, color: 'var(--rt-t3)', flex: '0 0 auto' }}>
                              {grp.items.reduce((a, i) => a + i.points, 0)} pts
                            </span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                            {grp.items.map((it) => (
                              <WorkItemCard key={it.id} it={it} releaseTeamId={r.teamId} draggable onOpen={() => openModal({ type: 'itemDetail', itemId: it.id })} />
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
