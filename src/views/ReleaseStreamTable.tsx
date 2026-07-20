import type { ReleaseViewProps, StreamRowData } from '../hooks/useReleaseView';
import type { StreamHealth } from '../lib/derive';
import { SegBar } from '../components/badges';
import { EmptyState } from '../components/EmptyState';
import { ReleaseChrome } from '../components/ReleaseChrome';
import { Sparkline, CompletionRing } from '../components/trend';
import { statusVars } from '../components/statusVars';
import { VerdictLine } from '../components/VerdictLine';
import styles from './ReleaseTable.module.css';

/** Remaining work, broken down by status — the "why" behind what's left. */
function RemainingChips({ health }: { health: StreamHealth }) {
  const remaining = health.pointsByStatus.filter((s) => s.k !== 'Complete');
  if (remaining.length === 0) return <span style={{ fontSize: 'var(--rt-fs-xs)', color: 'var(--rt-t3)' }}>All complete</span>;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      {remaining.map((s) => {
        const sv = statusVars(s.k);
        return (
          <span key={s.k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 'var(--rt-fs-xs)', color: 'var(--rt-t2)', whiteSpace: 'nowrap' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: sv.dot, flexShrink: 0 }} />
            <span className="mono" style={{ fontWeight: 'var(--rt-fw-bold)' }}>{s.v}</span>
            <span style={{ color: 'var(--rt-t3)' }}>{s.k}</span>
          </span>
        );
      })}
    </div>
  );
}

function HealthPanel({ health }: { health: StreamHealth }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 22, width: '100%' }}>
      {/* Completion + status breakdown bar */}
      <div style={{ flex: '0 0 240px', display: 'flex', flexDirection: 'column', gap: 7 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 'var(--rt-fs-xl)', fontWeight: 'var(--rt-fw-heading)', lineHeight: 1, letterSpacing: '-0.02em' }}>
            {health.pct}%
          </span>
          <span className="mono" style={{ fontSize: 'var(--rt-fs-xs)', color: 'var(--rt-t3)' }}>
            {health.donePts} / {health.totalPts} pts
          </span>
        </div>
        {health.totalPts > 0 && <SegBar segs={health.pointsByStatus} height={10} radius={5} />}
      </div>

      {/* Remaining-work breakdown */}
      <div style={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 'var(--rt-fs-micro)', color: 'var(--rt-t3)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 'var(--rt-fw-semibold)' }}>
          {health.remainingPts} pts remaining
        </span>
        <RemainingChips health={health} />
      </div>
    </div>
  );
}

function StreamRow({
  row,
  onNavigateToStream,
  onNavigateToUnassigned,
  onOpenStreamHealth,
  onEditStream,
}: {
  row: StreamRowData;
  onNavigateToStream: (wsId: string) => void;
  onNavigateToUnassigned: () => void;
  onOpenStreamHealth: (wsId: string) => void;
  onEditStream: (wsId: string) => void;
}) {
  const { ws, itemCount, points, series, health, forecast } = row;
  const activeIndex = row.lane.find((e) => e.isActive)?.sprintIndex ?? -1;
  const handleClick = ws !== null ? () => onNavigateToStream(ws.id) : onNavigateToUnassigned;

  return (
    <div
      className={styles.row}
      onClick={handleClick}
    >
      <div className={styles.rowLeft}>
        <span
          className={[styles.sprintName, !ws && styles.sprintNamePast].filter(Boolean).join(' ')}
          style={!ws ? { fontStyle: 'italic' } : undefined}
        >
          {ws ? ws.name : 'Unassigned'}
        </span>
        <div className={styles.rowMeta}>
          <span>{itemCount} item{itemCount !== 1 ? 's' : ''}</span>
          <span className={styles.metaDot}>·</span>
          <span>{points} pts</span>
          {ws && ws.engineersRequired != null && (
            <>
              <span className={styles.metaDot}>·</span>
              <span className={styles.engMeta} title={`${ws.engineersRequired} engineer${ws.engineersRequired !== 1 ? 's' : ''} required`}>
                {ws.engineersRequired} eng
              </span>
            </>
          )}
          {itemCount > 0 && (
            <span className={styles.metaRing}>
              <CompletionRing done={health.donePts} total={health.totalPts} />
            </span>
          )}
        </div>
        {series.length > 0 && (
          <div className={styles.sparkRow}>
            <Sparkline series={series} activeIndex={activeIndex} width={262} height={30} />
          </div>
        )}
      </div>
      <div className={styles.rowRight}>
        {itemCount === 0 ? (
          <span className={styles.noItems}>No work items</span>
        ) : (
          <>
            <HealthPanel health={health} />
            {ws && (
              <VerdictLine
                forecast={forecast}
                onOpen={() => (forecast.verdict === 'unconfigured' ? onEditStream(ws.id) : onOpenStreamHealth(ws.id))}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function ReleaseStreamTable(props: ReleaseViewProps) {
  const { release: r, streamRows, onNavigateToStream, onNavigateToUnassigned, onOpenStreamHealth, onEditStream, overAllocated, engineersRequiredTotal, contributingCount } = props;
  return (
    <ReleaseChrome {...props}>
      <div className={styles.body}>
        {overAllocated && (
          <div className={styles.allocNote}>
            <span className={styles.allocDot} />
            <span>
              Team over-allocated — active streams need <strong>{engineersRequiredTotal}</strong> engineers but the team has{' '}
              <strong>{contributingCount}</strong>. At-risk forecasts below account for this contention.
            </span>
          </div>
        )}
        {streamRows.length === 0 ? (
          <EmptyState style={{ margin: 24 }}>
            {r.connector ? 'No work streams yet. Run a sync to populate the release.' : 'No work streams yet.'}
          </EmptyState>
        ) : (
          streamRows.map((row) => (
            <StreamRow
              key={row.ws ? row.ws.id : '__unassigned__'}
              row={row}
              onNavigateToStream={onNavigateToStream}
              onNavigateToUnassigned={onNavigateToUnassigned}
              onOpenStreamHealth={onOpenStreamHealth}
              onEditStream={onEditStream}
            />
          ))
        )}
      </div>
    </ReleaseChrome>
  );
}
