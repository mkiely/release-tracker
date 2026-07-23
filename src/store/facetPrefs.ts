// Persisted facet selections. Most facets are ephemeral (reset per view); a view
// opts specific facet keys into persistence via useFacetSelections' persistKeys.
// Selections are keyed by the view's resetKey (the release id, for the release
// plan) so each release remembers its own choice — e.g. the build filter.
//
// Stored under its own key (release-tracker:buildFacet), deliberately NOT the
// legacy release-tracker:buildFilter key, which store.ts clears on every load.

type PrefsShape = Record<string, Record<string, string[]>>; // resetKey -> facetKey -> values

const KEY = 'release-tracker:buildFacet';

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

export const FacetPrefs = {
  /** All persisted facet selections for a resetKey: facetKey -> values. */
  get(resetKey: string): Record<string, string[]> {
    return load()[resetKey] ?? {};
  },
  /** Write (or, for an empty selection, remove) one facet's values for a resetKey. */
  set(resetKey: string, facetKey: string, values: string[]) {
    const s = load();
    const forKey = { ...(s[resetKey] ?? {}) };
    if (values.length === 0) delete forKey[facetKey];
    else forKey[facetKey] = values;
    if (Object.keys(forKey).length === 0) delete s[resetKey];
    else s[resetKey] = forKey;
    save(s);
  },
};
