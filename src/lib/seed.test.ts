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
    const { releases, items } = seed();
    const nexus = releases.find((r) => r.id === 'rel_nexus')!;
    const carriedStreamIds = new Set(nexus.workStreams.filter((w) => w.build !== null).map((w) => w.id));
    // Patches sit in native streams; exclude items belonging to a carried-in stream.
    const patches = items.filter(
      (i) => i.releaseId === 'rel_nexus' && i.build === 'Nexus Beta 2' && !carriedStreamIds.has(i.workStreamId ?? ''),
    );
    expect(patches).toHaveLength(4);
  });

  it('seeds a carried-in (off-build) work stream with items on the nexus release', () => {
    const { releases, items } = seed();
    const nexus = releases.find((r) => r.id === 'rel_nexus')!;
    const carried = nexus.workStreams.filter((w) => w.build !== null);
    expect(carried).toHaveLength(1);
    expect(carried[0].build).toBe('Nexus Beta 2');
    expect(items.filter((i) => i.workStreamId === carried[0].id)).toHaveLength(2);
  });

  it('every work stream has a build field; native streams are build: null', () => {
    const { releases } = seed();
    for (const r of releases) for (const ws of r.workStreams) expect('build' in ws).toBe(true);
    const demo = releases.find((r) => r.id === 'rel_demo')!;
    expect(demo.workStreams.every((w) => w.build === null)).toBe(true);
  });

  it('all items with a non-null build belong to an expected build label', () => {
    const { items } = seed();
    const knownBuilds = new Set(['Orion 1.5', 'Nexus Beta 2']);
    const unknown = items.filter((i) => i.build !== null && !knownBuilds.has(i.build));
    expect(unknown).toHaveLength(0);
  });

  it('seeds exactly one HTML-description item on the demo release', () => {
    const { items } = seed();
    const htmlItems = items.filter((i) => i.releaseId === 'rel_demo' && i.descriptionFormat === 'html');
    expect(htmlItems).toHaveLength(1);
  });

  it('HTML-description item has a non-empty description, a non-null externalId, and valid sprint placement', () => {
    const { releases, items } = seed();
    const htmlItem = items.find((i) => i.descriptionFormat === 'html')!;
    expect(htmlItem).toBeDefined();
    expect(htmlItem.description).toBeTruthy();
    expect(htmlItem.externalId).not.toBeNull();
    const release = releases.find((r) => r.id === htmlItem.releaseId)!;
    if (htmlItem.sprintId !== null) {
      expect(release.sprints.find((s) => s.id === htmlItem.sprintId)).toBeDefined();
    }
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
