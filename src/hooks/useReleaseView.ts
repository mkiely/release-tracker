import { useNavigate, useParams } from 'react-router-dom';
import { selItemsForStream, selUnassignedItems, selRelease, selTeam, useStore } from '../store/store';
import { releaseToTSV } from '../lib/exportRelease';
import { useApp } from '../app-context';
import { dOf, fmtShort } from '../lib/dates';
import { activeSprint, eventsIn, sprintVel, statusSegs } from '../lib/derive';
import { connectorLabel } from '../sync/client';
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

export interface SprintLaneEntry {
  ws: { id: string; name: string } | null;
  n: number;
  points: number;
  /** Count of items in the 'Complete' status — drives the completion ring. */
  done: number;
  segs: StatusSeg[];
  /** Per work-item-type counts (e.g. Story/Bug/Task), in first-seen order. */
  types: { label: string; n: number }[];
  /** This lane's points per sprint across the whole release, for the trend sparkline. */
  series: number[];
}

export interface SprintRowData {
  sprint: Sprint;
  /** This sprint's index within the release (sparkline highlight position). */
  sprintIndex: number;
  isActive: boolean;
  vel: number;
  planned: number;
  itemCount: number;
  events: ReleaseEvent[];
  lane: SprintLaneEntry[];
}

export interface WorkStreamBadgeData {
  ws: WorkStream;
  itemCount: number;
  segs: StatusSeg[];
}

export interface ReleaseViewProps {
  release: Release;
  team: Team | undefined;
  sprintRows: SprintRowData[];
  workStreamBadges: WorkStreamBadgeData[];
  unassignedCount: number;
  unassignedSegs: StatusSeg[];
  hasUnassigned: boolean;
  dateRange: string;
  connLabel: string | null;
  teamVelocity: number;
  onBack: () => void;
  onNavigateToSprint: (sprintId: string) => void;
  onNavigateToStream: (wsId: string) => void;
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
  const sumPoints = (its: typeof items) => its.reduce((a, i) => a + i.points, 0);
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
    const planned = spItems.reduce((a, i) => a + i.points, 0);
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
    workStreamBadges,
    unassignedCount: unassigned.length,
    unassignedSegs: statusSegs(unassigned),
    hasUnassigned: unassigned.length > 0,
    dateRange,
    connLabel: r.connector ? connectorLabel(r.connector.type) : null,
    teamVelocity: team ? team.velocity : 0,
    onBack: () => navigate('/'),
    onNavigateToSprint: (spId) => navigate(`/releases/${id}/sprints/${spId}`),
    onNavigateToStream: (wsId) => navigate(`/releases/${id}/streams/${wsId}`),
    onExport,
    onNewEvent: () => openModal({ type: 'event', releaseId: id }),
    onNewStream: () => openModal({ type: 'stream', releaseId: id }),
    onOpenEvent: (eventId) => openModal({ type: 'event', releaseId: id, eventId }),
    onSync: () => onSync(id),
    onPush: () => onPush(id),
  };
}
