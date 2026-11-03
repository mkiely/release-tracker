import { createPersistedStore, oneOf } from './persisted';

/** How densely a screen renders: spatial cards, or a scannable table. */
export type ViewMode = 'cards' | 'table';

export const VIEW_MODES = ['cards', 'table'] as const;

/** The screens that offer both densities. Backlog and Unassigned are table-only. */
export type DensityScreen = 'release' | 'sprint' | 'stream';

/**
 * The density every screen used before it became per-screen. It survives as the
 * fallback for a screen the user hasn't chosen for yet, so upgrading changes
 * nothing until they pick differently somewhere.
 */
export const ViewModeStore = createPersistedStore<ViewMode>({
  key: 'release-tracker:viewMode',
  initial: 'cards',
  parse: oneOf(VIEW_MODES),
});

type Overrides = Partial<Record<DensityScreen, ViewMode>>;

const valid = new Set<string>(VIEW_MODES);

/** One record rather than a key per screen: it is replaced on every change, so
 *  the store's snapshot stays referentially stable between them. */
export const ScreenViewModeStore = createPersistedStore<Overrides>({
  key: 'release-tracker:viewModes',
  initial: {},
  parse: (raw) => {
    try {
      const o = JSON.parse(raw) as Record<string, unknown>;
      const out: Overrides = {};
      for (const s of ['release', 'sprint', 'stream'] as const) {
        const v = o[s];
        if (typeof v === 'string' && valid.has(v)) out[s] = v as ViewMode;
      }
      return out;
    } catch {
      return undefined;
    }
  },
  serialize: JSON.stringify,
});

/** The density for one screen: its own choice, else the old global one. */
export function useViewMode(screen: DensityScreen): ViewMode {
  const overrides = ScreenViewModeStore.use();
  const fallback = ViewModeStore.use();
  return overrides[screen] ?? fallback;
}

export function setViewMode(screen: DensityScreen, mode: ViewMode) {
  ScreenViewModeStore.set({ ...ScreenViewModeStore.get(), [screen]: mode });
}
