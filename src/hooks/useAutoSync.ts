import { useEffect, useRef } from 'react';
import type { Release } from '../types';
import { getActions } from '../store/store';

/**
 * While a connector release with a configured cadence is on screen, run a background
 * sync every `autoSyncMinutes` minutes. Silent on success — the Sync button's label
 * reflects the outcome and errors surface through the release's sync status; no toast
 * fires per tick, so a quiet background pull doesn't nag. Off when the cadence is
 * null/absent (the default) or the release has no connector.
 *
 * Guards: a still-running sync is never overlapped, and ticks are skipped while the
 * tab is hidden (a backgrounded tab shouldn't hammer the connector). The interval is
 * torn down and rebuilt when the release or its cadence changes.
 */
export function useAutoSync(release: Release): void {
  const minutes = release.connector ? release.autoSyncMinutes ?? null : null;
  const releaseId = release.id;
  const running = useRef(false);

  useEffect(() => {
    if (!minutes || minutes <= 0) return;
    const tick = async () => {
      if (running.current) return; // don't stack on a still-running sync
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      running.current = true;
      try {
        await getActions().syncRelease(releaseId);
      } finally {
        running.current = false;
      }
    };
    const id = setInterval(tick, minutes * 60_000);
    return () => clearInterval(id);
  }, [releaseId, minutes]);
}
