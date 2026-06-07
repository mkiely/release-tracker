import type { ReleaseViewProps, StreamRowData } from '../hooks/useReleaseView';
import { fmtShort } from '../lib/dates';
import { SegBar } from '../components/badges';
import { ReleaseChrome } from '../components/ReleaseChrome';
import { Sparkline } from '../components/trend';
import { VerdictBadge, VerdictLine } from '../components/VerdictLine';
import releaseStyles from '../routes/Release.module.css';

function StreamRow({
  row,
  onNavigateToStream,
  onNavigateToSprint,
  onOpenStreamHealth,
  onEditStream,
}: {
  row: StreamRowData;
  onNavigateToStream: (wsId: string) => void;
  onNavigateToSprint: (sprintId: string) => void;
  onOpenStreamHealth: (wsId: string) => void;
  onEditStream: (wsId: string) => void;
}) {
  const { ws, itemCount, points, segs, series, forecast, lane } = row;
  const filled = lane.filter((e) => e.n > 0);
  const activeIndex = lane.find((e) => e.isActive)?.sprintIndex ?? -1;
  const clickable = ws !== null;
  const showVerdict = ws !== null && itemCount > 0;

  return (
    <div
      className={['card', releaseStyles.sprintrow].join(' ')}
      onClick={clickable ? () => onNavigateToStream(ws!.id) : undefined}
      style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0, cursor: clickable ? 'pointer' : 'default' }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '9px 14px',
          background: 'var(--rt-fill)',
          borderBottom: '1.5px solid var(--rt-line)',
        }}
      >
        <span
          title={ws ? ws.name : 'Unassigned'}
          style={{
            fontWeight: 'var(--rt-fw-display)',
            fontSize: 'var(--rt-fs-lg)',
            color: ws ? 'var(--rt-ink)' : 'var(--rt-t3)',
            fontStyle: ws ? undefined : 'italic',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            minWidth: 0,
            flex: '0 1 auto',
            lineHeight: 1.1,
          }}
        >
          {ws ? ws.name : 'Unassigned'}
        </span>
        <span style={{ width: 1.5, alignSelf: 'stretch', background: 'var(--rt-line)', flexShrink: 0, margin: '0 4px' }} />
        <span className="mono" style={{ fontSize: 'var(--rt-fs-xs)', fontWeight: 'var(--rt-fw-bold)', color: 'var(--rt-t3)', whiteSpace: 'nowrap', flex: '0 0 auto' }}>
          {itemCount} item{itemCount !== 1 ? 's' : ''}
        </span>
        <span style={{ width: 1.5, alignSelf: 'stretch', background: 'var(--rt-line)', flexShrink: 0, margin: '0 4px' }} />
        <span className="mono" style={{ fontSize: 'var(--rt-fs-xs)', fontWeight: 'var(--rt-fw-bold)', color: 'var(--rt-t3)', whiteSpace: 'nowrap', flex: '0 0 auto' }}>
          {points} pts
        </span>
        {ws && ws.engineersRequired != null && (
          <>
            <span style={{ width: 1.5, alignSelf: 'stretch', background: 'var(--rt-line)', flexShrink: 0, margin: '0 4px' }} />
            <span
              className="mono"
              title={`${ws.engineersRequired} engineer${ws.engineersRequired !== 1 ? 's' : ''} required`}
              style={{ fontSize: 'var(--rt-fs-xs)', fontWeight: 'var(--rt-fw-bold)', color: 'var(--rt-t2)', whiteSpace: 'nowrap', flex: '0 0 auto' }}
            >
              {ws.engineersRequired} eng
            </span>
          </>
        )}
        <div style={{ flex: 1, minWidth: 40, marginLeft: 4 }}>{itemCount > 0 && <SegBar segs={segs} height={9} />}</div>
        {series.length > 0 && <Sparkline series={series} activeIndex={activeIndex} />}
        {showVerdict && <VerdictBadge verdict={forecast.verdict} />}
      </div>
      <div style={{ padding: '10px 13px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {showVerdict && (
          <VerdictLine
            forecast={forecast}
            onOpen={() => (forecast.verdict === 'unconfigured' ? onEditStream(ws!.id) : onOpenStreamHealth(ws!.id))}
          />
        )}
        {filled.length === 0 ? (
          <div
            className="card dash"
            style={{ minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--rt-t3)', fontSize: 'var(--rt-fs-sm)' }}
          >
            No work items
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 7, minWidth: 0 }}>
            {filled.map((e) => (
              <div
                key={e.sprint.id}
                className={['card', e.isActive && releaseStyles.active].filter(Boolean).join(' ')}
                onClick={(ev) => {
                  ev.stopPropagation();
                  onNavigateToSprint(e.sprint.id);
                }}
                style={{
                  flex: `${e.n} 1 0`,
                  minWidth: 96,
                  padding: '8px 11px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  overflow: 'hidden',
                  background: e.isActive ? undefined : 'var(--rt-paper)',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span
                    style={{
                      fontSize: 'var(--rt-fs-base)',
                      fontWeight: 'var(--rt-fw-semibold)',
                      color: 'var(--rt-t2)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      flex: '1 1 auto',
                      minWidth: 0,
                    }}
                  >
                    {e.sprint.name}
                  </span>
                  <span className="mono" style={{ fontSize: 'var(--rt-fs-xs)', color: 'var(--rt-t3)', flex: '0 0 auto' }}>
                    {e.n}
                  </span>
                </div>
                <div style={{ fontSize: 'var(--rt-fs-micro)', color: 'var(--rt-t3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {fmtShort(e.sprint.startISO)} – {fmtShort(e.sprint.endISO)}
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

export function ReleaseStreamView(props: ReleaseViewProps) {
  const { release: r, streamRows, onNavigateToStream, onNavigateToSprint, onOpenStreamHealth, onEditStream } = props;
  return (
    <ReleaseChrome {...props}>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <div style={{ height: '100%', padding: '16px 22px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {streamRows.length === 0 ? (
            <div className="card dash" style={{ padding: 40, textAlign: 'center', color: 'var(--rt-t3)', fontSize: 'var(--rt-fs-md)' }}>
              {r.connector ? 'No work streams yet. Run a sync to populate the release.' : 'No work streams yet.'}
            </div>
          ) : (
            streamRows.map((row) => (
              <StreamRow
                key={row.ws ? row.ws.id : '__unassigned__'}
                row={row}
                onNavigateToStream={onNavigateToStream}
                onNavigateToSprint={onNavigateToSprint}
                onOpenStreamHealth={onOpenStreamHealth}
                onEditStream={onEditStream}
              />
            ))
          )}
        </div>
      </div>
    </ReleaseChrome>
  );
}
