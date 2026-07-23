import type { ReactNode } from 'react';
import type { ReleaseViewProps, WorkStreamBadgeData } from '../hooks/useReleaseView';
import type { StatusSeg } from '../types';
import { missingCapabilities } from '../lib/connectorFields';
import { PushButton, SyncButton } from './chrome';
import { FacetBar } from './FacetBar';
import { ScreenScaffold } from './ScreenScaffold';
import { Icon } from './Icon';
import { SegBar } from './badges';
import { statusVars } from './statusVars';
import { IconButton, PButton } from './primitives';
import { ShareMenu } from './ShareMenu';
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
  | 'onNavigateToBacklog'
  | 'onNavigateToUnassigned'
  | 'onOpenTeam'
  | 'onOpenMetrics'
  | 'velocity'
  | 'overAllocated'
  | 'runwayAlarmCount'
  | 'streamFacetGroups'
  | 'isStreamFiltered'
  | 'hiddenStreamCount'
  | 'onToggleStreamFacet'
  | 'onClearStreamFacets'
  | 'onExport'
  | 'visibleStreamIds'
  | 'onNewEvent'
  | 'onNewStream'
  | 'onEditCodeFreeze'
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
  onNavigateToBacklog,
  onNavigateToUnassigned,
  onOpenTeam,
  onOpenMetrics,
  velocity,
  overAllocated,
  runwayAlarmCount,
  streamFacetGroups,
  isStreamFiltered,
  hiddenStreamCount,
  onToggleStreamFacet,
  onClearStreamFacets,
  onExport,
  visibleStreamIds,
  onNewEvent,
  onNewStream,
  onEditCodeFreeze,
  onSync,
  onPush,
  children,
}: ReleaseChromeProps) {
  const axis = useAxisMode();
  // Capability handshake verdict, from the release's catalog snapshot: which
  // semantic concepts this connector can't express (degraded app features).
  const degraded = missingCapabilities(r.catalog?.itemTypes);

  // Single Metrics chip status: collect the at-a-glance issues across the three
  // sections, tint red when any fire, and default the modal to the worst section.
  const metricsIssues: string[] = [];
  if (overAllocated) metricsIssues.push('Team overbooked');
  if (velocity.verdict === 'under') metricsIssues.push(`Velocity ${velocity.attainmentPct}%`);
  if (runwayAlarmCount > 0) metricsIssues.push(`${runwayAlarmCount} stream${runwayAlarmCount === 1 ? '' : 's'} under-planned`);
  const metricsBad = metricsIssues.length > 0;
  const metricsSection: 'velocity' | 'capacity' | 'runway' = overAllocated ? 'capacity' : runwayAlarmCount > 0 ? 'runway' : 'velocity';
  const metricsTitle = metricsBad ? metricsIssues.join(' · ') : 'Release analysis — velocity, capacity, planning runway';
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
          <button
            type="button"
            className={`tag ${metricsBad ? styles.overTag : styles.allocTag}`}
            onClick={() => onOpenMetrics(metricsSection)}
            title={metricsTitle}
            style={metricsBad ? { color: statusVars('Blocked').dot } : undefined}
          >
            {metricsBad ? Icon.alert : Icon.sprint}
            Release analysis
            {metricsBad && (
              <span
                className="mono"
                style={{ fontSize: 'var(--rt-fs-micro)', fontWeight: 'var(--rt-fw-semibold)', marginLeft: 2 }}
              >
                {metricsIssues.length}
              </span>
            )}
          </button>
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
          {degraded.length > 0 && (
            <span
              className="tag"
              style={{ flex: '0 0 auto', color: 'var(--rt-st-bl-text)', display: 'inline-flex', alignItems: 'center', gap: 4 }}
              title={`This connector's catalog limits some features:\n${degraded.map((m) => `· ${m.impact}`).join('\n')}`}
            >
              {Icon.alert}
              Connector limits
            </span>
          )}
        </>
      }
      right={
        <>
          <PButton variant="subtle" sm icon={Icon.backlog} onClick={onNavigateToBacklog} title="All incomplete work in this release">
            Backlog
          </PButton>
          <ShareMenu release={r} onExport={onExport} visibleStreamIds={visibleStreamIds} />
          <PushButton release={r} onPush={onPush} />
          <SyncButton release={r} onSync={onSync} />
          <PButton variant="subtle" sm icon={Icon.event} onClick={onNewEvent}>
            New event
          </PButton>
          <PButton variant="subtle" sm icon={Icon.snowflake} onClick={onEditCodeFreeze}>
            Code freeze
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
            {axis === 'stream' && streamFacetGroups.some((g) => g.visible) && (
              <>
                <FacetBar groups={streamFacetGroups} onToggle={onToggleStreamFacet} onClear={onClearStreamFacets} />
                {isStreamFiltered && hiddenStreamCount > 0 && (
                  <span style={{ fontSize: 'var(--rt-fs-xs)', color: 'var(--rt-t3)', flexShrink: 0 }}>
                    {hiddenStreamCount} hidden
                  </span>
                )}
                <VDivider stretch />
              </>
            )}
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
                    onClick={onNavigateToUnassigned}
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
