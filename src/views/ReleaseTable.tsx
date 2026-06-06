import { useEffect, useRef } from 'react';
import type { ReleaseViewProps } from '../hooks/useReleaseView';
import { fmtShort, todayISO } from '../lib/dates';
import { PushButton, SyncButton, TopBar } from '../components/chrome';
import { Icon } from '../components/Icon';
import { SegBar, EventBadge } from '../components/badges';
import { IconButton, PButton } from '../components/primitives';
import { statusVars } from '../components/statusVars';
import styles from './ReleaseTable.module.css';

// Trend of a stream's points across the release; the current sprint is dotted.
function Sparkline({ series, activeIndex }: { series: number[]; activeIndex: number }) {
  const w = 56;
  const h = 16;
  const pad = 2.5;
  const n = series.length;
  if (n === 0) return <span className={styles.spark} aria-hidden="true" />;
  const max = Math.max(1, ...series);
  const x = (i: number) => (n <= 1 ? w / 2 : pad + (i * (w - 2 * pad)) / (n - 1));
  const y = (v: number) => h - pad - (v / max) * (h - 2 * pad);
  const pts = series.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg className={styles.spark} width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <polyline points={pts} fill="none" stroke="var(--rt-line-strong)" strokeWidth={1.25} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(activeIndex)} cy={y(series[activeIndex] ?? 0)} r={2.25} fill="var(--rt-st-ac-dot)" />
    </svg>
  );
}

