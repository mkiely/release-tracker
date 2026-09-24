import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAxisMode } from '../store/axisMode';
import { ExportScopePrefs, type ExportScope } from '../store/exportScope';
import { scopeLabel, scopeStreamIds } from '../lib/exportScope';
import { selItemsForStream, selUnassignedItems, selRelease, selTeam, useStore } from '../store/store';
import { releaseToTSV } from '../lib/exportRelease';
import { copyText } from '../lib/copyLink';
import { applyFacets, buildFacetGroups, buildStreamFacet, catalogStreamFacets, isAnyFacetActive } from '../lib/facets';
import type { FacetGroup } from '../lib/facets';
import { useFacetSelections } from './useFacets';
import { useApp } from '../app-context';
import { dOf, fmtShort, todayISO } from '../lib/dates';
import { activeSprint, freezeOverrides, sprintEventChips, effectiveCodeFreeze, reservationBalance, sprintVel, statusSegs, sumPoints, velocityAttainment, type EventChip, type StreamForecast, type StreamHealth, type StreamRunway, type VelocityAttainment } from '../lib/derive';
import { assessStreams } from '../lib/streamAssessment';
import { sortStreams } from '../lib/streamOrder';
import { freezeChipModal } from './freezeChipModal';
import { connectorLabel } from '../sync/client';
import type { MetricsSection } from '../modals/MetricsModal';
import type { RowData, RowMetrics } from '../lib/rowData';
import type { Release, Sprint, StatusSeg, Team, WorkItem, WorkStream } from '../types';

/** Facet keys whose selection persists per release (survives navigation/reload).
 *  The build filter is the sticky one; every other facet stays ephemeral. Stable
 *  module-level reference so it doesn't re-trigger useFacetSelections' re-seed. */
const RELEASE_PERSIST_FACETS = ['build'] as const;

