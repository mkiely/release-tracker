import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { ReleaseViewProps, WorkStreamBadgeData } from '../hooks/useReleaseView';
import type { StatusSeg } from '../types';
import { missingCapabilities } from '../lib/connectorFields';
import { SyncControls } from './AppChrome';
import chromeStyles from './AppChrome.module.css';
import { fmtShort } from '../lib/dates';
import { FacetBar } from './FacetBar';
import { ScreenScaffold } from './ScreenScaffold';
import { Icon } from './Icon';
import { SegBar } from './Badges';
import { statusVars, warningVars } from './statusVars';
import { IconButton, PButton } from './primitives';
import { ShareMenu } from './ShareMenu';
import { SegmentedToggle } from './SegmentedToggle';
import { TeamLink } from './TeamLink';
import { VDivider } from './VDivider';
import { AxisModeStore, useAxisMode, type AxisMode } from '../store/axisMode';
import { useAutoSync } from '../hooks/useAutoSync';
import { useMediaQuery, NARROW_CHROME } from '../hooks/useMediaQuery';
import styles from './ReleaseChrome.module.css';

/**
 * Tracks how much of a horizontally scrolling strip is out of view: whether each
 * edge has content past it (drives the fades) and how many whole children are
 * hidden past the right edge (drives the "+N" count). Recomputed on scroll and on
 * resize, so the affordance never claims an overflow that isn't there.
 */
function useStripOverflow(ref: React.RefObject<HTMLDivElement>, deps: unknown[]) {
  const [state, setState] = useState({ hidden: 0, atStart: true, atEnd: true });

  // Stable so callers can re-measure straight after a programmatic scroll rather
  // than waiting on a scroll event, which isn't guaranteed to arrive.
  const remeasure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const right = el.scrollLeft + el.clientWidth;
    let hidden = 0;
    for (const child of Array.from(el.children)) {
      const c = child as HTMLElement;
      if (c.offsetLeft + c.offsetWidth > right + 1) hidden++;
    }
    setState({ hidden, atStart: el.scrollLeft <= 1, atEnd: max <= 1 || el.scrollLeft >= max - 1 });
  }, [ref]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    remeasure();
    el.addEventListener('scroll', remeasure, { passive: true });
    const ro = new ResizeObserver(remeasure);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', remeasure);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, remeasure, ...deps]);

  return { ...state, remeasure };
}

/** Most overriding streams the freeze readout's tooltip names before it summarizes
 *  the rest — a title attribute that runs past a handful of lines stops being read. */
const FREEZE_TOOLTIP_MAX = 6;

/** Tooltip for the freeze readout: the release date, then which streams override it
 *  and when. The count alone left the "+N" undiscoverable — you had to open every
 *  stream's assessment modal in turn to find out who was behind it. */
function freezeTitle(codeFreezeISO: string, overrides: Array<{ name: string; dateISO: string }>): string {
  const head = `Release code freeze ${fmtShort(codeFreezeISO)}`;
  if (overrides.length === 0) return `${head}. Click to edit.`;
  const lines = overrides.slice(0, FREEZE_TOOLTIP_MAX).map((o) => {
    const rel = o.dateISO < codeFreezeISO ? ' (earlier)' : o.dateISO > codeFreezeISO ? ' (later)' : '';
    return `\xb7 ${o.name} — ${fmtShort(o.dateISO)}${rel}`;
  });
  const rest = overrides.length - lines.length;
  if (rest > 0) lines.push(`\xb7 +${rest} more`);
  return [`${head}`, `Overridden by ${overrides.length} work stream${overrides.length === 1 ? '' : 's'}:`, ...lines, 'Click to edit.'].join('\n');
}

