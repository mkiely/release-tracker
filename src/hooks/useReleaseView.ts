import { useNavigate, useParams } from 'react-router-dom';
import { selItemsForStream, selUnassignedItems, selRelease, selTeam, useStore } from '../store/store';
import { releaseToTSV } from '../lib/exportRelease';
import { useApp } from '../app-context';
import { dOf, fmtShort } from '../lib/dates';
import { activeSprint, eventsIn, sprintVel, statusSegs } from '../lib/derive';
import { connectorLabel } from '../sync/client';
import type { Release, ReleaseEvent, Sprint, StatusSeg, Team, WorkStream } from '../types';

export interface SprintLaneEntry {
  ws: { id: string; name: string } | null;
  n: number;
  segs: StatusSeg[];
}

export interface SprintRowData {
  sprint: Sprint;
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

  const sprintRows: SprintRowData[] = r.sprints.map((sp) => {
    const vel = sprintVel(team, sp, sp.daysOff);
    const spItems = items.filter((i) => i.sprintId === sp.id);
    const planned = spItems.reduce((a, i) => a + i.points, 0);
    const isActive = !!active && active.id === sp.id;
    const evts = eventsIn(r, sp);

    const lane: SprintLaneEntry[] = r.workStreams
      .map((ws) => {
        const its = items.filter((i) => i.workStreamId === ws.id && i.sprintId === sp.id);
        return { ws: ws as { id: string; name: string }, n: its.length, segs: statusSegs(its) };
      })
      .filter((e) => e.n > 0);

    const unassignedInSprint = unassigned.filter((i) => i.sprintId === sp.id);
    if (unassignedInSprint.length > 0) {
      lane.push({ ws: null, n: unassignedInSprint.length, segs: statusSegs(unassignedInSprint) });
    }

    return { sprint: sp, isActive, vel, planned, itemCount: spItems.length, events: evts, lane };
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
