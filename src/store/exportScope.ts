// Which work streams leave the app when you Copy summary link or Export TSV.
//
// This used to be an implicit side effect of the release view's stream facets —
// and those only apply on the stream axis, so flipping the By sprint / By stream
// toggle silently changed what the same button exported. Scope is now an explicit
// choice made in the Share menu, decoupled from what the view happens to show.
//
// Stored per release (like FacetPrefs) rather than on the Release entity: this is
// a local viewing preference, so it needs no schema bump and must never round-trip
// to a connector.

/**
 * - `current-build` — streams native to this release (`build === null`), the
 *   default. Matches the "Current Build" option the build facet already offers.
 * - `all-builds` — every stream, including ones carried in from a prior build.
 * - `filters` — whatever the active stream facets currently select. Only
 *   offered while facets are actually active.
 */
export type ExportScope = 'current-build' | 'all-builds' | 'filters';

export const DEFAULT_EXPORT_SCOPE: ExportScope = 'current-build';

const KEY = 'release-tracker:exportScope';

type PrefsShape = Record<string, ExportScope>; // releaseId -> scope

function load(): PrefsShape {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PrefsShape) : {};
  } catch {
    return {};
  }
}

function save(s: PrefsShape) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

const VALID: readonly ExportScope[] = ['current-build', 'all-builds', 'filters'];

export const ExportScopePrefs = {
  /**
   * The stored scope for a release, or the default. `filters` degrades to the
   * default when no facet is active, so a stored choice can't leave the export
   * pointing at a selection that no longer exists.
   */
  get(releaseId: string, facetsActive: boolean): ExportScope {
    const stored = load()[releaseId];
    if (!stored || !VALID.includes(stored)) return DEFAULT_EXPORT_SCOPE;
    if (stored === 'filters' && !facetsActive) return DEFAULT_EXPORT_SCOPE;
    return stored;
  },
  set(releaseId: string, scope: ExportScope) {
    const s = load();
    if (scope === DEFAULT_EXPORT_SCOPE) delete s[releaseId];
    else s[releaseId] = scope;
    save(s);
  },
};
