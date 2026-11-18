import type { ReactNode } from 'react';
import type { ReleaseViewProps } from '../hooks/useReleaseView';
import { missingCapabilities } from '../lib/connectorFields';
import { SyncControls } from './AppChrome';
import chromeStyles from './AppChrome.module.css';
import { fmtShort } from '../lib/dates';
import { FacetBar } from './FacetBar';
import { ScreenScaffold } from './ScreenScaffold';
import { Icon } from './Icon';
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

type ReleaseChromeProps = Pick<
  ReleaseViewProps,
  | 'release'
  | 'team'
  | 'dateRange'
  | 'connLabel'
  | 'onBack'
  | 'onNavigateToBacklog'
  | 'onOpenTeam'
  | 'onOpenMetrics'
  | 'onOpenTimeline'
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
 * TopBar and the toolbar row (stream filters + axis toggle). Presenters render
 * only the body.
 */
export function ReleaseChrome({
  release: r,
  team,
  dateRange,
  connLabel,
  onBack,
  onNavigateToBacklog,
  onOpenTeam,
  onOpenMetrics,
  onOpenTimeline,
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
              icon={Icon.timeline}
              onClick={onOpenTimeline}
              title="Work streams on a date axis — where each one's work is scheduled, against today and the code freeze"
            >
              Timeline
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
          {/* The work-stream chips that used to fill this row repeated what the board
              already shows — every lane, Unassigned included, is a link to its stream —
              so the row carries only what the board can't: the stream filters (stream
              axis) and the axis toggle, pinned right so it doesn't move between axes. */}
          <div className={styles.facetZone}>
            {axis === 'stream' && streamFacetGroups.some((g) => g.visible) && (
              <>
                <FacetBar groups={streamFacetGroups} onToggle={onToggleStreamFacet} onClear={onClearStreamFacets} />
                {isStreamFiltered && hiddenStreamCount > 0 && (
                  <span className={`t3 ${styles.hiddenCount}`}>{hiddenStreamCount} hidden</span>
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
