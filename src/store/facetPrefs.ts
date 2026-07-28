// Persisted facet selections. Most facets are ephemeral (reset per view); a view
// opts specific facet keys into persistence via useFacetSelections' persistKeys.
// Selections are keyed by the view's resetKey (the release id, for the release
// plan) so each release remembers its own choice — e.g. the build filter.
//
// Stored under its own key (release-tracker:buildFacet), deliberately NOT the
// legacy release-tracker:buildFilter key, which storage.ts clears on every load.

import { createKeyedPrefs } from './persisted';

/** facetKey -> selected values, for one resetKey. */
type Selections = Record<string, string[]>;

const prefs = createKeyedPrefs<Selections>('release-tracker:buildFacet');

export const FacetPrefs = {
  /** All persisted facet selections for a resetKey: facetKey -> values. */
  get(resetKey: string): Selections {
    return prefs.get(resetKey) ?? {};
  },
  /** Write (or, for an empty selection, remove) one facet's values for a resetKey. */
  set(resetKey: string, facetKey: string, values: string[]) {
    const forKey = { ...(prefs.get(resetKey) ?? {}) };
    if (values.length === 0) delete forKey[facetKey];
    else forKey[facetKey] = values;
    // Drop the whole entry once its last facet clears, so the stored object doesn't
    // accumulate an empty record per release the user ever opened.
    prefs.set(resetKey, Object.keys(forKey).length === 0 ? undefined : forKey);
  },
};
