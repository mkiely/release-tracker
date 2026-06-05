// Release Overview (release plan view) — top bar, sprint board of horizontal
// sprint rows, and a work-streams rail. Ported from ReleaseScreen in
// proto-app.jsx; the sprint row follows the handoff README precisely.

import { useNavigate, useParams } from 'react-router-dom';
import { STATUSES } from '../types';
import { dOf, fmtShort } from '../lib/dates';
import { activeSprint, eventsIn, sprintVel, statusSegs } from '../lib/derive';
import { selItemsForStream, selUnassignedItems, selRelease, selTeam, useStore } from '../store/store';
import { releaseToTSV } from '../lib/exportRelease';
import { useApp } from '../app-context';
import { NotFound, PushButton, SyncButton, TopBar } from '../components/chrome';
import { connectorLabel } from '../sync/client';
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
  const { openModal, onSync, onPush, notify } = useApp();
  const { id = '' } = useParams();
  const r = selRelease(st, id);
  if (!r) return <NotFound label="Release not found." />;

  // Copy the release as TSV (rows by work stream, columns by sprint) for pasting
  // into a Google Sheet. Falls back to a hidden textarea if the async clipboard
  // API is unavailable (e.g. non-secure context).
  const onExport = async () => {
    const tsv = releaseToTSV(st, id);
    try {
      await navigator.clipboard.writeText(tsv);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = tsv;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
      } finally {
        document.body.removeChild(ta);
      }
    }
    notify('Release copied as TSV — paste into a sheet');
  };
  const team = selTeam(st, r.teamId);
  const items = st.items.filter((i) => i.releaseId === r.id);
  const active = activeSprint(r);
  const last = r.sprints.length ? r.sprints[r.sprints.length - 1] : null;

  // lane entries for a sprint: streams that have items in it, count + status segs, width ∝ count
  const unassigned = selUnassignedItems(st, r.id);
  const laneFor = (spId: string) => {
    const cols = r.workStreams
      .map((ws) => {
        const its = items.filter((i) => i.workStreamId === ws.id && i.sprintId === spId);
        return { ws: ws as { id: string; name: string } | null, n: its.length, segs: statusSegs(its) };
      })
      .filter((e) => e.n > 0);
    const unassignedInSprint = unassigned.filter((i) => i.sprintId === spId);
    if (unassignedInSprint.length > 0) {
      cols.push({ ws: null, n: unassignedInSprint.length, segs: statusSegs(unassignedInSprint) });
    }
    return cols;
  };

  return (
    <div className="wf wf-screen">
      <TopBar
        left={<IconButton icon={Icon.chevLeft} title="Back" onClick={() => navigate('/')} />}
        title={r.name}
        sub={
          <>
            {Icon.team}
            <span>{team ? team.name : '—'}</span>
            <span style={{ opacity: 0.5 }}>·</span>
            <span>
              {last
                ? `${fmtShort(r.startISO)} – ${fmtShort(last.endISO)}, ${dOf(last.endISO).getFullYear()}`
                : `${fmtShort(r.startISO)}, ${dOf(r.startISO).getFullYear()}`}
            </span>
            {r.connector && (
              <>
                <span style={{ opacity: 0.5 }}>·</span>
                <span className="wf-tag" style={{ flex: '0 0 auto' }}>
                  {connectorLabel(r.connector.type)}
                </span>
              </>
            )}
          </>
        }
        right={
          <>
            <PushButton release={r} onPush={() => onPush(id)} />
            <SyncButton release={r} onSync={() => onSync(id)} />
            <PButton variant="subtle" sm icon={Icon.copy} onClick={onExport}>
              Export TSV
            </PButton>
            <PButton variant="subtle" sm icon={Icon.event} onClick={() => openModal({ type: 'event', releaseId: id })}>
              New event
            </PButton>
            {!r.connector && (
              <PButton sm icon={Icon.plus} onClick={() => openModal({ type: 'stream', releaseId: id })}>
                New work stream
              </PButton>
            )}
          </>
        }
      />

      {/* work streams header strip */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 22px',
          borderBottom: `1.5px solid ${WF.line}`,
          background: WF.paper,
          overflowX: 'auto',
          flexShrink: 0,
        }}
      >
        <span className="wf-tag" style={{ flexShrink: 0, marginRight: 4, display: 'inline-flex', alignItems: 'center', gap: 5 }}>{Icon.stream}Work streams</span>
        <span style={{ width: 1.5, alignSelf: 'stretch', background: WF.line, flexShrink: 0, margin: '0 4px' }} />
        {r.workStreams.length === 0 && unassigned.length === 0 ? (
          <span style={{ fontSize: 12.5, color: WF.t3 }}>No work streams yet — add one with the button above.</span>
        ) : (
          <>
            {r.workStreams.map((ws) => {
              const its = selItemsForStream(st, r.id, ws.id);
              const segs = statusSegs(its);
              return (
                <div
                  key={ws.id}
                  className="wf-card"
                  onClick={() => navigate(`/releases/${id}/streams/${ws.id}`)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', flexShrink: 0, background: WF.paper, cursor: 'pointer' }}
                >
                  <span style={{ fontSize: 12.5, fontWeight: 650, whiteSpace: 'nowrap', color: WF.ink }}>{ws.name}</span>
                  <span className="wf-mono" style={{ fontSize: 11, color: WF.t3 }}>{its.length}</span>
                  {its.length > 0 && <SegBar segs={segs} height={4} />}
                </div>
              );
            })}
            {unassigned.length > 0 && (
              <div
                className="wf-card"
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', flexShrink: 0, background: WF.paper }}
              >
                <span style={{ fontSize: 12.5, fontWeight: 650, whiteSpace: 'nowrap', color: WF.t3, fontStyle: 'italic' }}>Unassigned</span>
                <span className="wf-mono" style={{ fontSize: 11, color: WF.t3 }}>{unassigned.length}</span>
                <SegBar segs={statusSegs(unassigned)} height={4} />
              </div>
            )}
          </>
        )}
      </div>

      <div style={{ flex: 1, overflow: 'hidden' }}>
        {/* sprint board — full width now that the right rail is gone */}
        <div style={{ height: '100%', padding: '16px 22px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span className="wf-tag" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>{Icon.sprint}Sprints · {r.sprints.length}</span>
              <span style={{ width: 1.5, alignSelf: 'stretch', background: WF.line, flexShrink: 0, margin: '0 4px' }} />
              <span style={{ fontSize: 11.5, color: WF.t3 }}>{team ? team.name : '—'}</span>
              <span style={{ width: 1.5, alignSelf: 'stretch', background: WF.line, flexShrink: 0, margin: '0 4px' }} />
              <span style={{ fontSize: 11.5, color: WF.t3 }}>Velocity {team ? team.velocity : 0} pts</span>
            </div>
            <StatusLegend />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {r.sprints.length === 0 ? (
              <div className="wf-card wf-dash" style={{ padding: 40, textAlign: 'center', color: WF.t3, fontSize: 14 }}>
                {r.connector
                  ? 'No sprints yet. Run a sync to populate the release plan.'
                  : 'No sprints configured.'}
              </div>
            ) : (
              r.sprints.map((sp) => {
              const off = sp.daysOff;
              const vel = sprintVel(team, sp, off);
              const spItems = items.filter((i) => i.sprintId === sp.id);
              const planned = spItems.reduce((a, i) => a + i.points, 0);
              const isAct = !!active && active.id === sp.id;
              const evts = eventsIn(r, sp);
              const lane = laneFor(sp.id);
              return (
                <div
                  key={sp.id}
                  className={'wf-card wf-sprintrow' + (isAct ? ' wf-active' : '')}
                  onClick={() => navigate(`/releases/${id}/sprints/${sp.id}`)}
                  style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', cursor: 'pointer' }}
                >
                  {/* meta strip — horizontal across the top, fixed height so every row matches */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '9px 14px',
                      background: WF.fill,
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
                    <span style={{ width: 1.5, alignSelf: 'stretch', background: WF.line, flexShrink: 0, margin: '0 4px' }} />
                    <span className="wf-mono" style={{ fontSize: 11, fontWeight: 700, color: WF.t3, whiteSpace: 'nowrap', flex: '0 0 auto' }}>
                      {spItems.length} item{spItems.length !== 1 ? 's' : ''}
                    </span>
                    <span style={{ width: 1.5, alignSelf: 'stretch', background: WF.line, flexShrink: 0, margin: '0 4px' }} />
                    <CapBarInline planned={planned} cap={vel} />
                    <EventStrip events={evts} align="flex-end" onEventClick={(eid) => openModal({ type: 'event', releaseId: id, eventId: eid })} />
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
                            key={e.ws ? e.ws.id : '__unassigned__'}
                            className={'wf-card' + (e.ws ? '' : '')}
                            onClick={e.ws ? (ev) => { ev.stopPropagation(); navigate(`/releases/${id}/streams/${e.ws!.id}`); } : undefined}
                            style={{ flex: `${e.n} 1 0`, minWidth: 86, padding: '8px 11px', display: 'flex', flexDirection: 'column', gap: 6, overflow: 'hidden', background: WF.paper, cursor: e.ws ? 'pointer' : 'default' }}
                          >
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                              <span style={{ fontSize: 13, fontWeight: 650, color: e.ws ? WF.t2 : WF.t3, fontStyle: e.ws ? undefined : 'italic', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: '1 1 auto', minWidth: 0 }}>
                                {e.ws ? e.ws.name : 'Unassigned'}
                              </span>
                              <span className="wf-mono" style={{ fontSize: 11.5, color: WF.t3, flex: '0 0 auto' }}>
                                {e.n}
                              </span>
                            </div>
                            <SegBar segs={e.segs} height={9} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
