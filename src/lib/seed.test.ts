import { describe, expect, it } from 'vitest';
import { seed } from './seed';
import { SCHEMA_VERSION } from '../types';

describe('seed', () => {
  it('produces state at the current schema version', () => {
    expect(seed().version).toBe(SCHEMA_VERSION);
  });

  it('seeds teams, releases, and items', () => {
    const { teams, releases, items } = seed();
    expect(teams.length).toBeGreaterThan(0);
    expect(releases.length).toBeGreaterThan(0);
    expect(items.length).toBeGreaterThan(0);
  });

  it('sets build: null on all items by default', () => {
    const { items } = seed();
    const missing = items.filter((i) => !('build' in i));
    expect(missing).toHaveLength(0);
  });

  it('seeds Orion 1.5 patch items on the demo release', () => {
    const { items } = seed();
    const patches = items.filter((i) => i.releaseId === 'rel_demo' && i.build === 'Orion 1.5');
    expect(patches).toHaveLength(5);
  });

  it('seeds Nexus Beta 2 patch items on the nexus release', () => {
    const { items } = seed();
    const patches = items.filter((i) => i.releaseId === 'rel_nexus' && i.build === 'Nexus Beta 2');
    expect(patches).toHaveLength(4);
  });

  it('all items with a non-null build belong to an expected build label', () => {
    const { items } = seed();
    const knownBuilds = new Set(['Orion 1.5', 'Nexus Beta 2']);
    const unknown = items.filter((i) => i.build !== null && !knownBuilds.has(i.build));
    expect(unknown).toHaveLength(0);
  });

  it('patch items are assigned to a valid sprint within their release', () => {
    const { releases, items } = seed();
    const patchItems = items.filter((i) => i.build !== null);
    for (const item of patchItems) {
      const release = releases.find((r) => r.id === item.releaseId);
      expect(release).toBeDefined();
      if (item.sprintId !== null) {
        const sprint = release!.sprints.find((s) => s.id === item.sprintId);
        expect(sprint).toBeDefined();
      }
    }
  });
});
