// Release Overview (release plan view) — top bar, sprint board of horizontal
// sprint rows, and a work-streams rail. Ported from ReleaseScreen in
// proto-app.jsx; the sprint row follows the handoff README precisely.

import { useNavigate, useParams } from 'react-router-dom';
import { STATUSES } from '../types';
import { dOf, fmtShort } from '../lib/dates';
import { activeSprint, eventsIn, sprintVel, statusSegs } from '../lib/derive';
import { selItemsForStream, selRelease, selTeam, useStore } from '../store/store';
import { useApp } from '../app-context';
import { NotFound, SyncButton, TopBar } from '../components/chrome';
import { Icon } from '../components/Icon';
import { SegBar } from '../components/badges';
import { CapBarInline } from '../components/CapBarInline';
import { EventStrip } from '../components/EventStrip';
import { IconButton, PButton } from '../components/primitives';
import { WF } from '../components/tokens';

const StatusLegend = () => (
  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
    {STATUSES.map((s) => (
      <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: WF.t2 }}>
        <span className="wf-dot" style={{ background: WF.status[s].dot }} />
        {s}
      </span>
    ))}
  </div>
);

export function Release() {
  const st = useStore();
  const navigate = useNavigate();
  const { openModal, onSync } = useApp();
  const { id = '' } = useParams();
  const r = selRelease(st, id);
  if (!r) return <NotFound label="Release not found." />;
  const team = selTeam(st, r.teamId);
  const items = st.items.filter((i) => i.releaseId === r.id);
  const active = activeSprint(r);
  const last = r.sprints[r.sprints.length - 1];

  // lane entries for a sprint: streams that have items in it, count + status segs, width ∝ count
  const laneFor = (spN: number) =>
    r.workStreams
      .map((ws) => {
        const its = items.filter((i) => i.workStreamId === ws.id && i.sprintN === spN);
        return { ws, n: its.length, segs: statusSegs(its) };
      })
      .filter((e) => e.n > 0);

  return (
    <div className="wf wf-screen pt-root">
      <TopBar
        left={<IconButton icon={Icon.chevLeft} title="Back" onClick={() => navigate('/')} />}
        title={r.name}
        sub={
          <>
            {Icon.users}
            <span>{team ? team.name : '—'}</span>
            <span style={{ opacity: 0.5 }}>·</span>
            <span>
              {fmtShort(r.startISO)} – {fmtShort(last.endISO)}, {dOf(last.endISO).getFullYear()}
            </span>
          </>
        }
        right={
          <>
            <SyncButton onSync={onSync} />
            <PButton variant="subtle" sm icon={Icon.cal} onClick={() => openModal({ type: 'event', releaseId: id })}>
              New event
            </PButton>
            <PButton sm icon={Icon.plus} onClick={() => openModal({ type: 'stream', releaseId: id })}>
              New work stream
            </PButton>
          </>
        }
      />

      <div style={{ flex: 1, overflow: 'hidden', display: 'grid', gridTemplateColumns: '1fr 256px' }}>
        {/* sprint board */}
        <div style={{ padding: '16px 22px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span className="wf-tag">Sprints · {r.sprints.length}</span>
              <span style={{ fontSize: 11.5, color: WF.t3 }}>
                {team ? team.name : '—'} · velocity {team ? team.velocity : 0} pts · click a sprint to open it
              </span>
            </div>
            <StatusLegend />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {r.sprints.map((sp) => {
              const off = sp.daysOff;
              const vel = sprintVel(team, off);
              const planned = items.filter((i) => i.sprintN === sp.n).reduce((a, i) => a + i.points, 0);
              const isAct = !!active && active.n === sp.n;
              const evts = eventsIn(r, sp);
              const lane = laneFor(sp.n);
              return (
                <div
                  key={sp.n}
                  className={'wf-card wf-sprintrow pt-link' + (isAct ? ' wf-active' : '')}
                  onClick={() => navigate(`/releases/${id}/sprints/${sp.n}`)}
                  style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', cursor: 'pointer' }}
                >
                  {/* meta strip — horizontal across the top, fixed height so every row matches */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '9px 14px',
                      borderBottom: `1.5px solid ${isAct ? WF.status.Active.dot : WF.line}`,
                    }}
                  >
                    <span
                      title={sp.name}
                      style={{ fontWeight: 750, fontSize: 13.5, color: WF.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, flex: '0 1 auto' }}
                    >
                      {sp.name}
                    </span>
                    <span style={{ fontSize: 11.5, color: WF.t3, whiteSpace: 'nowrap', flex: '0 0 auto' }}>
                      {fmtShort(sp.startISO)} – {fmtShort(sp.endISO)}
                    </span>
                    <CapBarInline planned={planned} cap={vel} />
                    <EventStrip events={evts} align="flex-end" />
                  </div>
                  {/* work-stream lane */}
                  <div style={{ padding: '10px 13px' }}>
                    {lane.length === 0 ? (
                      <div className="wf-card wf-dash" style={{ minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', color: WF.t3, fontSize: 12.5 }}>
                        No work items
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 7, minWidth: 0 }}>
                        {lane.map((e) => (
                          <div
                            key={e.ws.id}
                            className="wf-card pt-link"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              navigate(`/releases/${id}/streams/${e.ws.id}`);
                            }}
                            style={{ flex: `${e.n} 1 0`, minWidth: 86, padding: '8px 11px', display: 'flex', flexDirection: 'column', gap: 6, overflow: 'hidden', background: WF.paper }}
                          >
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                              <span style={{ fontSize: 13, fontWeight: 650, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: '1 1 auto', minWidth: 0 }}>
                                {e.ws.name}
                              </span>
                              <span className="wf-mono" style={{ fontSize: 11.5, color: WF.t3, flex: '0 0 auto' }}>
                                {e.n}
                              </span>
                            </div>
                            <SegBar segs={e.segs} height={6} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {/* right rail: work streams */}
        <div style={{ borderLeft: `1.5px solid ${WF.line}`, background: WF.paper, padding: '18px 18px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <PButton icon={Icon.plus} onClick={() => openModal({ type: 'stream', releaseId: id })} style={{ justifyContent: 'center' }}>
            New work stream
          </PButton>
          <hr className="wf-divider" />
          <span className="wf-tag">Work streams · {r.workStreams.length}</span>
          {r.workStreams.length === 0 ? (
            <span style={{ fontSize: 12.5, color: WF.t3 }}>None yet. Add a work stream, then create work items in it.</span>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {r.workStreams.map((ws, i) => {
                const its = selItemsForStream(st, r.id, ws.id);
                return (
                  <div
                    key={ws.id}
                    className="pt-link"
                    onClick={() => navigate(`/releases/${id}/streams/${ws.id}`)}
                    style={{ display: 'flex', flexDirection: 'column', gap: 7, paddingBottom: 9, borderBottom: i < r.workStreams.length - 1 ? `1px solid ${WF.line}` : 'none', cursor: 'pointer' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                      <span style={{ fontWeight: 650, fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: '1 1 auto', minWidth: 0 }}>
                        {ws.name}
                      </span>
                      <span style={{ color: WF.t3, display: 'flex', alignItems: 'center', gap: 4, flex: '0 0 auto' }}>
                        <span className="wf-mono" style={{ fontSize: 11 }}>
                          {its.length}
                        </span>
                        {Icon.chevRight}
                      </span>
                    </div>
                    {its.length > 0 && <SegBar segs={statusSegs(its)} height={6} />}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
