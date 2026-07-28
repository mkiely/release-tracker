import { createPersistedStore, oneOf } from './persisted';

/** How densely every screen renders: spatial cards, or a scannable table. */
export type ViewMode = 'cards' | 'table';

export const VIEW_MODES = ['cards', 'table'] as const;

export const ViewModeStore = createPersistedStore<ViewMode>({
  key: 'release-tracker:viewMode',
  initial: 'cards',
  parse: oneOf(VIEW_MODES),
});

export const useViewMode = ViewModeStore.use;