/** One pill in the work-streams strip. Identical for assigned and unassigned lanes. */
function StreamBadge({
  name,
  count,
  segs,
  showSeg,
  unassigned,
  freezeOverride,
  onClick,
}: {
  name: string;
  count: number;
  segs: StatusSeg[];
  showSeg: boolean;
  unassigned?: boolean;
  /** This stream overrides the release freeze with its own date. */
  freezeOverride?: string | null;
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
      {freezeOverride && (
        <span className={styles.badgeFreeze} title={`Own code freeze: ${fmtShort(freezeOverride)}`}>
          {Icon.snowflake}
        </span>
      )}
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
  | 'reservationRebalance'
  | 'streamFacetGroups'
  | 'isStreamFiltered'
  | 'hiddenStreamCount'
  | 'onToggleStreamFacet'
  | 'onClearStreamFacets'
  | 'onExport'
  | 'facetVisibleStreamIds'
  | 'exportScope'
  | 'onSetExportScope'
  | 'exportStreamIds'
  | 'onNewEvent'
  | 'onNewStream'
  | 'onEditCodeFreeze'
  | 'codeFreezeISO'
  | 'freezeOverrides'
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
  reservationRebalance,
  streamFacetGroups,
  isStreamFiltered,
  hiddenStreamCount,
  onToggleStreamFacet,
  onClearStreamFacets,
  onExport,
  facetVisibleStreamIds,
  exportScope,
  onSetExportScope,
  exportStreamIds,
  onNewEvent,
  onNewStream,
  onEditCodeFreeze,
  codeFreezeISO,
  freezeOverrides,
  onSync,
  onPush,
  children,
}: ReleaseChromeProps) {
  const axis = useAxisMode();
  // Collapse ladder: below this width the "add" zone drops to icon-only, before
  // anything in the navigate or exchange zones gives ground.
  const narrow = useMediaQuery(NARROW_CHROME);
  const stripRef = useRef<HTMLDivElement>(null);
  const overflow = useStripOverflow(stripRef, [workStreamBadges.length, hasUnassigned, axis, isStreamFiltered]);
  // Background auto-sync while this release is open, at its configured cadence (off by default).
  useAutoSync(r);
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
  // Over-reservation is a soft rebalancing suggestion — it tints the chip amber but
  // does NOT add to the red issue tally (which is for problems, not opportunities).
  const metricsSoft = !metricsBad && !!reservationRebalance;
  const metricsSection: 'velocity' | 'capacity' | 'runway' =
    overAllocated ? 'capacity' : runwayAlarmCount > 0 || reservationRebalance ? 'runway' : 'velocity';
  const metricsTitle = metricsBad
    ? metricsIssues.join(' · ') + (reservationRebalance ? ` · ${reservationRebalance}` : '')
    : reservationRebalance ?? 'Release analysis — velocity, capacity, planning runway';
  return (
    <ScreenScaffold
      left={<IconButton icon={Icon.chevLeft} title="Back" onClick={onBack} />}
      crumbs={[{ label: 'Releases', onClick: onBack }, { label: r.name }]}
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
          <span style={{ opacity: 0.5 }}>·</span>
          {/* Code freeze reads as state, not a command: it's the date the whole plan
              hangs off and it almost never changes, so it states its value here
              instead of hiding behind a button that showed nothing. */}
          <button
            type="button"
            className={styles.freezeTag}
            onClick={onEditCodeFreeze}
            title={freezeTitle(codeFreezeISO, freezeOverrides)}
          >
            {Icon.snowflake}
            Freeze {fmtShort(codeFreezeISO)}
            {freezeOverrides.length > 0 && (
              <span className="mono" style={{ fontSize: 'var(--rt-fs-micro)', fontWeight: 'var(--rt-fw-semibold)', marginLeft: 2 }}>
                +{freezeOverrides.length}
              </span>
            )}
          </button>
          {degraded.length > 0 && (
            <span
              className="tag"
              style={{ flex: '0 0 auto', color: 'var(--rt-st-bl-text)', display: 'inline-flex', alignItems: 'center', gap: 4 }}
              title={`This connector's catalog limits some features:\n${degraded.map((m) => `· ${m.impact}`).join('\n')}`}
            >
              {Icon.alert}
            </span>
          )}
        </>
      }
      right={
        <>
          {/* Navigate — destinations. Never collapses. */}
          <span className={`${chromeStyles.actionZone} ${chromeStyles.navZone}`}>
            <PButton variant="subtle" sm icon={Icon.backlog} onClick={onNavigateToBacklog} title="All incomplete work in this release">
              Backlog
            </PButton>
            <PButton
              variant="subtle"
              sm
              icon={metricsBad || metricsSoft ? Icon.alert : Icon.sprint}
              onClick={() => onOpenMetrics(metricsSection)}
              title={metricsTitle}
              style={
                metricsBad
                  ? { color: statusVars('Blocked').text, borderColor: 'var(--rt-st-bl-soft)', background: 'var(--rt-st-bl-soft)' }
                  : metricsSoft
                    ? { color: warningVars().text }
                    : undefined
              }
            >
              Analysis
              {metricsBad && (
                <span className="mono" style={{ fontSize: 'var(--rt-fs-micro)', fontWeight: 'var(--rt-fw-semibold)', marginLeft: 2 }}>
                  {metricsIssues.length}
                </span>
              )}
            </PButton>
          </span>
          <VDivider />
          {/* Exchange — data in from the connector, data out to people. */}
          <span className={chromeStyles.actionZone}>
            <SyncControls release={r} onSync={onSync} onPush={onPush} />
            <ShareMenu
              release={r}
              onExport={onExport}
              workStreams={r.workStreams}
              facetVisibleStreamIds={facetVisibleStreamIds}
              facetsActive={!!facetVisibleStreamIds}
              scope={exportScope}
              onSetScope={onSetExportScope}
              exportStreamIds={exportStreamIds}
            />
          </span>
          <VDivider />
          {/* Add — creation only, not release configuration. First zone to shed its
              labels when the row runs out of room. */}
          <span className={chromeStyles.actionZone}>
            {narrow ? (
              <IconButton icon={Icon.event} title="New event" onClick={onNewEvent} />
            ) : (
              <PButton variant="subtle" sm icon={Icon.event} onClick={onNewEvent}>
                New event
              </PButton>
            )}
            {!r.connector &&
              (narrow ? (
                <IconButton icon={Icon.plus} title="New work stream" onClick={onNewStream} />
              ) : (
                <PButton sm icon={Icon.plus} onClick={onNewStream}>
                  New work stream
                </PButton>
              ))}
          </span>
        </>
      }
      toolbar={
        <div className={styles.toolbar}>
          <div className={styles.stripZone}>
          <div className={styles.streamStrip} ref={stripRef}>
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
                    freezeOverride={ws.codeFreezeISO}
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
            <span className={`${styles.fadeEdge} ${styles.fadeStart}`} data-on={!overflow.atStart || undefined} />
            <span className={`${styles.fadeEdge} ${styles.fadeEnd}`} data-on={!overflow.atEnd || undefined} />
          </div>
          {overflow.hidden > 0 && (
            <button
              type="button"
              className={styles.moreStreams}
              title={`${overflow.hidden} more work stream${overflow.hidden === 1 ? '' : 's'} — click to scroll`}
              // Jump, don't animate. Smooth scrolling (via scrollTo's behavior option
              // or CSS scroll-behavior) is a no-op under prefers-reduced-motion and in
              // some environments, which would leave this button appearing to do
              // nothing at all — the point is revealing the streams, not the motion.
              onClick={() => {
                const el = stripRef.current;
                if (!el) return;
                el.scrollLeft = el.scrollWidth;
                overflow.remeasure();
              }}
            >
              +{overflow.hidden}
            </button>
          )}
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
