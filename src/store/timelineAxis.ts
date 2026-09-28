import { createPersistedStore, oneOf } from './persisted';

/**
 * What the timeline's x axis is labelled with: real dates, or the sprint names the
 * work is actually assigned to.
 *
 * The geometry never changes — bars stay on the continuous date axis either way, so
 * this is purely which reading of the same positions the labels offer. The union is
 * repeated as a literal on `StreamGantt`'s prop rather than imported from here: the
 * chart is shared with the standalone summary viewer and stays free of the store.
 */
export type TimelineAxis = 'date' | 'sprint';

export const TIMELINE_AXES = ['date', 'sprint'] as const;

export const TimelineAxisStore = createPersistedStore<TimelineAxis>({
  key: 'release-tracker:timelineAxis',
  initial: 'date',
  parse: oneOf(TIMELINE_AXES),
});

export const useTimelineAxis = TimelineAxisStore.use;
