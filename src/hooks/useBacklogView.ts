import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { selRelease, selTeam, selUnassignedItems, useStore } from '../store/store';
import { useApp } from '../app-context';
import { activeSprint, sumPoints } from '../lib/derive';
import { applyFacets, buildFacetGroups, catalogItemFacets, isAnyFacetActive, statusFacet, typeFacet } from '../lib/facets';
import type { FacetGroup } from '../lib/facets';
import { useFacetSelections } from './useFacets';
import type { Release, Team, WorkItem } from '../types';

export interface BacklogViewProps {
  release: Release;
  team: Team | undefined;
  filteredItems: WorkItem[];
  activeSprintId: string | null;
  totalItemCount: number;
  totalPts: number;
  facetGroups: FacetGroup<WorkItem>[];
  isFiltered: boolean;
  groupBySprint: boolean;
  onToggleGroupBy: () => void;
  onHome: () => void;
  onBack: () => void;
  onOpenTeam: () => void;
  onNewItem: () => void;
  onOpenItem: (itemId: string) => void;
  onToggleFacet: (facetKey: string, value: string) => void;
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

  const facetState = useFacetSelections(id);
  const [groupBySprint, setGroupBySprint] = useState(false);

  const r = selRelease(st, id);
  if (!r) return null;

  const team = selTeam(st, r.teamId);
  const items = selUnassignedItems(st, r.id);
  const act = activeSprint(r);
  const totalPts = sumPoints(items);

  const facetGroups = buildFacetGroups(
    [statusFacet(), typeFacet(), ...catalogItemFacets(r.catalog)],
    items,
    facetState.selections,
  );
  const filteredItems = applyFacets(items, facetGroups);
  const isFiltered = isAnyFacetActive(facetGroups);

  return {
    release: r,
    team,
    filteredItems,
    activeSprintId: act ? act.id : null,
    totalItemCount: items.length,
    totalPts,
    facetGroups,
    isFiltered,
    groupBySprint,
    onToggleGroupBy: () => setGroupBySprint((v) => !v),
    onHome: () => navigate('/'),
    onBack: () => navigate(`/releases/${id}`),
    onOpenTeam: () => { if (r.teamId) openModal({ type: 'team', teamId: r.teamId }); },
    onNewItem: () => openModal({ type: r.connector ? 'connectorItem' : 'item', releaseId: id, presetStreamId: undefined }),
    onOpenItem: (itemId) => openModal({ type: 'itemDetail', itemId }),
    onToggleFacet: facetState.toggle,
    onClearFilters: facetState.clear,
    onSync: () => onSync(id),
    onPush: () => onPush(id),
    notify,
  };
}
