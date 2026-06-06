import { useEffect, useRef } from 'react';
import type { ReleaseViewProps, SprintRowData } from '../hooks/useReleaseView';
import { STATUSES } from '../types';
import { fmtShort } from '../lib/dates';
import { Icon } from '../components/Icon';
import { SegBar } from '../components/badges';
import { CapBarInline } from '../components/CapBarInline';
import { EventStrip } from '../components/EventStrip';
import { ReleaseChrome } from '../components/ReleaseChrome';
import { statusVars } from '../components/statusVars';
import releaseStyles from '../routes/Release.module.css';

function StatusLegend() {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {STATUSES.map((s) => (
        <span
          key={s}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--rt-fs-sm)', color: 'var(--rt-t2)' }}
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
  rowRef,
  onNavigate,
  onNavigateToStream,
  onOpenEvent,
}: {
  row: SprintRowData;
  rowRef?: React.Ref<HTMLDivElement>;
  onNavigate: () => void;
  onNavigateToStream: (wsId: string) => void;
  onOpenEvent: (eventId: string) => void;
}) {
  const { sprint: sp, isActive, vel, planned, itemCount, events, lane } = row;
  return (
    <div
      ref={rowRef}
      className={['card', releaseStyles.sprintrow, isActive && releaseStyles.active].filter(Boolean).join(' ')}
      onClick={onNavigate}
      style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', cursor: 'pointer' }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
          padding: '9px 14px',
          background: 'var(--rt-fill)',
          borderBottom: `1.5px solid ${isActive ? 'var(--rt-st-ac-dot)' : 'var(--rt-line)'}`,
        }}
      >
        <span
          title={sp.name}
          style={{
            fontWeight: 'var(--rt-fw-display)',
            fontSize: 'var(--rt-fs-lg)',
            color: 'var(--rt-ink)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            minWidth: 0,
            flex: '0 1 auto',
            lineHeight: 1.1,
          }}
        >
          {sp.name}
        </span>
        <span style={{ fontSize: 'var(--rt-fs-xs)', color: 'var(--rt-t3)', whiteSpace: 'nowrap', flex: '0 0 auto' }}>
          {fmtShort(sp.startISO)} – {fmtShort(sp.endISO)}
        </span>
        <span style={{ width: 1.5, alignSelf: 'stretch', background: 'var(--rt-line)', flexShrink: 0, margin: '0 4px' }} />
        <span className="mono" style={{ fontSize: 'var(--rt-fs-xs)', fontWeight: 'var(--rt-fw-bold)', color: 'var(--rt-t3)', whiteSpace: 'nowrap', flex: '0 0 auto' }}>
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
              fontSize: 'var(--rt-fs-sm)',
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
                      fontSize: 'var(--rt-fs-base)',
                      fontWeight: 'var(--rt-fw-semibold)',
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
                  <span className="mono" style={{ fontSize: 'var(--rt-fs-xs)', color: 'var(--rt-t3)', flex: '0 0 auto' }}>
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

export function ReleaseView(props: ReleaseViewProps) {
  const {
    release: r,
    team,
    sprintRows,
    teamVelocity,
    onNavigateToSprint,
    onNavigateToStream,
    onOpenEvent,
  } = props;
  const activeRowRef = useRef<HTMLDivElement>(null);

  // Center the viewport on the active sprint when the view first loads.
  useEffect(() => {
    activeRowRef.current?.scrollIntoView({ block: 'center' });
  }, []);

  return (
    <ReleaseChrome {...props}>
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
              <span style={{ fontSize: 'var(--rt-fs-xs)', color: 'var(--rt-t3)' }}>{team ? team.name : '—'}</span>
              <span style={{ width: 1.5, alignSelf: 'stretch', background: 'var(--rt-line)', flexShrink: 0, margin: '0 4px' }} />
              <span style={{ fontSize: 'var(--rt-fs-xs)', color: 'var(--rt-t3)' }}>Velocity {teamVelocity} pts</span>
            </div>
            <StatusLegend />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {r.sprints.length === 0 ? (
              <div
                className="card dash"
                style={{ padding: 40, textAlign: 'center', color: 'var(--rt-t3)', fontSize: 'var(--rt-fs-md)' }}
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
                  rowRef={row.isActive ? activeRowRef : undefined}
                  onNavigate={() => onNavigateToSprint(row.sprint.id)}
                  onNavigateToStream={onNavigateToStream}
                  onOpenEvent={onOpenEvent}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </ReleaseChrome>
  );
}

