import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { selRelease, selTeam, useStore } from '../store/store';
import { useApp } from '../app-context';
import { activeSprint, capPct, eventsIn, sprintVel } from '../lib/derive';
import { STATUSES, type Member, type Release, type ReleaseEvent, type Sprint, type Status, type Team, type WorkItem, type WorkStream } from '../types';

export type GroupBy = 'stream' | 'status';

export interface StreamColumn {
  ws: WorkStream;
  items: WorkItem[];
}

export interface StatusColumn {
  status: Status;
  items: WorkItem[];
}

export interface SprintViewProps {
  release: Release;
  sprint: Sprint;
  team: Team | undefined;
  isActive: boolean;
  vel: number;
  pct: number;
  totalPts: number;
  events: ReleaseEvent[];
  allItems: WorkItem[];
  filteredItems: WorkItem[];
  streamCols: StreamColumn[];
  unassignedItems: WorkItem[];
  statusCols: StatusColumn[];
  sprintMembers: Member[];
  sprintTypes: string[];
  sprintBuilds: string[];
  groupBy: GroupBy;
  memberFilter: Set<string>;
  statusFilter: Set<Status>;
  typeFilter: Set<string>;
  buildFilter: Set<string>;
  sprintItemCount: number;
  isFiltered: boolean;
  onBack: () => void;
  onGoToSprint: (sprintId: string) => void;
  onNavigateToStream: (wsId: string) => void;
  onEditSprint: () => void;
  onNewItem: () => void;
  onOpenItem: (itemId: string) => void;
  onOpenEvent: (eventId: string) => void;
  onSetGroupBy: (v: GroupBy) => void;
  onToggleMember: (mid: string) => void;
  onToggleStatus: (s: Status) => void;
  onToggleType: (t: string) => void;
  onToggleBuild: (b: string) => void;
  onClearFilters: () => void;
  onSync: () => void;
  onPush: () => void;
  notify: (msg: string) => void;
}

export function useSprintView(): SprintViewProps | null {
  const st = useStore();
  const navigate = useNavigate();
  const { openModal, onSync, onPush, notify } = useApp();
  const { id = '', sprintId = '' } = useParams();

  const [groupBy, setGroupBy] = useState<GroupBy>('stream');
  const [memberFilter, setMemberFilter] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<Set<Status>>(new Set());
  const [buildFilter, setBuildFilter] = useState<Set<string>>(new Set());
  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set());

  useEffect(() => {
    setMemberFilter(new Set());
    setStatusFilter(new Set());
    setBuildFilter(new Set());
    setTypeFilter(new Set());
  }, [sprintId]);

  const r = selRelease(st, id);
  const sp = r?.sprints.find((s) => s.id === sprintId);
  if (!r || !sp) return null;

  const team = selTeam(st, r.teamId);
  const allItems = st.items.filter((i) => i.releaseId === r.id);
  const items = allItems.filter((i) => i.sprintId === sp.id);
  const off = sp.daysOff;
  const pct = Math.round(capPct(team, sp, off) * 100);
  const vel = sprintVel(team, sp, off);
  const act = activeSprint(r);
  const isActive = !!act && act.id === sp.id;
  const evts = eventsIn(r, sp);
  const totalPts = items.reduce((a, i) => a + i.points, 0);

  const sprintTypes = [...new Set(items.map((i) => i.itemType?.label).filter((t): t is string => t !== undefined))];
  const sprintBuilds = [...new Set(items.map((i) => i.build).filter((b): b is string => b !== null))];
  const sprintMembers = (team?.members ?? []).filter((m) => items.some((i) => i.assignedMemberId === m.id));

  const filteredItems = items
    .filter((i) => memberFilter.size === 0 || memberFilter.has(i.assignedMemberId ?? ''))
    .filter((i) => statusFilter.size === 0 || statusFilter.has(i.status))
    .filter((i) => typeFilter.size === 0 || (i.itemType !== null && typeFilter.has(i.itemType.label)))
    .filter((i) => buildFilter.size === 0 || buildFilter.has(i.build ?? ''));

  const streamCols: StreamColumn[] = r.workStreams
    .map((ws) => ({ ws, items: filteredItems.filter((i) => i.workStreamId === ws.id) }))
    .filter((c) => c.items.length > 0);
  const unassignedItems = filteredItems.filter((i) => i.workStreamId === null);

  const statusCols: StatusColumn[] = STATUSES.map((s) => ({
    status: s,
    items: filteredItems.filter((i) => i.status === s),
  }));

  const isFiltered = memberFilter.size > 0 || statusFilter.size > 0 || typeFilter.size > 0 || buildFilter.size > 0;

  function toggleSet<T>(setter: React.Dispatch<React.SetStateAction<Set<T>>>, v: T) {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  }

  return {
    release: r,
    sprint: sp,
    team,
    isActive,
    vel,
    pct,
    totalPts,
    events: evts,
    allItems,
    filteredItems,
    streamCols,
    unassignedItems,
    statusCols,
    sprintMembers,
    sprintTypes,
    sprintBuilds,
    groupBy,
    memberFilter,
    statusFilter,
    typeFilter,
    buildFilter,
    sprintItemCount: items.length,
    isFiltered,
    onBack: () => navigate(`/releases/${id}`),
    onGoToSprint: (sid) => navigate(`/releases/${id}/sprints/${sid}`),
    onNavigateToStream: (wsId) => navigate(`/releases/${id}/streams/${wsId}`),
    onEditSprint: () => openModal({ type: 'sprint', releaseId: id, sprintId: sp.id }),
    onNewItem: () => openModal({ type: 'item', releaseId: id, presetSprintId: sp.id }),
    onOpenItem: (itemId) => openModal({ type: 'itemDetail', itemId }),
    onOpenEvent: (eventId) => openModal({ type: 'event', releaseId: id, eventId }),
    onSetGroupBy: setGroupBy,
    onToggleMember: (mid) => toggleSet(setMemberFilter, mid),
    onToggleStatus: (s) => toggleSet(setStatusFilter, s),
    onToggleType: (t) => toggleSet(setTypeFilter, t),
    onToggleBuild: (b) => toggleSet(setBuildFilter, b),
    onClearFilters: () => {
      setMemberFilter(new Set());
      setStatusFilter(new Set());
      setTypeFilter(new Set());
      setBuildFilter(new Set());
    },
    onSync: () => onSync(id),
    onPush: () => onPush(id),
    notify,
  };
}
