import { createPersistedStore, oneOf } from './persisted';

/** How the Sprint view groups its work items into columns. */
export type SprintGroupBy = 'stream' | 'status';

export const SPRINT_GROUP_BYS = ['stream', 'status'] as const;

export const SprintGroupByStore = createPersistedStore<SprintGroupBy>({
  key: 'release-tracker:sprintGroupBy',
  initial: 'stream',
  parse: oneOf(SPRINT_GROUP_BYS),
});

export const useSprintGroupBy = SprintGroupByStore.use;
