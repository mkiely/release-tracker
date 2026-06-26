import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { selRelease, selTeam, selUnassignedItems, useStore } from '../store/store';
import { useApp } from '../app-context';
import { activeSprint, sumPoints } from '../lib/derive';
import type { Release, Status, Team, WorkItem } from '../types';

export interface BacklogViewProps {
  release: Release;
  team: Team | undefined;
  filteredItems: WorkItem[];
  activeSprintId: string | null;
  totalItemCount: number;
  totalPts: number;
  itemTypes: string[];
  statusFilter: Set<Status>;
  typeFilter: Set<string>;
  isFiltered: boolean;
  groupBySprint: boolean;
  onToggleGroupBy: () => void;
  onHome: () => void;
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

export function useBacklogView(): BacklogViewProps | null {
  const st = useStore();
  const navigate = useNavigate();
  const { openModal, onSync, onPush, notify } = useApp();
  const { id = '' } = useParams();

  const [statusFilter, setStatusFilter] = useState<Set<Status>>(new Set());
  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set());
  const [groupBySprint, setGroupBySprint] = useState(false);

  const r = selRelease(st, id);
  if (!r) return null;

  const team = selTeam(st, r.teamId);
  const items = selUnassignedItems(st, r.id);
  const act = activeSprint(r);
  const totalPts = sumPoints(items);

  const itemTypes = [...new Set(items.map((i) => i.itemType?.label).filter((t): t is string => t !== undefined))];

  const filteredItems = items
    .filter((i) => statusFilter.size === 0 || statusFilter.has(i.status))
    .filter((i) => typeFilter.size === 0 || (i.itemType !== null && typeFilter.has(i.itemType.label)));
  const isFiltered = statusFilter.size > 0 || typeFilter.size > 0;

  return {
    release: r,
    team,
    filteredItems,
    activeSprintId: act ? act.id : null,
    totalItemCount: items.length,
    totalPts,
    itemTypes,
    statusFilter,
    typeFilter,
    isFiltered,
    groupBySprint,
    onToggleGroupBy: () => setGroupBySprint((v) => !v),
    onHome: () => navigate('/'),
    onBack: () => navigate(`/releases/${id}`),
    onOpenTeam: () => { if (r.teamId) openModal({ type: 'team', teamId: r.teamId }); },
    onNewItem: () => openModal({ type: r.connector ? 'connectorItem' : 'item', releaseId: id, presetStreamId: undefined }),
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
