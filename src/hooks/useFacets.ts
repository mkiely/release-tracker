import { useEffect, useState } from 'react';
import { FacetPrefs } from '../store/facetPrefs';
import type { FacetSelections } from '../lib/facets';

/** Build the initial selection Map, seeding any persisted keys from FacetPrefs. */
function seed(resetKey: string, persistKeys: readonly string[]): FacetSelections {
  if (persistKeys.length === 0) return new Map();
  const stored = FacetPrefs.get(resetKey);
  const m = new Map<string, Set<string>>();
  for (const k of persistKeys) {
    const vals = stored[k];
    if (vals && vals.length) m.set(k, new Set(vals));
  }
  return m;
}

/**
 * Facet-selection state: one Map of facet key → selected group keys, reset
 * whenever `resetKey` changes (per-view, matching the Set-filter behavior this
 * framework replaced). Facet keys named in `persistKeys` are the exception: they
 * are seeded from and written through to FacetPrefs, keyed by `resetKey`, so they
 * survive navigation and reload (e.g. the release-plan build filter, persisted
 * per release). Pair with the pure half in lib/facets.ts
 * (buildFacetGroups/applyFacets) after any early-return guards, so hook order
 * stays unconditional.
 */
export function useFacetSelections(
  resetKey: string,
  persistKeys: readonly string[] = [],
): {
  selections: FacetSelections;
  toggle: (facetKey: string, value: string) => void;
  clear: () => void;
} {
  const [selections, setSelections] = useState<FacetSelections>(() => seed(resetKey, persistKeys));

  // Re-seed on resetKey change (or if the set of persisted keys changes).
  const persistSig = persistKeys.join(',');
  useEffect(() => {
    setSelections(seed(resetKey, persistKeys));
    // persistKeys is referenced via its stable signature below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, persistSig]);

  return {
    selections,
    toggle: (facetKey, value) =>
      setSelections((prev) => {
        const next = new Map(prev);
        const cur = new Set(prev.get(facetKey) ?? []);
        if (cur.has(value)) cur.delete(value);
        else cur.add(value);
        if (cur.size === 0) next.delete(facetKey);
        else next.set(facetKey, cur);
        if (persistKeys.includes(facetKey)) FacetPrefs.set(resetKey, facetKey, [...cur]);
        return next;
      }),
    clear: () => {
      setSelections(new Map());
      for (const k of persistKeys) FacetPrefs.set(resetKey, k, []);
    },
  };
}
