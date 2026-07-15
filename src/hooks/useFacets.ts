import { useEffect, useState } from 'react';
import type { FacetSelections } from '../lib/facets';

/**
 * Ephemeral facet-selection state: one Map of facet key → selected group keys,
 * reset whenever `resetKey` changes (per-view, survives nothing — matching the
 * Set-filter behavior this framework replaced). Pair with the pure half in
 * lib/facets.ts (buildFacetGroups/applyFacets) after any early-return guards,
 * so hook order stays unconditional.
 */
export function useFacetSelections(resetKey: string): {
  selections: FacetSelections;
  toggle: (facetKey: string, value: string) => void;
  clear: () => void;
} {
  const [selections, setSelections] = useState<FacetSelections>(new Map());

  useEffect(() => {
    setSelections(new Map());
  }, [resetKey]);

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
        return next;
      }),
    clear: () => setSelections(new Map()),
  };
}
