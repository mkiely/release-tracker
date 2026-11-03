import { useState } from 'react';

export interface ItemSearch {
  query: string;
  setQuery: (q: string) => void;
}

/**
 * The quick-search text for one item list. Ephemeral like the facet selections:
 * it resets whenever `resetKey` (the view's identity) changes, so a search typed
 * on one sprint doesn't silently filter the next.
 *
 * Reset is derived rather than effect-driven: the query is stored beside the key
 * it was typed under and ignored once the key moves on, so there is no render
 * where the new view shows the old query.
 */
export function useItemSearch(resetKey: string): ItemSearch {
  const [state, setState] = useState({ key: resetKey, query: '' });
  return {
    query: state.key === resetKey ? state.query : '',
    setQuery: (query) => setState({ key: resetKey, query }),
  };
}
