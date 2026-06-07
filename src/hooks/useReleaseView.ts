import { useNavigate, useParams } from 'react-router-dom';
import { selItemsForStream, selUnassignedItems, selRelease, selTeam, useStore } from '../store/store';
import { releaseToTSV } from '../lib/exportRelease';
import { useApp } from '../app-context';
import { dOf, fmtShort } from '../lib/dates';
import { activeSprint, eventsIn, releaseCapacity, sprintVel, statusSegs, streamContention, streamForecast, streamHealth, sumPoints, type StreamForecast, type StreamHealth } from '../lib/derive';
import { connectorLabel } from '../sync/client';
import type { RowData, RowMetrics } from '../lib/rowData';
import type { Release, ReleaseEvent, Sprint, StatusSeg, Team, WorkItem, WorkStream } from '../types';

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
  vel: number;
  planned: number;
  itemCount: number;
  events: ReleaseEvent[];
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
  /** Release-level parallelism: streams with work collectively need more engineers
   *  than the team has. Drives the over-allocation note in the stream table. */
  overAllocated: boolean;
  engineersRequiredTotal: number;
  contributingCount: number;
  onBack: () => void;
  onNavigateToSprint: (sprintId: string) => void;
  onNavigateToStream: (wsId: string) => void;
  onOpenStreamHealth: (wsId: string) => void;
  onEditStream: (wsId: string) => void;
  onOpenTeam: () => void;
  /** Opens the explainer for the release-level over-allocation. */
  onOpenOverbooked: () => void;
  onExport: () => void;
  onNewEvent: () => void;
  onNewStream: () => void;
  onOpenEvent: (eventId: string) => void;
  onSync: () => void;
  onPush: () => void;
}

export function useReleaseView(): ReleaseViewProps | null {
  const st = useStore();
  const navigate = useNavigate();
  const { openModal, onSync, onPush, notify } = useApp();
  const { id = '' } = useParams();

  const r = selRelease(st, id);
  if (!r) return null;

  const team = selTeam(st, r.teamId);
  const items = st.items.filter((i) => i.releaseId === r.id);
  const active = activeSprint(r);
  const unassigned = selUnassignedItems(st, r.id);
  const last = r.sprints.length ? r.sprints[r.sprints.length - 1] : null;

  const dateRange = last
    ? `${fmtShort(r.startISO)} – ${fmtShort(last.endISO)}, ${dOf(last.endISO).getFullYear()}`
    : `${fmtShort(r.startISO)}, ${dOf(r.startISO).getFullYear()}`;

  // Points-per-sprint series for each stream (and the unassigned bucket), used by
  // the per-lane trend sparkline. Computed once, then sliced per row by sprint index.
  const seriesFor = (pred: (i: (typeof items)[number]) => boolean): number[] =>
    r.sprints.map((sp) => sumPoints(items.filter((i) => pred(i) && i.sprintId === sp.id)));
  const streamSeries = new Map<string, number[]>(
    r.workStreams.map((ws) => [ws.id, seriesFor((i) => i.workStreamId === ws.id)]),
  );
  const unassignedIds = new Set(unassigned.map((i) => i.id));
  const unassignedSeries = seriesFor((i) => unassignedIds.has(i.id));

  const sprintRows: SprintRowData[] = r.sprints.map((sp, sprintIndex) => {
    const vel = sprintVel(team, sp, sp.daysOff);
    const spItems = items.filter((i) => i.sprintId === sp.id);
    const planned = sumPoints(spItems);
    const isActive = !!active && active.id === sp.id;
    const evts = eventsIn(r, sp);

    const lane: SprintLaneEntry[] = r.workStreams
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

    return { sprint: sp, sprintIndex, isActive, vel, planned, itemCount: spItems.length, events: evts, lane };
  });

  const workStreamBadges: WorkStreamBadgeData[] = r.workStreams.map((ws) => {
    const its = selItemsForStream(st, r.id, ws.id);
    return { ws, itemCount: its.length, segs: statusSegs(its) };
  });

  // The transpose of sprintRows: one row per work stream, lane = every sprint.
  // First pass collects items + current-state health per stream; contention (the
  // release-level parallelism check) needs every stream's remaining work before any
  // forward forecast can be computed; second pass builds the rows with the forecast.
  const ctx = releaseCapacity(r, team);
  const streamInputs: Array<{ ws: WorkStream | null; items: WorkItem[]; series: number[]; health: StreamHealth }> = [
    ...r.workStreams.map((ws) => ({ ws, items: items.filter((i) => i.workStreamId === ws.id), series: streamSeries.get(ws.id) ?? [] })),
    ...(unassigned.length > 0 ? [{ ws: null as WorkStream | null, items: unassigned, series: unassignedSeries }] : []),
  ].map((s) => ({ ...s, health: streamHealth(s.items) }));

  const contention = streamContention(
    streamInputs
      .filter((s) => s.ws && s.ws.engineersRequired != null && s.health.remainingPts > 0)
      .map((s) => s.ws!.engineersRequired!),
    ctx.contributingCount,
  );

  const streamRows: StreamRowData[] = streamInputs.map(({ ws, items: streamItems, series, health }) => ({
    ws,
    itemCount: streamItems.length,
    points: sumPoints(streamItems),
    segs: statusSegs(streamItems),
    series,
    health,
    forecast: streamForecast(health, ws ? ws.engineersRequired : null, ctx, contention),
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
  }));

  const onExport = async () => {
    const tsv = releaseToTSV(st, id);
    try {
      await navigator.clipboard.writeText(tsv);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = tsv;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
      } finally {
        document.body.removeChild(ta);
      }
    }
    notify('Release copied as TSV — paste into a sheet');
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
    overAllocated: contention.overAllocated,
    engineersRequiredTotal: contention.totalRequired,
    contributingCount: ctx.contributingCount,
    onBack: () => navigate('/'),
    onNavigateToSprint: (spId) => navigate(`/releases/${id}/sprints/${spId}`),
    onNavigateToStream: (wsId) => navigate(`/releases/${id}/streams/${wsId}`),
    onOpenStreamHealth: (wsId) => openModal({ type: 'streamHealth', releaseId: id, wsId }),
    onEditStream: (wsId) => openModal({ type: 'stream', releaseId: id, wsId }),
    onOpenTeam: () => { if (r.teamId) openModal({ type: 'team', teamId: r.teamId }); },
    onOpenOverbooked: () => openModal({ type: 'overbooked', releaseId: id }),
    onExport,
    onNewEvent: () => openModal({ type: 'event', releaseId: id }),
    onNewStream: () => openModal({ type: 'stream', releaseId: id }),
    onOpenEvent: (eventId) => openModal({ type: 'event', releaseId: id, eventId }),
    onSync: () => onSync(id),
    onPush: () => onPush(id),
  };
}
