import { useEffect, useRef } from 'react';

/**
 * Returns a ref to attach to the active row; on first mount it scrolls that row
 * to the vertical center of its scroll container. Used by the release plan views
 * so the current sprint is in view on load.
 */
export function useScrollActiveIntoView<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ block: 'center' });
  }, []);
  return ref;
}
