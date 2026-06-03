// Sprint view — columns by work stream, draggable item cards, a sprint rail to
// move items between sprints, capacity + events. Ported from SprintScreen.

import { useNavigate, useParams } from 'react-router-dom';
import { fmtShort } from '../lib/dates';
import { activeSprint, capPct, eventsIn, sprintVel } from '../lib/derive';
import { selRelease, selTeam, useStore } from '../store/store';
import { useApp } from '../app-context';
import { NotFound, SyncButton, TopBar } from '../components/chrome';
import { Icon } from '../components/Icon';
import { EventBadge } from '../components/badges';
import { SprintRail } from '../components/dnd';
import { WorkItemCard } from '../components/WorkItemCard';
import { IconButton, PButton } from '../components/primitives';
import { WF } from '../components/tokens';

export function Sprint() {
  const st = useStore();
  const navigate = useNavigate();
  const { openModal, onSync, notify } = useApp();
  const { id = '', sprintId = '' } = useParams();
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
  // columns = work streams that have items in this sprint
  const cols = r.workStreams
    .map((ws) => ({ ws, items: items.filter((i) => i.workStreamId === ws.id) }))
    .filter((c) => c.items.length > 0);

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
            <PButton variant="subtle" sm icon={Icon.cal} onClick={() => openModal({ type: 'sprint', releaseId: id, sprintId: sp.id })}>
              Edit sprint
            </PButton>
            <SyncButton release={r} onSync={() => onSync(id)} />
            <PButton sm icon={Icon.plus} onClick={() => openModal({ type: 'item', releaseId: id, presetSprintId: sp.id })}>
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

      <div style={{ flex: 1, overflow: 'auto', padding: '18px 24px' }}>
        {cols.length === 0 ? (
          <div className="wf-card wf-dash" style={{ padding: 40, textAlign: 'center', color: WF.t3, fontSize: 14 }}>
            No work items in this sprint yet.
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            {cols.map((col) => (
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
                    <WorkItemCard key={it.id} it={it} draggable onOpen={() => openModal({ type: 'itemDetail', itemId: it.id })} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
