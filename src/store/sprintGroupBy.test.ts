// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { SprintGroupByStore } from './sprintGroupBy';

describe('SprintGroupByStore', () => {
  beforeEach(() => {
    localStorage.clear();
    SprintGroupByStore.set('stream');
  });

  it('defaults to stream', () => {
    expect(SprintGroupByStore.get()).toBe('stream');
  });

  it('persists the selection to localStorage', () => {
    SprintGroupByStore.set('status');
    expect(SprintGroupByStore.get()).toBe('status');
    expect(localStorage.getItem('release-tracker:sprintGroupBy')).toBe('status');
  });

  it('notifies subscribers on change', () => {
    let hits = 0;
    const unsub = SprintGroupByStore.sub(() => { hits += 1; });
    SprintGroupByStore.set('status');
    SprintGroupByStore.set('stream');
    unsub();
    SprintGroupByStore.set('status');
    expect(hits).toBe(2);
  });
});