// Compact completion ring + percentage for a lane.
function CompletionRing({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? done / total : 0;
  const sz = 15;
  const r = 5.75;
  const c = 2 * Math.PI * r;
  const center = sz / 2;
  return (
    <span className={styles.ring} title={`${done} of ${total} complete`}>
      <svg width={sz} height={sz} viewBox={`0 0 ${sz} ${sz}`} aria-hidden="true">
        <circle cx={center} cy={center} r={r} fill="none" stroke="var(--rt-fill)" strokeWidth={2.25} />
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke={statusVars('Complete').dot}
          strokeWidth={2.25}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          transform={`rotate(-90 ${center} ${center})`}
        />
      </svg>
      <span className={styles.ringPct}>{Math.round(pct * 100)}%</span>
    </span>
  );
}

function F3SprintRow({
  row,
  isPast,
  rowRef,
  onNavigate,
  onNavigateToStream,
  onOpenEvent,
}: {
  row: ReleaseViewProps['sprintRows'][0];
  isPast: boolean;
  rowRef?: React.Ref<HTMLDivElement>;
  onNavigate: () => void;
  onNavigateToStream: (wsId: string) => void;
  onOpenEvent: (eventId: string) => void;
}) {
  const { sprint: sp, sprintIndex, isActive, vel, itemCount, events, lane } = row;

  return (
    <div
      ref={rowRef}
      className={[styles.row, isActive && styles.rowActive].filter(Boolean).join(' ')}
      onClick={onNavigate}
    >
      <div className={[styles.rowLeft, isActive && styles.rowActiveLeft].filter(Boolean).join(' ')}>
        {isActive && <span className={styles.activeBadge}>Active</span>}
        <span className={[styles.sprintName, isPast && styles.sprintNamePast].filter(Boolean).join(' ')}>
          {sp.name}
        </span>
        <div className={styles.rowMeta}>
          <span>{fmtShort(sp.startISO)} – {fmtShort(sp.endISO)}</span>
          <span className={styles.metaDot}>·</span>
          <span>{vel} pts cap</span>
          <span className={styles.metaDot}>·</span>
          <span>{itemCount} item{itemCount !== 1 ? 's' : ''}</span>
          {events.map((e) => (
            <EventBadge key={e.id} date={fmtShort(e.dateISO)} onClick={() => onOpenEvent(e.id)}>
              {e.label}
            </EventBadge>
          ))}
        </div>
      </div>
      <div className={styles.rowRight}>
        {lane.length === 0 ? (
          <span className={styles.noItems}>No work items</span>
        ) : (() => {
          const total = lane.reduce((s, e) => s + e.n, 0);
          return lane.map((e) => {
            const isUnassigned = e.ws === null;
            const pct = total > 0 ? (e.n / total) * 100 : 100;
            return (
              <div key={e.ws ? e.ws.id : '__unassigned__'} className={styles.trackRow}>
                <span
                  className={[
                    styles.trackLabel,
                    !isUnassigned && styles.trackLabelClickable,
                    isUnassigned && styles.trackLabelUnassigned,
                  ].filter(Boolean).join(' ')}
                  onClick={!isUnassigned ? (ev) => { ev.stopPropagation(); onNavigateToStream(e.ws!.id); } : undefined}
                >
                  {e.ws ? e.ws.name : 'Unassigned'}
                </span>
                <div className={styles.trackBar}>
                  <div className={styles.trackFill} style={{ flexBasis: `${pct}%` }}>
                    <SegBar segs={e.segs} height={6} radius={3} />
                  </div>
                  <div className={styles.trackEnd}>
                    <div className={styles.trackMeta}>
                      {[{ n: e.points, label: 'pts' }, ...e.types].map((s, i) => (
                        <span key={s.label} className={styles.trackStat}>
                          {i > 0 && <span className={styles.trackDivider} aria-hidden="true" />}
                          <span className={styles.trackStatN}>{s.n}</span> {s.label}
                        </span>
                      ))}
                    </div>
                    <Sparkline series={e.series} activeIndex={sprintIndex} />
                    <CompletionRing done={e.done} total={e.n} />
                  </div>
                </div>
              </div>
            );
          });
        })()}
      </div>
    </div>
  );
}

export function ReleaseTable({
  release: r,
  team,
  sprintRows,
  workStreamBadges,
  unassignedCount,
  unassignedSegs,
  hasUnassigned,
  dateRange,
  connLabel,
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
  const today = todayISO();
  const activeRowRef = useRef<HTMLDivElement>(null);

  // Center the viewport on the active sprint when the view first loads.
  useEffect(() => {
    activeRowRef.current?.scrollIntoView({ block: 'center' });
  }, []);

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
                <span className="tag" style={{ flex: '0 0 auto' }}>{connLabel}</span>
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

      {/* Work streams strip — same as card view */}
      <div className={styles.streamStrip}>
        <span className="tag" style={{ flexShrink: 0, marginRight: 4, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          {Icon.stream}Work streams
        </span>
        <span style={{ width: 1.5, alignSelf: 'stretch', background: 'var(--rt-line)', flexShrink: 0, margin: '0 4px' }} />
        {workStreamBadges.length === 0 && !hasUnassigned ? (
          <span style={{ fontSize: 'var(--rt-fs-sm)', color: 'var(--rt-t3)' }}>
            No work streams yet — add one with the button above.
          </span>
        ) : (
          <>
            {workStreamBadges.map(({ ws, itemCount, segs }) => (
              <div
                key={ws.id}
                className="card"
                onClick={() => onNavigateToStream(ws.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', flexShrink: 0, background: 'var(--rt-paper)', cursor: 'pointer' }}
              >
                <span style={{ fontSize: 'var(--rt-fs-sm)', fontWeight: 'var(--rt-fw-semibold)', whiteSpace: 'nowrap', color: 'var(--rt-ink)' }}>{ws.name}</span>
                <span className="mono" style={{ fontSize: 'var(--rt-fs-xs)', color: 'var(--rt-t3)' }}>{itemCount}</span>
                {itemCount > 0 && <SegBar segs={segs} height={4} />}
              </div>
            ))}
            {hasUnassigned && (
              <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', flexShrink: 0, background: 'var(--rt-paper)' }}>
                <span style={{ fontSize: 'var(--rt-fs-sm)', fontWeight: 'var(--rt-fw-semibold)', whiteSpace: 'nowrap', color: 'var(--rt-t3)', fontStyle: 'italic' }}>Unassigned</span>
                <span className="mono" style={{ fontSize: 'var(--rt-fs-xs)', color: 'var(--rt-t3)' }}>{unassignedCount}</span>
                <SegBar segs={unassignedSegs} height={4} />
              </div>
            )}
          </>
        )}
      </div>

      <div className={styles.body}>
        {r.sprints.length === 0 ? (
          <div className="card dash" style={{ margin: 24, padding: 40, textAlign: 'center', color: 'var(--rt-t3)', fontSize: 'var(--rt-fs-md)' }}>
            {r.connector ? 'No sprints yet. Run a sync to populate the release plan.' : 'No sprints configured.'}
          </div>
        ) : (
          sprintRows.map((row) => (
            <F3SprintRow
              key={row.sprint.id}
              row={row}
              rowRef={row.isActive ? activeRowRef : undefined}
              isPast={row.sprint.endISO < today && !row.isActive}
              onNavigate={() => onNavigateToSprint(row.sprint.id)}
              onNavigateToStream={onNavigateToStream}
              onOpenEvent={onOpenEvent}
            />
          ))
        )}
      </div>
    </div>
  );
}
