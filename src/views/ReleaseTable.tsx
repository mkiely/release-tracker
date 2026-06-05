import type { ReleaseViewProps } from '../hooks/useReleaseView';
import type { Status } from '../types';
import { fmtShort, todayISO } from '../lib/dates';
import { PushButton, SyncButton, TopBar } from '../components/chrome';
import { Icon } from '../components/Icon';
import { SegBar, EventBadge } from '../components/badges';
import { IconButton, PButton } from '../components/primitives';
import { statusVars } from '../components/statusVars';
import styles from './ReleaseTable.module.css';

const STATUS_ABBR: Record<Status, string> = {
  'Not Started':  'N',
  'In Progress':  'P',
  'Under Review': 'R',
  'Blocked':      'B',
  'Complete':     'C',
};

function F3SprintRow({
  row,
  isPast,
  onNavigate,
  onNavigateToStream,
  onOpenEvent,
}: {
  row: ReleaseViewProps['sprintRows'][0];
  isPast: boolean;
  onNavigate: () => void;
  onNavigateToStream: (wsId: string) => void;
  onOpenEvent: (eventId: string) => void;
}) {
  const { sprint: sp, isActive, vel, itemCount, events, lane } = row;

  return (
    <div
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
        ) : (
          lane.map((e) => {
            const isUnassigned = e.ws === null;
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
                  <SegBar segs={e.segs} height={6} radius={3} />
                </div>
                <div className={styles.trackChips}>
                  {e.segs.map((s, i) => {
                    const sv = statusVars(s.k);
                    return (
                      <span
                        key={i}
                        className={styles.trackChip}
                        style={{
                          color: sv.text,
                          border: `1px solid ${sv.dot}55`,
                          background: sv.soft,
                        }}
                      >
                        {s.v}{STATUS_ABBR[s.k]}
                      </span>
                    );
                  })}
                </div>
                <span className={styles.trackTotal}>{e.n}</span>
              </div>
            );
          })
        )}
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
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', flexShrink: 0, background: 'var(--rt-paper)', cursor: 'pointer' }}
              >
                <span style={{ fontSize: 12.5, fontWeight: 650, whiteSpace: 'nowrap', color: 'var(--rt-ink)' }}>{ws.name}</span>
                <span className="mono" style={{ fontSize: 11, color: 'var(--rt-t3)' }}>{itemCount}</span>
                {itemCount > 0 && <SegBar segs={segs} height={4} />}
              </div>
            ))}
            {hasUnassigned && (
              <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', flexShrink: 0, background: 'var(--rt-paper)' }}>
                <span style={{ fontSize: 12.5, fontWeight: 650, whiteSpace: 'nowrap', color: 'var(--rt-t3)', fontStyle: 'italic' }}>Unassigned</span>
                <span className="mono" style={{ fontSize: 11, color: 'var(--rt-t3)' }}>{unassignedCount}</span>
                <SegBar segs={unassignedSegs} height={4} />
              </div>
            )}
          </>
        )}
      </div>

      <div className={styles.body}>
        {r.sprints.length === 0 ? (
          <div className="card dash" style={{ margin: 24, padding: 40, textAlign: 'center', color: 'var(--rt-t3)', fontSize: 14 }}>
            {r.connector ? 'No sprints yet. Run a sync to populate the release plan.' : 'No sprints configured.'}
          </div>
        ) : (
          sprintRows.map((row) => (
            <F3SprintRow
              key={row.sprint.id}
              row={row}
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
