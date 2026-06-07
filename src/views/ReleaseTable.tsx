import { useEffect, useRef } from 'react';
import type { ReleaseViewProps } from '../hooks/useReleaseView';
import { fmtShort, todayISO } from '../lib/dates';
import { SegBar, EventBadge } from '../components/badges';
import { ReleaseChrome } from '../components/ReleaseChrome';
import { Sparkline, CompletionRing } from '../components/trend';
import styles from './ReleaseTable.module.css';

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

export function ReleaseTable(props: ReleaseViewProps) {
  const { release: r, sprintRows, onNavigateToSprint, onNavigateToStream, onOpenEvent } = props;
  const today = todayISO();
  const activeRowRef = useRef<HTMLDivElement>(null);

  // Center the viewport on the active sprint when the view first loads.
  useEffect(() => {
    activeRowRef.current?.scrollIntoView({ block: 'center' });
  }, []);

  return (
    <ReleaseChrome {...props}>
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
    </ReleaseChrome>
  );
}