/** Counts items by their work-item-type label, preserving first-seen order. Untyped items are skipped. */
function typeCounts(items: WorkItem[]): { label: string; n: number }[] {
  const order: string[] = [];
  const counts = new Map<string, number>();
  for (const it of items) {
    const label = it.itemType?.label;
    if (!label) continue;
    if (!counts.has(label)) order.push(label);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return order.map((label) => ({ label, n: counts.get(label)! }));
}

export interface SprintLaneEntry extends RowMetrics {
  ws: { id: string; name: string } | null;
  /** This lane's points per sprint across the whole release, for the trend sparkline. */
  series: number[];
}

interface SprintHeader {
  sprint: Sprint;
  /** This sprint's index within the release (sparkline highlight position). */
  sprintIndex: number;
  isActive: boolean;
  /** Sprint has fully elapsed (endISO before today) and isn't the active sprint. */
  isPast: boolean;
  vel: number;
  planned: number;
  /** Points actually completed in this sprint — meaningful once the sprint is past. */
  donePts: number;
  itemCount: number;
  events: EventChip[];
}

export type SprintRowData = RowData<SprintHeader, SprintLaneEntry>;

export interface WorkStreamBadgeData {
  ws: WorkStream;
  itemCount: number;
  segs: StatusSeg[];
}

/** One sprint's slice of a stream row — the transpose of a SprintLaneEntry. */
export interface StreamLaneEntry extends RowMetrics {
  sprint: Sprint;
  sprintIndex: number;
  isActive: boolean;
}

/** A work stream indexed across the release: row header + per-sprint lane. */
interface StreamHeader {
  /** null = the Unassigned row. */
  ws: WorkStream | null;
  itemCount: number;
  points: number;
  segs: StatusSeg[];
  /** Points per sprint across the release, for the row-header sparkline. */
  series: number[];
  /** Current-state completion metrics for the row. */
  health: StreamHealth;
  /** Forward capacity-fit forecast (verdict + the "why"). */
  forecast: StreamForecast;
  /** Forward planning-runway signal: is enough work created to fill held capacity? */
  runway: StreamRunway;
  /** Remaining points parked in sprints starting after this stream's freeze — work
   *  neither verdict measures, so it rides as its own chip rather than hiding behind
   *  a green one. 0 when nothing is scheduled past the freeze. */
  postFreezePts: number;
}

/** Lane covers every sprint, including empty ones, so cells form aligned columns. */
export type StreamRowData = RowData<StreamHeader, StreamLaneEntry>;

export interface ReleaseViewProps {
  release: Release;
  team: Team | undefined;
  sprintRows: SprintRowData[];
  streamRows: StreamRowData[];
  workStreamBadges: WorkStreamBadgeData[];
  unassignedCount: number;
  unassignedSegs: StatusSeg[];
  hasUnassigned: boolean;
  dateRange: string;
  connLabel: string | null;
  teamVelocity: number;
  /** Actual-vs-planned velocity across elapsed sprints. */
  velocity: VelocityAttainment;
  /** Release-level parallelism: streams with work collectively need more engineers
   *  than the team has. Drives the over-allocation note in the stream table. */
  overAllocated: boolean;
  engineersRequiredTotal: number;
  contributingCount: number;
  /** How many visible streams are firing the planning-runway under-planned alarm.
   *  Feeds the Metrics chip's at-a-glance status. */
  runwayAlarmCount: number;
  /** A rebalancing suggestion when scope-complete streams hold reserved capacity that
   *  could cover at-risk streams' shortfall, else null. A SOFT signal — it does not
   *  count toward the Metrics chip's red issue tally. */
  reservationRebalance: string | null;
  /** Stream-level facets (build + connector-declared), applied on the stream axis
   *  only — the sprint axis always shows every stream's lanes. */
  streamFacetGroups: FacetGroup<WorkStream>[];
  isStreamFiltered: boolean;
  /** How many streams the active facets hide (for the bar's summary text). */
  hiddenStreamCount: number;
  onToggleStreamFacet: (facetKey: string, value: string) => void;
  onClearStreamFacets: () => void;
  onBack: () => void;
  onNavigateToSprint: (sprintId: string) => void;
  onNavigateToStream: (wsId: string) => void;
  /** Opens the true backlog — every incomplete item in the release. */
  onNavigateToBacklog: () => void;
  /** Opens the unassigned list — on-build items not yet in a work stream. */
  onNavigateToUnassigned: () => void;
  onOpenStreamHealth: (wsId: string) => void;
  onEditStream: (wsId: string) => void;
  onOpenTeam: () => void;
  /** Opens the consolidated Metrics modal, optionally at a given section. */
  onOpenMetrics: (section?: MetricsSection) => void;
  /** Opens the work-stream timeline (Gantt) panel. */
  onOpenTimeline: () => void;
  onExport: () => void;
  /** Ids of the streams currently visible under the active stream facets, or undefined
   *  when no facet is active. This is what the VIEW shows — it is deliberately no
   *  longer what Export/Summary emit (see exportScope), because facets only apply on
   *  the stream axis and the export must not change when the axis toggle does. */
  facetVisibleStreamIds: ReadonlySet<string> | undefined;
  /** Explicit scope for the two data actions, chosen in the Share menu. */
  exportScope: ExportScope;
  onSetExportScope: (scope: ExportScope) => void;
  /** Stream ids the current export scope selects; undefined = every stream. */
  exportStreamIds: ReadonlySet<string> | undefined;
  onNewEvent: () => void;
  onNewStream: () => void;
  onOpenEvent: (eventId: string) => void;
  /** Opens the release-level code-freeze editor. */
  onEditCodeFreeze: () => void;
  /** The release's effective code-freeze date, surfaced as a header readout rather
   *  than hidden behind a command button (it's state the whole plan hangs off). */
  codeFreezeISO: string;
  /** The work streams overriding the release freeze with their own date. The readout
   *  carries the count; naming them is what makes the override discoverable without
   *  opening every stream in turn. */
  freezeOverrides: Array<{ id: string; name: string; dateISO: string }>;
  onSync: () => void;
  onPush: () => void;
}

/**
 * View model for the release plan — the app's densest screen, and the one place
 * where the planning maths is assembled.
 *
 * It builds BOTH axes on every render (sprint-indexed rows and their transpose,
 * stream-indexed rows) because the axis toggle must not re-derive, and because
 * the release-level signals — contention, the runway alarm count, the
 * reservation rebalance — are functions of every stream at once and can't be
 * computed row by row.
 *
 * Returns null when the id doesn't resolve, which the route renders as NotFound.
 */
export function useReleaseView(): ReleaseViewProps | null {
  const st = useStore();
  const navigate = useNavigate();
  const { openModal, onSync, onPush, notify } = useApp();
  const { id = '' } = useParams();
  const axis = useAxisMode();
  const facetState = useFacetSelections(id, RELEASE_PERSIST_FACETS);
  // Export scope lives in localStorage, not the store, so a write needs an explicit
  // nudge to re-render. Kept before any early return so hook order stays stable.
  const [, setScopeTick] = useState(0);

  const r = selRelease(st, id);
  if (!r) return null;

  const team = selTeam(st, r.teamId);
  const items = st.items.filter((i) => i.releaseId === r.id);
  const active = activeSprint(r);
  const unassigned = selUnassignedItems(st, r.id);
  const last = r.sprints.length ? r.sprints[r.sprints.length - 1] : null;

  // Stream facets (build + connector-declared filterable stream fields) hide
  // streams from the plan — e.g. selecting only 'Native' on the build facet hides
  // streams carried in from a prior build. Facets are a by-stream concept: they
  // only apply (and are only offered) in the stream-axis views; the sprint axis
  // always shows every stream's lanes.
  const streamFacetGroups = buildFacetGroups(
    [buildStreamFacet(), ...catalogStreamFacets(r.catalog)],
    r.workStreams,
    facetState.selections,
  );
  const isStreamFiltered = isAnyFacetActive(streamFacetGroups);
  const facetsActive = isStreamFiltered && axis === 'stream';
  // Muted streams last, then alphabetical (see lib/streamOrder). The unassigned
  // bucket (ws: null) is appended after these everywhere it appears, so it stays
  // below even the muted ones. sortStreams copies — r.workStreams is store state.
  const streams = sortStreams(facetsActive ? applyFacets(r.workStreams, streamFacetGroups) : r.workStreams);

  const dateRange = last
    ? `${fmtShort(r.startISO)} – ${fmtShort(last.endISO)}, ${dOf(last.endISO).getFullYear()}`
    : `${fmtShort(r.startISO)}, ${dOf(r.startISO).getFullYear()}`;

  // Points-per-sprint series for each stream (and the unassigned bucket), used by
  // the per-lane trend sparkline. Computed once, then sliced per row by sprint index.
  const seriesFor = (pred: (i: (typeof items)[number]) => boolean): number[] =>
    r.sprints.map((sp) => sumPoints(items.filter((i) => pred(i) && i.sprintId === sp.id)));
  const streamSeries = new Map<string, number[]>(
    streams.map((ws) => [ws.id, seriesFor((i) => i.workStreamId === ws.id)]),
  );
  const unassignedIds = new Set(unassigned.map((i) => i.id));
  const unassignedSeries = seriesFor((i) => unassignedIds.has(i.id));

  const today = todayISO();
  const sprintRows: SprintRowData[] = r.sprints.map((sp, sprintIndex) => {
    const vel = sprintVel(team, sp, sp.daysOff);
    const spItems = items.filter((i) => i.sprintId === sp.id);
    const planned = sumPoints(spItems);
    const donePts = sumPoints(spItems.filter((i) => i.status === 'Complete'));
    const isActive = !!active && active.id === sp.id;
    const isPast = sp.endISO < today && !isActive;
    const evts = sprintEventChips(r, sp);

    const lane: SprintLaneEntry[] = streams
      .map((ws) => {
        const its = items.filter((i) => i.workStreamId === ws.id && i.sprintId === sp.id);
        return {
          ws: ws as { id: string; name: string },
          n: its.length,
          points: sumPoints(its),
          done: its.filter((i) => i.status === 'Complete').length,
          segs: statusSegs(its),
          types: typeCounts(its),
          series: streamSeries.get(ws.id) ?? [],
        };
      })
      .filter((e) => e.n > 0);

    const unassignedInSprint = unassigned.filter((i) => i.sprintId === sp.id);
    if (unassignedInSprint.length > 0) {
      lane.push({
        ws: null,
        n: unassignedInSprint.length,
        points: sumPoints(unassignedInSprint),
        done: unassignedInSprint.filter((i) => i.status === 'Complete').length,
        segs: statusSegs(unassignedInSprint),
        types: typeCounts(unassignedInSprint),
        series: unassignedSeries,
      });
    }

    return { sprint: sp, sprintIndex, isActive, isPast, vel, planned, donePts, itemCount: spItems.length, events: evts, lane };
  });

  const workStreamBadges: WorkStreamBadgeData[] = streams.map((ws) => {
    const its = selItemsForStream(st, r.id, ws.id);
    return { ws, itemCount: its.length, segs: statusSegs(its) };
  });

  // The transpose of sprintRows: one row per work stream, lane = every sprint. The
  // verdicts come from the shared assessment so this screen, the metrics modal, the
  // exports and the work-stream screen can't disagree about a stream.
  // Assessed over EVERY stream, then displayed for the facet-visible ones: contention
  // is a release-level fact about the team, so hiding a stream behind a facet must not
  // change what the remaining streams are competing with.
  const assessment = assessStreams(r, team, items, { today, unassignedItems: unassigned });
  const { ctx, contention } = assessment;
  const visibleAssessments = [
    ...streams.map((ws) => assessment.byId.get(ws.id)!),
    ...(unassigned.length > 0 ? [assessment.byId.get(null)!] : []),
  ];

  const streamRows: StreamRowData[] = visibleAssessments.map(({ ws, items: streamItems, health, forecast, runway, postFreezePts }) => {
    return {
      ws,
      itemCount: streamItems.length,
      points: sumPoints(streamItems),
      segs: statusSegs(streamItems),
      series: ws ? (streamSeries.get(ws.id) ?? []) : unassignedSeries,
      health,
      forecast,
      runway,
      postFreezePts,
      lane: r.sprints.map((sp, sprintIndex) => {
        const its = streamItems.filter((i) => i.sprintId === sp.id);
        return {
          sprint: sp,
          sprintIndex,
          isActive: !!active && active.id === sp.id,
          n: its.length,
          points: sumPoints(its),
          done: its.filter((i) => i.status === 'Complete').length,
          segs: statusSegs(its),
          types: typeCounts(its),
        };
      }),
    };
  });

  // The on-screen stream set under the active facets — shared by Export TSV and the
  // summary link so both reflect the same filter. Undefined = no facet active (all).
  const facetVisibleStreamIds = facetsActive ? new Set(streams.map((ws) => ws.id)) : undefined;

  // What LEAVES the app is an explicit choice, not a by-product of the view's
  // filters. Default is the current build; the 'filters' option is only honoured
  // while facets are actually active.
  const exportScope = ExportScopePrefs.get(id, facetsActive);
  const exportStreamIds = scopeStreamIds(exportScope, r.workStreams, facetVisibleStreamIds);
  const exportStreamCount = exportStreamIds ? exportStreamIds.size : r.workStreams.length;

  // The TSV is built synchronously, so a plain copyText still holds the click's
  // activation (this is the one copy action that was never broken). It still has to
  // check the result: the clipboard can be refused for reasons that have nothing to
  // do with how the payload was built.
  const onExport = async () => {
    const copied = await copyText(releaseToTSV(st, id, exportStreamIds));
    notify(
      copied
        ? `Release copied as TSV — ${scopeLabel(exportScope, exportStreamCount)}`
        : 'Couldn’t write to the clipboard — check the browser’s clipboard permission for this site.',
    );
  };

  return {
    release: r,
    team,
    sprintRows,
    streamRows,
    workStreamBadges,
    unassignedCount: unassigned.length,
    unassignedSegs: statusSegs(unassigned),
    hasUnassigned: unassigned.length > 0,
    dateRange,
    connLabel: r.connector ? connectorLabel(r.connector.type) : null,
    teamVelocity: team ? team.velocity : 0,
    velocity: velocityAttainment(r, team, items, today),
    overAllocated: contention.overAllocated,
    engineersRequiredTotal: contention.totalRequired,
    contributingCount: ctx.contributingCount,
    runwayAlarmCount: streamRows.filter((row) => row.runway.alarm).length,
    reservationRebalance: (() => {
      const bal = reservationBalance(
        // Muted streams hold no engineers anyone could move, so a rebalance that
        // named one would suggest a reallocation that isn't there to make.
        streamRows.filter((row) => !row.ws?.muted).map((row) => ({
          name: row.ws ? row.ws.name : 'Unassigned',
          shortfallPts: row.forecast.shortfallPts,
          atRisk: row.forecast.verdict === 'at-risk',
          overReservedPts: row.runway.overReservedPts,
          perEngineerCap: row.runway.perEngineerCap,
        })),
      );
      return bal.rebalanceable ? bal.summary : null;
    })(),
    streamFacetGroups,
    isStreamFiltered,
    hiddenStreamCount: r.workStreams.length - streams.length,
    onToggleStreamFacet: facetState.toggle,
    onClearStreamFacets: facetState.clear,
    onBack: () => navigate('/'),
    onNavigateToSprint: (spId) => navigate(`/releases/${id}/sprints/${spId}`),
    onNavigateToStream: (wsId) => navigate(`/releases/${id}/streams/${wsId}`),
    onNavigateToBacklog: () => navigate(`/releases/${id}/backlog`),
    onNavigateToUnassigned: () => navigate(`/releases/${id}/unassigned`),
    onOpenStreamHealth: (wsId) => openModal({ type: 'streamHealth', releaseId: id, wsId }),
    onEditStream: (wsId) => openModal({ type: 'stream', releaseId: id, wsId }),
    onOpenTeam: () => { if (r.teamId) openModal({ type: 'team', teamId: r.teamId }); },
    onOpenMetrics: (section) => openModal({ type: 'metrics', releaseId: id, section }),
    onOpenTimeline: () => openModal({ type: 'timeline', releaseId: id }),
    onExport,
    facetVisibleStreamIds,
    exportScope,
    exportStreamIds,
    onSetExportScope: (scope) => {
      ExportScopePrefs.set(id, scope);
      // Preference lives outside the store, so nudge React to re-read it.
      setScopeTick((n) => n + 1);
    },
    onNewEvent: () => openModal({ type: 'event', releaseId: id }),
    onNewStream: () => openModal({ type: 'stream', releaseId: id }),
    onOpenEvent: (eventId) => openModal(freezeChipModal(id, eventId)),
    onEditCodeFreeze: () => openModal({ type: 'codeFreeze', releaseId: id }),
    codeFreezeISO: effectiveCodeFreeze(r),
    freezeOverrides: freezeOverrides(r),
    onSync: () => onSync(id),
    onPush: () => onPush(id),
  };
}
