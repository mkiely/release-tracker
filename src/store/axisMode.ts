import { createPersistedStore, oneOf } from './persisted';

/** How the Release plan is indexed: rows are sprints, or rows are work streams. */
export type AxisMode = 'sprint' | 'stream';

export const AXIS_MODES = ['sprint', 'stream'] as const;

export const AxisModeStore = createPersistedStore<AxisMode>({
  key: 'release-tracker:axisMode',
  initial: 'sprint',
  parse: oneOf(AXIS_MODES),
});

export const useAxisMode = AxisModeStore.use;
