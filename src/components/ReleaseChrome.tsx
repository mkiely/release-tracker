import type { ReactNode } from 'react';
import type { ReleaseViewProps, WorkStreamBadgeData } from '../hooks/useReleaseView';
import type { StatusSeg } from '../types';
import { PushButton, SyncButton } from './chrome';
import { ScreenScaffold } from './ScreenScaffold';
import { Icon } from './Icon';
import { SegBar } from './badges';
import { IconButton, PButton } from './primitives';
import { SegmentedToggle } from './SegmentedToggle';
import { TeamLink } from './TeamLink';
import { VDivider } from './VDivider';
import { AxisModeStore, useAxisMode, type AxisMode } from '../store/axisMode';
import styles from './ReleaseChrome.module.css';

/** One pill in the work-streams strip. Identical for assigned and unassigned lanes. */
function StreamBadge({
  name,
  count,
  segs,
  showSeg,
  unassigned,
  onClick,
}: {
  name: string;
  count: number;
  segs: StatusSeg[];
  showSeg: boolean;
  unassigned?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      className="card"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '5px 10px',
        flexShrink: 0,
        background: 'var(--rt-paper)',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <span
        style={{
          fontSize: 'var(--rt-fs-sm)',
          fontWeight: 'var(--rt-fw-semibold)',
          whiteSpace: 'nowrap',
          color: unassigned ? 'var(--rt-t3)' : 'var(--rt-ink)',
          fontStyle: unassigned ? 'italic' : undefined,
        }}
      >
        {name}
      </span>
      <span className="mono" style={{ fontSize: 'var(--rt-fs-xs)', color: 'var(--rt-t3)' }}>{count}</span>
      {showSeg && <SegBar segs={segs} height={4} />}
    </div>
  );
}

type ReleaseChromeProps = Pick<
  ReleaseViewProps,
  | 'release'
  | 'team'
  | 'dateRange'
  | 'connLabel'
  | 'workStreamBadges'
  | 'unassignedCount'
  | 'unassignedSegs'
  | 'hasUnassigned'
  | 'onBack'
  | 'onNavigateToStream'
  | 'onOpenTeam'
  | 'onOpenOverbooked'
  | 'overAllocated'
  | 'onExport'
  | 'onNewEvent'
  | 'onNewStream'
  | 'onSync'
  | 'onPush'
> & { children: ReactNode };

/**
 * Shared chrome for every Release presenter (card/table × sprint/stream): the
 * TopBar and the work-streams strip. Presenters render only the body.
 */
export function ReleaseChrome({
  release: r,
  team,
  dateRange,
  connLabel,
  workStreamBadges,
  unassignedCount,
  unassignedSegs,
  hasUnassigned,
  onBack,
  onNavigateToStream,
  onOpenTeam,
  onOpenOverbooked,
  overAllocated,
  onExport,
  onNewEvent,
  onNewStream,
  onSync,
  onPush,
  children,
}: ReleaseChromeProps) {
  const axis = useAxisMode();
  return (
    <ScreenScaffold
      left={<IconButton icon={Icon.chevLeft} title="Back" onClick={onBack} />}
      title={r.name}
      titleIcon={Icon.release}
      sub={
        <>
          {team ? (
            <TeamLink name={team.name} onClick={onOpenTeam} />
          ) : (
            <>
              {Icon.team}
              <span>—</span>
            </>
          )}
          {overAllocated && (
            <button
              type="button"
              className={`tag ${styles.overTag}`}
              onClick={onOpenOverbooked}
              title="Team over-allocated — view details"
            >
              {Icon.alert}
              Overbooked
            </button>
          )}
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
      toolbar={
        <div className={styles.toolbar}>
          <div className={styles.streamStrip}>
            <span
              className="tag"
              style={{ flexShrink: 0, marginRight: 4, display: 'inline-flex', alignItems: 'center', gap: 5 }}
            >
              {Icon.stream}Work streams
            </span>
            <VDivider stretch />
            {workStreamBadges.length === 0 && !hasUnassigned ? (
              <span style={{ fontSize: 'var(--rt-fs-sm)', color: 'var(--rt-t3)' }}>
                No work streams yet — add one with the button above.
              </span>
            ) : (
              <>
                {workStreamBadges.map(({ ws, itemCount, segs }: WorkStreamBadgeData) => (
                  <StreamBadge
                    key={ws.id}
                    name={ws.name}
                    count={itemCount}
                    segs={segs}
                    showSeg={itemCount > 0}
                    onClick={() => onNavigateToStream(ws.id)}
                  />
                ))}
                {hasUnassigned && (
                  <StreamBadge
                    name="Unassigned"
                    count={unassignedCount}
                    segs={unassignedSegs}
                    showSeg
                    unassigned
                  />
                )}
              </>
            )}
          </div>
          <div className={styles.axisSlot}>
            <SegmentedToggle<AxisMode>
              ariaLabel="Index release by"
              value={axis}
              onChange={AxisModeStore.set}
              options={[
                { value: 'sprint', label: 'By sprint', icon: Icon.sprint, title: 'Rows are sprints' },
                { value: 'stream', label: 'By stream', icon: Icon.stream, title: 'Rows are work streams' },
              ]}
            />
          </div>
        </div>
      }
    >
      {children}
    </ScreenScaffold>
  );
}
