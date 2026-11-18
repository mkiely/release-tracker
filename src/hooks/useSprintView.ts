import { useNavigate, useParams } from 'react-router-dom';
import { SprintGroupByStore, useSprintGroupBy } from '../store/sprintGroupBy';
import { selRelease, selTeam, useStore } from '../store/store';
import { useApp } from '../app-context';
import { activeSprint, capPct, sprintEventChips, sprintVel, sumPoints, type EventChip } from '../lib/derive';
import { freezeChipModal } from './freezeChipModal';
import { applyFacets, buildFacetGroups, buildItemFacet, catalogItemFacets, isAnyFacetActive, memberFacet, statusFacet, typeFacet } from '../lib/facets';
import type { FacetGroup } from '../lib/facets';
import { useFacetSelections } from './useFacets';
import { useItemSearch, type ItemSearch } from './useItemSearch';
import { matchesQuery } from '../lib/search';
import { todayISO } from '../lib/dates';
import { sprintReview } from '../lib/sprintHistory';
import { reviewReadout, type ReviewReadout } from '../lib/historyReadouts';
import { STATUSES, type Release, type Sprint, type Status, type Team, type WorkItem, type WorkStream } from '../types';

export type { SprintGroupBy as GroupBy } from '../store/sprintGroupBy';
import type { SprintGroupBy as GroupBy } from '../store/sprintGroupBy';

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
  events: EventChip[];
  allItems: WorkItem[];
  filteredItems: WorkItem[];
  streamCols: StreamColumn[];
  unassignedItems: WorkItem[];
  statusCols: StatusColumn[];
  facetGroups: FacetGroup<WorkItem>[];
  groupBy: GroupBy;
  sprintItemCount: number;
  /** What the sprint's readings say it committed to and did; null when it was never
   *  observed (or hasn't started), and then the header says nothing rather than zero. */
  review: ReviewReadout | null;
  onOpenReview: () => void;
  isFiltered: boolean;
  onHome: () => void;
  onBack: () => void;
  onGoToSprint: (sprintId: string) => void;
  onNavigateToStream: (wsId: string) => void;
  onOpenTeam: () => void;
  onEditSprint: () => void;
  onNewItem: () => void;
  onOpenItem: (itemId: string) => void;
  onOpenEvent: (eventId: string) => void;
  onSetGroupBy: (v: GroupBy) => void;
  search: ItemSearch;
  onToggleFacet: (facetKey: string, value: string) => void;
  onClearFilters: () => void;
  onSync: () => void;
  onPush: () => void;
  notify: (msg: string) => void;
}

/** View model for one sprint: its items grouped by work stream or by status
 *  (a persisted preference), the capacity reading, and the events falling inside
 *  it. Returns null when the release or sprint id doesn't resolve. */
export function useSprintView(): SprintViewProps | null {
  const st = useStore();
  const navigate = useNavigate();
  const { openModal, onSync, onPush, notify } = useApp();
  const { id = '', sprintId = '' } = useParams();

  const groupBy = useSprintGroupBy();
  const facetState = useFacetSelections(sprintId);
  const search = useItemSearch(sprintId);

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
  const evts = sprintEventChips(r, sp);
  const totalPts = sumPoints(items);
  const today = todayISO();
  const recorded = sprintReview(r, sp, today);
  const review = recorded ? reviewReadout(recorded, today) : null;

  const facetGroups = buildFacetGroups(
    [memberFacet(team), statusFacet(), typeFacet(), buildItemFacet(), ...catalogItemFacets(r.catalog)],
    items,
    facetState.selections,
  );
  const filteredItems = applyFacets(items, facetGroups).filter((i) => matchesQuery(i, search.query));
  const isFiltered = isAnyFacetActive(facetGroups) || search.query.trim() !== '';

  const streamCols: StreamColumn[] = r.workStreams
    .map((ws) => ({ ws, items: filteredItems.filter((i) => i.workStreamId === ws.id) }))
    .filter((c) => c.items.length > 0);
  const unassignedItems = filteredItems.filter((i) => i.workStreamId === null);

  const statusCols: StatusColumn[] = STATUSES.map((s) => ({
    status: s,
    items: filteredItems.filter((i) => i.status === s),
  }));

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
    facetGroups,
    groupBy,
    sprintItemCount: items.length,
    review,
    onOpenReview: () => openModal({ type: 'sprintReview', releaseId: id, sprintId: sp.id }),
    isFiltered,
    onHome: () => navigate('/'),
    onBack: () => navigate(`/releases/${id}`),
    onGoToSprint: (sid) => navigate(`/releases/${id}/sprints/${sid}`),
    onNavigateToStream: (wsId) => navigate(`/releases/${id}/streams/${wsId}`),
    onOpenTeam: () => { if (r.teamId) openModal({ type: 'team', teamId: r.teamId }); },
    onEditSprint: () => openModal({ type: 'sprint', releaseId: id, sprintId: sp.id }),
    onNewItem: () => openModal({ type: r.connector ? 'connectorItem' : 'item', releaseId: id, presetSprintId: sp.id }),
    onOpenItem: (itemId) => openModal({ type: 'itemDetail', itemId }),
    onOpenEvent: (eventId) => openModal(freezeChipModal(id, eventId)),
    onSetGroupBy: SprintGroupByStore.set,
    onToggleFacet: facetState.toggle,
    search,
    onClearFilters: () => {
      facetState.clear();
      search.setQuery('');
    },
    onSync: () => onSync(id),
    onPush: () => onPush(id),
    notify,
  };
}
