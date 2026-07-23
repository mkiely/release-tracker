// The "copy summary link" action for a release. Unlike the connector share link
// (useShareReleaseLink), this works for EVERY release — the snapshot is a
// self-contained, frozen analysis with no connector dependency.

import type { Release } from '../types';
import { buildSnapshotUrl, MAX_SNAPSHOT_URL_LENGTH } from '../lib/releaseSnapshot';
import { connectorLabel } from '../sync/client';
import { selTeam, useStore } from '../store/store';
import { useApp } from '../app-context';

/** Base URL the standalone summary viewer is published at. Defaults to the current
 *  origin (works in dev and same-origin deploys); override with VITE_SUMMARY_BASE
 *  to point links at a separately-hosted viewer (e.g. a GitHub Page). */
function summaryBase(): string {
  const configured = import.meta.env.VITE_SUMMARY_BASE as string | undefined;
  return (configured && configured.trim()) || window.location.origin;
}

/** Copy `text` to the clipboard, falling back to a hidden textarea + execCommand
 *  when the async Clipboard API is unavailable (mirrors the share/export paths). */
async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
    } finally {
      document.body.removeChild(ta);
    }
  }
}

/** Returns a copy-summary-link action for a release. Always available. */
export function useSummaryLink(release: Release): () => void {
  const { notify } = useApp();
  const st = useStore();
  const team = selTeam(st, release.teamId);

  return async () => {
    const items = st.items.filter((i) => i.releaseId === release.id);
    const label = release.connector ? connectorLabel(release.connector.type) : null;
    const result = buildSnapshotUrl(release, team, items, summaryBase(), { connectorLabel: label });
    if (!result.ok) {
      notify(`Summary link too large (${result.length} chars, max ${MAX_SNAPSHOT_URL_LENGTH}) — too many sprints or streams to summarize by link`);
      return;
    }
    await copyToClipboard(result.url);
    notify('Summary link copied — a frozen, read-only view with no work-item detail');
  };
}
