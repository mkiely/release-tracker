import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { selRelease, selItemsForStream, selTeam, useStore } from '../store/store';
import { useApp } from '../app-context';
import { activeSprint } from '../lib/derive';
import type { Release, Status, Team, WorkItem, WorkStream } from '../types';

export interface WorkStreamViewProps {
  release: Release;
  workStream: WorkStream;
  team: Team | undefined;
  allItems: WorkItem[];
  filteredItems: WorkItem[];
  activeSprintId: string | null;
  totalItemCount: number;
  totalPts: number;
  streamTypes: string[];
  statusFilter: Set<Status>;
  typeFilter: Set<string>;
  isFiltered: boolean;
  onBack: () => void;
  onOpenTeam: () => void;
  onNewItem: () => void;
  onOpenItem: (itemId: string) => void;
  onToggleStatus: (s: Status) => void;
  onToggleType: (t: string) => void;
  onClearFilters: () => void;
  onSync: () => void;
  onPush: () => void;
  notify: (msg: string) => void;
}

export function useWorkStreamView(): WorkStreamViewProps | null {
  const st = useStore();
  const navigate = useNavigate();
  const { openModal, onSync, onPush, notify } = useApp();
  const { id = '', wsId = '' } = useParams();

  const [statusFilter, setStatusFilter] = useState<Set<Status>>(new Set());
  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set());

  const r = selRelease(st, id);
  const ws = r?.workStreams.find((w) => w.id === wsId);
  if (!r || !ws) return null;

  const items = selItemsForStream(st, r.id, ws.id);
  const team = selTeam(st, r.teamId);
  const allItems = st.items.filter((i) => i.releaseId === r.id);
  const act = activeSprint(r);
  const totalPts = items.reduce((a, i) => a + i.points, 0);

  const streamTypes = [...new Set(items.map((i) => i.itemType?.label).filter((t): t is string => t !== undefined))];

  const filteredItems = items
    .filter((i) => statusFilter.size === 0 || statusFilter.has(i.status))
    .filter((i) => typeFilter.size === 0 || (i.itemType !== null && typeFilter.has(i.itemType.label)));
  const isFiltered = statusFilter.size > 0 || typeFilter.size > 0;

  return {
    release: r,
    workStream: ws,
    team,
    allItems,
    filteredItems,
    activeSprintId: act ? act.id : null,
    totalItemCount: items.length,
    totalPts,
    streamTypes,
    statusFilter,
    typeFilter,
    isFiltered,
    onBack: () => navigate(`/releases/${id}`),
    onOpenTeam: () => { if (r.teamId) openModal({ type: 'team', teamId: r.teamId }); },
    onNewItem: () => openModal({ type: 'item', releaseId: id, presetStreamId: ws.id }),
    onOpenItem: (itemId) => openModal({ type: 'itemDetail', itemId }),
    onToggleStatus: (s) =>
      setStatusFilter((prev) => {
        const next = new Set(prev);
        if (next.has(s)) next.delete(s);
        else next.add(s);
        return next;
      }),
    onToggleType: (t) =>
      setTypeFilter((prev) => {
        const next = new Set(prev);
        if (next.has(t)) next.delete(t);
        else next.add(t);
        return next;
      }),
    onClearFilters: () => {
      setStatusFilter(new Set());
      setTypeFilter(new Set());
    },
    onSync: () => onSync(id),
    onPush: () => onPush(id),
    notify,
  };
}
