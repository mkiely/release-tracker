// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { FacetPrefs } from './facetPrefs';

describe('FacetPrefs', () => {
  beforeEach(() => localStorage.clear());

  it('returns an empty object for an unknown resetKey', () => {
    expect(FacetPrefs.get('rel_x')).toEqual({});
  });

  it('round-trips a facet selection per resetKey', () => {
    FacetPrefs.set('rel_a', 'build', ['Native']);
    expect(FacetPrefs.get('rel_a')).toEqual({ build: ['Native'] });
    // Isolated per resetKey.
    expect(FacetPrefs.get('rel_b')).toEqual({});
  });

  it('removes a facet entry when set to an empty selection', () => {
    FacetPrefs.set('rel_a', 'build', ['Native']);
    FacetPrefs.set('rel_a', 'build', []);
    expect(FacetPrefs.get('rel_a')).toEqual({});
  });

  it('stores under its own key, not the wiped legacy buildFilter key', () => {
    FacetPrefs.set('rel_a', 'build', ['Native']);
    expect(localStorage.getItem('release-tracker:buildFacet')).not.toBeNull();
    expect(localStorage.getItem('release-tracker:buildFilter')).toBeNull();
  });
});
