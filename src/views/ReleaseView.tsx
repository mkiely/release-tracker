import type { ReleaseViewProps, SprintRowData } from '../hooks/useReleaseView';
import { STATUSES } from '../types';
import { fmtShort } from '../lib/dates';
import { PushButton, SyncButton, TopBar } from '../components/chrome';
import { Icon } from '../components/Icon';
import { SegBar } from '../components/badges';
import { CapBarInline } from '../components/CapBarInline';
import { EventStrip } from '../components/EventStrip';
import { IconButton, PButton } from '../components/primitives';
import { statusVars } from '../components/statusVars';
import releaseStyles from '../routes/Release.module.css';

function StatusLegend() {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {STATUSES.map((s) => (
        <span
          key={s}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--rt-t2)' }}
        >
          <span className="dot" style={{ background: statusVars(s).dot }} />
          {s}
        </span>
      ))}
    </div>
  );
}

function SprintRow({
  row,
  onNavigate,
  onNavigateToStream,
  onOpenEvent,
}: {
  row: SprintRowData;
  onNavigate: () => void;
  onNavigateToStream: (wsId: string) => void;
  onOpenEvent: (eventId: string) => void;
}) {
  const { sprint: sp, isActive, vel, planned, itemCount, events, lane } = row;
  return (
    <div
      className={['card', releaseStyles.sprintrow, isActive && releaseStyles.active].filter(Boolean).join(' ')}
      onClick={onNavigate}
      style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', cursor: 'pointer' }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '9px 14px',
          background: 'var(--rt-fill)',
          borderBottom: `1.5px solid ${isActive ? 'var(--rt-st-ac-dot)' : 'var(--rt-line)'}`,
        }}
      >
        <span
          title={sp.name}
          style={{
            fontWeight: 750,
            fontSize: 13.5,
            color: 'var(--rt-ink)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            minWidth: 0,
            flex: '0 1 auto',
          }}
        >
          {sp.name}
        </span>
        <span style={{ fontSize: 11.5, color: 'var(--rt-t3)', whiteSpace: 'nowrap', flex: '0 0 auto' }}>
          {fmtShort(sp.startISO)} – {fmtShort(sp.endISO)}
        </span>
        <span style={{ width: 1.5, alignSelf: 'stretch', background: 'var(--rt-line)', flexShrink: 0, margin: '0 4px' }} />
        <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: 'var(--rt-t3)', whiteSpace: 'nowrap', flex: '0 0 auto' }}>
          {itemCount} item{itemCount !== 1 ? 's' : ''}
        </span>
        <span style={{ width: 1.5, alignSelf: 'stretch', background: 'var(--rt-line)', flexShrink: 0, margin: '0 4px' }} />
        <CapBarInline planned={planned} cap={vel} />
        <EventStrip events={events} align="flex-end" onEventClick={onOpenEvent} />
      </div>
      <div style={{ padding: '10px 13px' }}>
        {lane.length === 0 ? (
          <div
            className="card dash"
            style={{
              minHeight: 44,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--rt-t3)',
              fontSize: 12.5,
            }}
          >
            No work items
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 7, minWidth: 0 }}>
            {lane.map((e) => (
              <div
                key={e.ws ? e.ws.id : '__unassigned__'}
                className="card"
                onClick={
                  e.ws
                    ? (ev) => {
                        ev.stopPropagation();
                        onNavigateToStream(e.ws!.id);
                      }
                    : undefined
                }
                style={{
                  flex: `${e.n} 1 0`,
                  minWidth: 86,
                  padding: '8px 11px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  overflow: 'hidden',
                  background: 'var(--rt-paper)',
                  cursor: e.ws ? 'pointer' : 'default',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 650,
                      color: e.ws ? 'var(--rt-t2)' : 'var(--rt-t3)',
                      fontStyle: e.ws ? undefined : 'italic',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      flex: '1 1 auto',
                      minWidth: 0,
                    }}
                  >
                    {e.ws ? e.ws.name : 'Unassigned'}
                  </span>
                  <span className="mono" style={{ fontSize: 11.5, color: 'var(--rt-t3)', flex: '0 0 auto' }}>
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
}

export function ReleaseView({
  release: r,
  team,
  sprintRows,
  workStreamBadges,
  unassignedCount,
  unassignedSegs,
  hasUnassigned,
  dateRange,
  connLabel,
  teamVelocity,
  onBack,
  onNavigateToSprint,
  onNavigateToStream,
  onExport,
  onNewEvent,
  onNewStream,
  onOpenEvent,
  onSync,
  onPush,
}: ReleaseViewProps) {
  return (
    <div className="wf screen">
      <TopBar
        left={<IconButton icon={Icon.chevLeft} title="Back" onClick={onBack} />}
        title={r.name}
        sub={
          <>
            {Icon.team}
            <span>{team ? team.name : '—'}</span>
            <span style={{ opacity: 0.5 }}>·</span>
            <span>{dateRange}</span>
            {connLabel && (
              <>
                <span style={{ opacity: 0.5 }}>·</span>
                <span className="tag" style={{ flex: '0 0 auto' }}>
                  {connLabel}
                </span>
              </>
            )}
          </>
        }
        right={
          <>
            <PushButton release={r} onPush={onPush} />
            <SyncButton release={r} onSync={onSync} />
            <PButton variant="subtle" sm icon={Icon.copy} onClick={onExport}>
              Export TSV
            </PButton>
            <PButton variant="subtle" sm icon={Icon.event} onClick={onNewEvent}>
              New event
            </PButton>
            {!r.connector && (
              <PButton sm icon={Icon.plus} onClick={onNewStream}>
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
          borderBottom: `1.5px solid ${'var(--rt-line)'}`,
          background: 'var(--rt-paper)',
          overflowX: 'auto',
          flexShrink: 0,
        }}
      >
        <span
          className="tag"
          style={{ flexShrink: 0, marginRight: 4, display: 'inline-flex', alignItems: 'center', gap: 5 }}
        >
          {Icon.stream}Work streams
        </span>
        <span style={{ width: 1.5, alignSelf: 'stretch', background: 'var(--rt-line)', flexShrink: 0, margin: '0 4px' }} />
        {workStreamBadges.length === 0 && !hasUnassigned ? (
          <span style={{ fontSize: 12.5, color: 'var(--rt-t3)' }}>
            No work streams yet — add one with the button above.
          </span>
        ) : (
          <>
            {workStreamBadges.map(({ ws, itemCount, segs }) => (
              <div
                key={ws.id}
                className="card"
                onClick={() => onNavigateToStream(ws.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '5px 10px',
                  flexShrink: 0,
                  background: 'var(--rt-paper)',
                  cursor: 'pointer',
                }}
              >
                <span style={{ fontSize: 12.5, fontWeight: 650, whiteSpace: 'nowrap', color: 'var(--rt-ink)' }}>
                  {ws.name}
                </span>
                <span className="mono" style={{ fontSize: 11, color: 'var(--rt-t3)' }}>{itemCount}</span>
                {itemCount > 0 && <SegBar segs={segs} height={4} />}
              </div>
            ))}
            {hasUnassigned && (
              <div
                className="card"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '5px 10px',
                  flexShrink: 0,
                  background: 'var(--rt-paper)',
                }}
              >
                <span
                  style={{
                    fontSize: 12.5,
                    fontWeight: 650,
                    whiteSpace: 'nowrap',
                    color: 'var(--rt-t3)',
                    fontStyle: 'italic',
                  }}
                >
                  Unassigned
                </span>
                <span className="mono" style={{ fontSize: 11, color: 'var(--rt-t3)' }}>{unassignedCount}</span>
                <SegBar segs={unassignedSegs} height={4} />
              </div>
            )}
          </>
        )}
      </div>

      <div style={{ flex: 1, overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            padding: '16px 22px',
            overflow: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span className="tag" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                {Icon.sprint}Sprints · {r.sprints.length}
              </span>
              <span style={{ width: 1.5, alignSelf: 'stretch', background: 'var(--rt-line)', flexShrink: 0, margin: '0 4px' }} />
              <span style={{ fontSize: 11.5, color: 'var(--rt-t3)' }}>{team ? team.name : '—'}</span>
              <span style={{ width: 1.5, alignSelf: 'stretch', background: 'var(--rt-line)', flexShrink: 0, margin: '0 4px' }} />
              <span style={{ fontSize: 11.5, color: 'var(--rt-t3)' }}>Velocity {teamVelocity} pts</span>
            </div>
            <StatusLegend />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {r.sprints.length === 0 ? (
              <div
                className="card dash"
                style={{ padding: 40, textAlign: 'center', color: 'var(--rt-t3)', fontSize: 14 }}
              >
                {r.connector
                  ? 'No sprints yet. Run a sync to populate the release plan.'
                  : 'No sprints configured.'}
              </div>
            ) : (
              sprintRows.map((row) => (
                <SprintRow
                  key={row.sprint.id}
                  row={row}
                  onNavigate={() => onNavigateToSprint(row.sprint.id)}
                  onNavigateToStream={onNavigateToStream}
                  onOpenEvent={onOpenEvent}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

