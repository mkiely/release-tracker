// Sprint view — columns by work stream or status, with assignee + status
// filters. Draggable item cards, sprint rail, capacity + events.

import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fmtShort } from '../lib/dates';
import { activeSprint, capPct, eventsIn, sprintVel } from '../lib/derive';
import { selRelease, selTeam, useStore } from '../store/store';
import { useApp } from '../app-context';
import { NotFound, PushButton, SyncButton, TopBar } from '../components/chrome';
import { Icon } from '../components/Icon';
import { EventBadge } from '../components/badges';
import { SprintRail } from '../components/dnd';
import { WorkItemCard } from '../components/WorkItemCard';
import { IconButton, PButton } from '../components/primitives';
import { WF } from '../components/tokens';
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
    .filter((i) => statusFilter.size === 0 || statusFilter.has(i.status));

  // Stream columns (filtered)
  const streamCols = r.workStreams
    .map((ws) => ({ ws, items: filteredItems.filter((i) => i.workStreamId === ws.id) }))
    .filter((c) => c.items.length > 0);

  // Status columns (filtered)
  const statusCols = STATUSES.map((s) => ({
    status: s,
    items: filteredItems.filter((i) => i.status === s),
  }));

  const isFiltered = memberFilter.size > 0 || statusFilter.size > 0;

  return (
    <div className="wf wf-screen pt-root">
      <TopBar
        left={<IconButton icon={Icon.chevLeft} title="Back" onClick={() => navigate(`/releases/${id}`)} />}
        title={
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: WF.t3, marginBottom: 3, whiteSpace: 'nowrap' }}>
              <span className="pt-link" onClick={() => navigate(`/releases/${id}`)} style={{ cursor: 'pointer' }}>
                {r.name}
              </span>
              {Icon.chevRight}
              <span style={{ fontWeight: 600, color: WF.t2 }}>Sprint</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={{ fontSize: 19, fontWeight: 750, letterSpacing: '-0.02em', lineHeight: 1, whiteSpace: 'nowrap' }}>{sp.name}</span>
              {isAct && <span className="wf-now">Active</span>}
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
            <span style={totalPts > vel ? { color: WF.status.Blocked.text, fontWeight: 700 } : undefined}>
              {items.length} items · {totalPts} pts planned{totalPts > vel ? ` · over by ${totalPts - vel}` : ''}
            </span>
          </>
        }
        right={
          <>
            <PButton variant="subtle" sm icon={Icon.sprint} onClick={() => openModal({ type: 'sprint', releaseId: id, sprintId: sp.id })}>
              Edit sprint
            </PButton>
            <PushButton release={r} onPush={() => onPush(id)} />
            <SyncButton release={r} onSync={() => onSync(id)} />
            <PButton sm icon={Icon.item} onClick={() => openModal({ type: 'item', releaseId: id, presetSprintId: sp.id })}>
              New work item
            </PButton>
          </>
        }
      />

      {evts.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 24px', borderBottom: `1.5px solid ${WF.line}`, background: WF.paper, flexWrap: 'wrap' }}>
          <span className="wf-tag">Events</span>
          {evts.map((e) => (
            <EventBadge key={e.id} date={fmtShort(e.dateISO)}>
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
          borderBottom: `1.5px solid ${WF.line}`,
          background: WF.bg,
          flexWrap: 'wrap',
        }}
      >
        {/* Group toggle */}
        <GroupToggle value={groupBy} onChange={setGroupBy} />

        <span style={{ width: 1, height: 16, background: WF.line, flexShrink: 0 }} />

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
                border: active ? `2px solid ${WF.ink}` : `1.5px solid ${WF.line}`,
                background: active ? WF.fill : 'transparent',
                cursor: 'pointer',
                fontSize: 10,
                fontWeight: 700,
                color: active ? WF.ink : WF.t3,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                fontFamily: WF.sans,
              }}
            >
              {initials}
            </button>
          );
        })}

        {sprintMembers.length > 0 && <span style={{ width: 1, height: 16, background: WF.line, flexShrink: 0 }} />}

        {/* Status filter */}
        {STATUSES.map((s) => {
          const active = statusFilter.has(s);
          const c = WF.status[s];
          return (
            <button
              key={s}
              onClick={() => toggleStatus(s)}
              title={active ? `Remove filter: ${s}` : `Filter: ${s}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '2px 9px 2px 7px',
                borderRadius: 20,
                border: `1.5px solid ${active ? c.dot : WF.line}`,
                background: active ? c.soft : 'transparent',
                color: active ? c.text : WF.t3,
                cursor: 'pointer',
                fontSize: 11.5,
                fontWeight: active ? 700 : 500,
                fontFamily: WF.sans,
                whiteSpace: 'nowrap',
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: active ? c.dot : WF.t3,
                  flexShrink: 0,
                }}
              />
              {s}
            </button>
          );
        })}

        {isFiltered && (
          <>
            <span style={{ width: 1, height: 16, background: WF.line, flexShrink: 0 }} />
            <button
              onClick={() => {
                setMemberFilter(new Set());
                setStatusFilter(new Set());
              }}
              title="Clear all filters"
              style={{
                fontSize: 11.5,
                fontWeight: 600,
                color: WF.t3,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontFamily: WF.sans,
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
          <div className="wf-card wf-dash" style={{ padding: 40, textAlign: 'center', color: WF.t3, fontSize: 14 }}>
            {isFiltered ? 'No items match the current filters.' : 'No work items in this sprint yet.'}
          </div>
        ) : groupBy === 'stream' ? (
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            {streamCols.map((col) => (
              <div key={col.ws.id} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div
                  className="pt-link"
                  onClick={() => navigate(`/releases/${id}/streams/${col.ws.id}`)}
                  style={{ display: 'flex', alignItems: 'center', padding: '0 2px', cursor: 'pointer', gap: 8 }}
                >
                  <span style={{ fontWeight: 750, fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                    {col.ws.name}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto', flex: '0 0 auto', color: WF.t3 }}>
                    <span className="wf-mono" style={{ fontSize: 11.5, fontWeight: 700 }}>
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
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 7, alignItems: 'stretch' }}>
            {statusCols.map((col, idx) => {
              const c = WF.status[col.status];
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
                    ...(isLast ? {} : { paddingRight: 7, borderRight: `1px solid ${WF.line}` }),
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
                        background: c.soft,
                        color: c.text,
                        fontSize: 11.5,
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.dot }} />
                      {col.status}
                    </span>
                    <span className="wf-mono" style={{ fontSize: 11.5, fontWeight: 700, color: WF.t3, marginLeft: 'auto' }}>
                      {col.items.reduce((a, i) => a + i.points, 0)} pts
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                    {col.items.map((it) => {
                      const ws = r.workStreams.find((w) => w.id === it.workStreamId);
                      return (
                        <div key={it.id}>
                          {ws && (
                            <div
                              style={{ fontSize: 10.5, fontWeight: 600, color: WF.t3, padding: '0 2px 3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                            >
                              {ws.name}
                            </div>
                          )}
                          <WorkItemCard it={it} releaseTeamId={r.teamId} draggable onOpen={() => openModal({ type: 'itemDetail', itemId: it.id })} />
                        </div>
                      );
                    })}
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
    <div
      style={{
        display: 'inline-flex',
        gap: 1,
        background: WF.fill,
        borderRadius: 7,
        padding: 2,
        flexShrink: 0,
      }}
    >
      {(['stream', 'status'] as const).map((mode) => (
        <button
          key={mode}
          onClick={() => onChange(mode)}
          title={mode === 'stream' ? 'Group by work stream' : 'Group by status'}
          style={{
            padding: '3px 10px',
            borderRadius: 5,
            border: value === mode ? `1px solid ${WF.line}` : 'none',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: value === mode ? 700 : 500,
            background: value === mode ? WF.paper : 'transparent',
            color: value === mode ? WF.ink : WF.t3,
            fontFamily: WF.sans,
            lineHeight: 1.5,
          }}
        >
          {mode === 'stream' ? 'By stream' : 'By status'}
        </button>
      ))}
    </div>
  );
}
