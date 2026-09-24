import { describe, expect, it } from 'vitest';
import { seed } from './seed';
import { SCHEMA_VERSION } from '../types';
import { CANONICAL_BY_FIELD } from './connectorFields';

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
    expect(patches).toHaveLength(3);
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
    const knownBuilds = new Set(['Orion 1.5', 'Nexus Beta 2', 'Edge 0.9']);
    const unknown = items.filter((i) => i.build !== null && !knownBuilds.has(i.build));
    expect(unknown).toHaveLength(0);
  });

  it('marks every demo (local) work item as HTML so the rich-text editor surfaces on any item', () => {
    const { items } = seed();
    const demoItems = items.filter((i) => i.releaseId === 'rel_demo');
    expect(demoItems.length).toBeGreaterThan(0);
    expect(demoItems.every((i) => i.descriptionFormat === 'html')).toBe(true);
  });

  it('the rich HTML showcase item is a local (editable) item with real formatting and valid sprint placement', () => {
    const { releases, items } = seed();
    const showcase = items.find((i) => i.subject === 'SSO login via identity provider')!;
    expect(showcase).toBeDefined();
    expect(showcase.descriptionFormat).toBe('html');
    expect(showcase.description).toContain('<h3>');
    // Local item → not synced → the modal renders the editor editable (toolbar shows).
    expect(showcase.externalId).toBeNull();
    const release = releases.find((r) => r.id === showcase.releaseId)!;
    expect(release.connector).toBeNull();
    if (showcase.sprintId !== null) {
      expect(release.sprints.find((s) => s.id === showcase.sprintId)).toBeDefined();
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

  // The baseline is keyed by dirty-field name, and revert / push-preview look it up
  // by that name. A key the registry doesn't know reads as "no baseline": revert
  // silently restores nothing, and the push review shows an empty old value. Seeded
  // state is stamped at the current SCHEMA_VERSION, so no migration ever gets a
  // chance to correct one — the seed has to be right when it's written.
  it('keys every synced baseline by a canonical dirty-field name', () => {
    const { items } = seed();
    const synced = items.filter((i) => i.externalId != null);
    expect(synced.length).toBeGreaterThan(0);

    for (const item of synced) {
      expect(item.syncedValues).not.toBeNull();
      for (const key of Object.keys(item.syncedValues!)) {
        expect(CANONICAL_BY_FIELD.has(key)).toBe(true);
      }
    }
  });

  it('gives synced items a sprint baseline that matches their seeded sprint', () => {
    const { items } = seed();
    const synced = items.filter((i) => i.externalId != null);
    for (const item of synced) {
      expect(item.syncedValues!.sprint).toBe(item.sprintId);
    }
  });

  it('leaves local items without a baseline', () => {
    const { items } = seed();
    for (const item of items.filter((i) => i.externalId == null)) {
      expect(item.syncedValues).toBeNull();
    }
  });
});
