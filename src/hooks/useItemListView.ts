import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { selBacklogItems, selRelease, selTeam, selUnassignedItems, useStore } from '../store/store';
import { useApp } from '../app-context';
import { activeSprint, sumPoints } from '../lib/derive';
import {
  applyFacets,
  buildFacetGroups,
  buildItemFacet,
  catalogItemFacets,
  isAnyFacetActive,
  memberFacet,
  statusFacet,
  streamItemFacet,
  typeFacet,
} from '../lib/facets';
import type { FacetGroup } from '../lib/facets';
import { useFacetSelections } from './useFacets';
import type { Release, Team, WorkItem } from '../types';

/**
 * The two flat item-list screens share one view model:
 *  - 'backlog'    — every incomplete item in the release (the team's remaining
 *                   work), whatever its build or stream. Streams mix, so the
 *                   table adds a Work Stream column and stream/build/assignee
 *                   facets; Complete is omitted from the status facet because
 *                   the list holds none by construction.
 *  - 'unassigned' — items on this release's build not yet organized into a
 *                   work stream (build === null && workStreamId === null).
 */
export type ItemListVariant = 'backlog' | 'unassigned';

export interface ItemListViewProps {
  variant: ItemListVariant;
  release: Release;
  team: Team | undefined;
  filteredItems: WorkItem[];
  activeSprintId: string | null;
  totalItemCount: number;
  totalPts: number;
  facetGroups: FacetGroup<WorkItem>[];
  isFiltered: boolean;
  groupBySprint: boolean;
  /** Backlog only: items may belong to streams, so the table shows a Work Stream column. */
  showStreamColumn: boolean;
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

function useItemListView(variant: ItemListVariant): ItemListViewProps | null {
  const st = useStore();
  const navigate = useNavigate();
  const { openModal, onSync, onPush, notify } = useApp();
  const { id = '' } = useParams();

  const facetState = useFacetSelections(`${id}:${variant}`);
  const [groupBySprint, setGroupBySprint] = useState(false);

  const r = selRelease(st, id);
  if (!r) return null;

  const team = selTeam(st, r.teamId);
  const items = variant === 'backlog' ? selBacklogItems(st, r.id) : selUnassignedItems(st, r.id);
  const act = activeSprint(r);
  const totalPts = sumPoints(items);

  const defs =
    variant === 'backlog'
      ? [
          statusFacet(['Complete']),
          typeFacet(),
          memberFacet(team),
          streamItemFacet(r.workStreams),
          buildItemFacet(),
          ...catalogItemFacets(r.catalog),
        ]
      : [statusFacet(), typeFacet(), ...catalogItemFacets(r.catalog)];
  const facetGroups = buildFacetGroups(defs, items, facetState.selections);
  const filteredItems = applyFacets(items, facetGroups);
  const isFiltered = isAnyFacetActive(facetGroups);

  return {
    variant,
    release: r,
    team,
    filteredItems,
    activeSprintId: act ? act.id : null,
    totalItemCount: items.length,
    totalPts,
    facetGroups,
    isFiltered,
    groupBySprint,
    showStreamColumn: variant === 'backlog',
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

export const useBacklogView = (): ItemListViewProps | null => useItemListView('backlog');
export const useUnassignedView = (): ItemListViewProps | null => useItemListView('unassigned');
