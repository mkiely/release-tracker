import { useNavigate, useParams } from 'react-router-dom';
import { selRelease, selItemsForStream, selTeam, useStore } from '../store/store';
import { useApp } from '../app-context';
import { activeSprint, sumPoints, type StreamForecast, type StreamRunway } from '../lib/derive';
import { assessStream } from '../lib/streamAssessment';
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
  /** Forward capacity-fit verdict for this stream, assessed against the whole
   *  release so it matches the row that linked here. */
  forecast: StreamForecast;
  /** Forward planning-runway verdict — the inverse question. */
  runway: StreamRunway;
  /** Opens this stream's assessment detail. */
  onOpenHealth: () => void;
  /** Opens this stream's settings (engineers required, planning status, freeze). */
  onEditStream: () => void;
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

/** View model for one work stream across the release: its items, the facets that
 *  filter them, and the active sprint. Returns null when the release or stream id
 *  doesn't resolve. */
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

  // Assessed across the release, not just this stream: contention is a release-level
  // figure, so a stream viewed on its own must still read against the same demand
  // pool the release screen showed.
  const assessed = assessStream(r, team, allItems, ws.id)!;

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
    forecast: assessed.forecast,
    runway: assessed.runway,
    onOpenHealth: () => openModal({ type: 'streamHealth', releaseId: id, wsId: ws.id }),
    onEditStream: () => openModal({ type: 'stream', releaseId: id, wsId: ws.id }),
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
