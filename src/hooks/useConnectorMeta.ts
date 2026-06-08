import { useEffect, useState } from 'react';
import type { ConnectorMeta } from '../sync/client';
import { getConnectors } from '../sync/client';

// Process-wide cache of connector metadata keyed by type, populated on first load.
const cache = new Map<string, ConnectorMeta>();

/**
 * Returns the {@link ConnectorMeta} for a connector type, or undefined while it
 * loads / for local releases. Backed by a shared memoized fetch + a static cache,
 * so after the first load it resolves synchronously — usable for render-time
 * capability gating (e.g. whether to show "New work item" on a connector release).
 */
export function useConnectorMeta(type: string | undefined): ConnectorMeta | undefined {
  const [meta, setMeta] = useState<ConnectorMeta | undefined>(() => (type ? cache.get(type) : undefined));

  useEffect(() => {
    if (!type) {
      setMeta(undefined);
      return;
    }
    const cached = cache.get(type);
    if (cached) {
      setMeta(cached);
      return;
    }
    let alive = true;
    getConnectors()
      .then((list) => {
        for (const c of list) cache.set(c.type, c);
        if (alive) setMeta(cache.get(type));
      })
      .catch(() => {
        if (alive) setMeta(undefined);
      });
    return () => {
      alive = false;
    };
  }, [type]);

  return meta;
}
