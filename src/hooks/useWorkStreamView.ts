import { useNavigate, useParams } from 'react-router-dom';
import { selRelease, selItemsForStream, selTeam, useStore } from '../store/store';
import { useApp } from '../app-context';
import { activeSprint, sumPoints } from '../lib/derive';
import { applyFacets, buildFacetGroups, catalogItemFacets, isAnyFacetActive, statusFacet, typeFacet } from '../lib/facets';
import type { FacetGroup } from '../lib/facets';
import { useFacetSelections } from './useFacets';
import type { Release, Team, WorkItem, WorkStream } from '../types';

export interface WorkStreamViewProps {
  release: Release;
  workStream: WorkStream;
  team: Team | undefined;
  allItems: WorkItem[];
  filteredItems: WorkItem[];
  activeSprintId: string | null;
  totalItemCount: number;
  totalPts: number;
  facetGroups: FacetGroup<WorkItem>[];
  isFiltered: boolean;
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

export function useWorkStreamView(): WorkStreamViewProps | null {
  const st = useStore();
  const navigate = useNavigate();
  const { openModal, onSync, onPush, notify } = useApp();
  const { id = '', wsId = '' } = useParams();

  const facetState = useFacetSelections(wsId);

  const r = selRelease(st, id);
  const ws = r?.workStreams.find((w) => w.id === wsId);
  if (!r || !ws) return null;

  const items = selItemsForStream(st, r.id, ws.id);
  const team = selTeam(st, r.teamId);
  const allItems = st.items.filter((i) => i.releaseId === r.id);
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
    workStream: ws,
    team,
    allItems,
    filteredItems,
    activeSprintId: act ? act.id : null,
    totalItemCount: items.length,
    totalPts,
    facetGroups,
    isFiltered,
    onHome: () => navigate('/'),
    onBack: () => navigate(`/releases/${id}`),
    onOpenTeam: () => { if (r.teamId) openModal({ type: 'team', teamId: r.teamId }); },
    onNewItem: () => openModal({ type: r.connector ? 'connectorItem' : 'item', releaseId: id, presetStreamId: ws.id }),
    onOpenItem: (itemId) => openModal({ type: 'itemDetail', itemId }),
    onToggleFacet: facetState.toggle,
    onClearFilters: facetState.clear,
    onSync: () => onSync(id),
    onPush: () => onPush(id),
    notify,
  };
}
