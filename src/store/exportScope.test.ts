// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_EXPORT_SCOPE, ExportScopePrefs } from './exportScope';

describe('ExportScopePrefs', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to current-build for a release with no stored choice', () => {
    expect(ExportScopePrefs.get('rel_1', false)).toBe('current-build');
    expect(DEFAULT_EXPORT_SCOPE).toBe('current-build');
  });

  it('round-trips a non-default choice per release', () => {
    ExportScopePrefs.set('rel_1', 'all-builds');
    expect(ExportScopePrefs.get('rel_1', false)).toBe('all-builds');
    // Other releases keep their own choice.
    expect(ExportScopePrefs.get('rel_2', false)).toBe('current-build');
  });

  it('drops the entry when set back to the default rather than storing it', () => {
    ExportScopePrefs.set('rel_1', 'all-builds');
    ExportScopePrefs.set('rel_1', 'current-build');
    expect(localStorage.getItem('release-tracker:exportScope')).toBe('{}');
    expect(ExportScopePrefs.get('rel_1', false)).toBe('current-build');
  });

  it('degrades a stored "filters" choice to the default when no facet is active', () => {
    ExportScopePrefs.set('rel_1', 'filters');
    expect(ExportScopePrefs.get('rel_1', true)).toBe('filters');
    expect(ExportScopePrefs.get('rel_1', false)).toBe('current-build');
  });

  it('ignores a corrupt or unknown stored value', () => {
    localStorage.setItem('release-tracker:exportScope', JSON.stringify({ rel_1: 'nonsense' }));
    expect(ExportScopePrefs.get('rel_1', false)).toBe('current-build');
    localStorage.setItem('release-tracker:exportScope', 'not json');
    expect(ExportScopePrefs.get('rel_1', false)).toBe('current-build');
  });
});
