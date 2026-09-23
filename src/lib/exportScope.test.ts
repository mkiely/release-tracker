import { describe, expect, it } from 'vitest';
import { scopeLabel, scopeOptionLabel, scopeStreamCount, scopeStreamIds } from './exportScope';
import type { WorkStream } from '../types';

/** Minimal streams: `build === null` is native to this release, anything else is
 *  carried in from a prior build (the build facet prefix-groups those). */
const streams = [
  { id: 'a', name: 'API Gateway', build: null },
  { id: 'b', name: 'Auth', build: null },
  { id: 'c', name: 'Beta 2 Carryover', build: '264.1' },
] as unknown as WorkStream[];

describe('scopeStreamIds', () => {
  it('current-build selects only streams native to the release', () => {
    const ids = scopeStreamIds('current-build', streams, undefined);
    expect(ids && [...ids].sort()).toEqual(['a', 'b']);
  });

  it('all-builds returns undefined — the "no filtering" signal both consumers take', () => {
    expect(scopeStreamIds('all-builds', streams, undefined)).toBeUndefined();
  });

  it('filters passes the active facet selection straight through', () => {
    const facets = new Set(['c']);
    expect(scopeStreamIds('filters', streams, facets)).toBe(facets);
  });

  it('filters degrades to every stream when no facet is active, never to an empty export', () => {
    expect(scopeStreamIds('filters', streams, undefined)).toBeUndefined();
  });

  it('treats an undefined build the same as null (streams that never carried one)', () => {
    const undef = [{ id: 'x', name: 'X' }] as unknown as WorkStream[];
    const ids = scopeStreamIds('current-build', undef, undefined);
    expect(ids && [...ids]).toEqual(['x']);
  });
});

describe('scopeStreamIds — muted streams', () => {
  // `b` is muted: the team keeps it for reporting but doesn't deliver it.
  const withMuted = [
    { id: 'a', name: 'API Gateway', build: null },
    { id: 'b', name: 'Exec Roll-up', build: null, muted: true },
    { id: 'c', name: 'Beta 2 Carryover', build: '264.1' },
  ] as unknown as WorkStream[];

  it('drops a muted stream from every scope, including all-builds', () => {
    expect([...scopeStreamIds('all-builds', withMuted, undefined)!].sort()).toEqual(['a', 'c']);
    expect([...scopeStreamIds('current-build', withMuted, undefined)!]).toEqual(['a']);
  });

  it('drops a muted stream even when a facet explicitly selected it', () => {
    // Muting is a property of the stream, not a scope the facets can override:
    // asking to export exactly the muted stream must still export nothing.
    expect([...scopeStreamIds('filters', withMuted, new Set(['b']))!]).toEqual([]);
    expect([...scopeStreamIds('filters', withMuted, new Set(['a', 'b']))!]).toEqual(['a']);
  });

  it('keeps the cheap undefined signal when nothing is muted', () => {
    expect(scopeStreamIds('all-builds', streams, undefined)).toBeUndefined();
  });
});

describe('scopeStreamCount', () => {
  it('counts the selected streams, falling back to all for the undefined signal', () => {
    expect(scopeStreamCount('current-build', streams, undefined)).toBe(2);
    expect(scopeStreamCount('all-builds', streams, undefined)).toBe(3);
    expect(scopeStreamCount('filters', streams, new Set(['c']))).toBe(1);
  });

  it('counts only the unmuted streams, so the menu states the real export size', () => {
    const withMuted = [
      { id: 'a', name: 'API Gateway', build: null },
      { id: 'b', name: 'Exec Roll-up', build: null, muted: true },
    ] as unknown as WorkStream[];
    expect(scopeStreamCount('all-builds', withMuted, undefined)).toBe(1);
  });
});

describe('labels', () => {
  it('states the scope and count for the confirmation toast', () => {
    expect(scopeLabel('current-build', 2)).toBe('current build only (2 streams)');
    expect(scopeLabel('all-builds', 3)).toBe('all builds (3 streams)');
    expect(scopeLabel('filters', 1)).toBe('current filters (1 stream)');
  });

  it('names each option without its count for the menu', () => {
    expect(scopeOptionLabel('current-build')).toBe('Current build only');
    expect(scopeOptionLabel('all-builds')).toBe('All builds');
    expect(scopeOptionLabel('filters')).toBe('Match current filters');
  });
});

describe('regression: export scope is independent of the view axis', () => {
  it('resolves identically whether or not the axis has deactivated the facets', () => {
    // The original bug: facets only applied on the stream axis, so flipping to
    // "By sprint" made facetVisibleIds undefined and silently exported the whole
    // release. A non-filters scope must ignore that entirely.
    const onStreamAxis = new Set(['a']);
    for (const scope of ['current-build', 'all-builds'] as const) {
      expect(scopeStreamIds(scope, streams, onStreamAxis)).toEqual(scopeStreamIds(scope, streams, undefined));
    }
  });
});
