// The "copy summary link" action for a release. Unlike the connector share link
// (useShareReleaseLink), this works for EVERY release — the snapshot is a
// self-contained, frozen analysis with no connector dependency.

import type { Release } from '../types';
import { buildSnapshotUrl, MAX_SNAPSHOT_URL_LENGTH } from '../lib/releaseSnapshot';
import { connectorLabel } from '../sync/client';
import { selTeam, useStore } from '../store/store';
import { useApp } from '../app-context';

/**
 * Runtime config the host may inject into the served page, so a single prebuilt,
 * connector-agnostic `dist/` can be pointed at any viewer host without a rebuild.
 * work-truck sets this from a serve-time flag (e.g. `--summary-base=…`), typically via
 * an inline script in the served `index.html`:
 *
 *   <script>window.__RELEASE_TRACKER__ = { summaryBase: "https://org.github.io/repo" }</script>
 *
 * How the global gets set (inline script, a `config.js` loaded before the bundle, a
 * templated placeholder) is the host's choice — the app only reads it.
 */
interface RuntimeConfig {
  summaryBase?: string;
}

function runtimeConfig(): RuntimeConfig | undefined {
  return (globalThis as typeof globalThis & { __RELEASE_TRACKER__?: RuntimeConfig }).__RELEASE_TRACKER__;
}

/**
 * Base URL the standalone summary viewer is published at, resolved in priority order:
 *   1. runtime config injected by the host at serve time (window.__RELEASE_TRACKER__.summaryBase),
 *   2. the build-time VITE_SUMMARY_BASE (baked deploys),
 *   3. the current origin (dev / same-origin).
 * Runtime wins so the value is a deployment concern, not a build constant.
 */
function summaryBase(): string {
  const runtime = runtimeConfig()?.summaryBase?.trim();
  const built = (import.meta.env.VITE_SUMMARY_BASE as string | undefined)?.trim();
  return runtime || built || window.location.origin;
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

/**
 * Returns a copy-summary-link action for a release. Always available.
 *
 * `visibleStreamIds` mirrors the release view's active stream facets (build +
 * connector-declared) so the summary respects the same filter the Export TSV action
 * does — pass it when facets are active, omit for the full release.
 */
export function useSummaryLink(release: Release, visibleStreamIds?: ReadonlySet<string> | null): () => void {
  const { notify } = useApp();
  const st = useStore();
  const team = selTeam(st, release.teamId);

  return async () => {
    const items = st.items.filter((i) => i.releaseId === release.id);
    const label = release.connector ? connectorLabel(release.connector.type) : null;
    const result = buildSnapshotUrl(release, team, items, summaryBase(), { connectorLabel: label, visibleStreamIds });
    if (!result.ok) {
      notify(`Summary link too large (${result.length} chars, max ${MAX_SNAPSHOT_URL_LENGTH}) — too many sprints or streams to summarize by link`);
      return;
    }
    await copyToClipboard(result.url);
    notify('Summary link copied — a frozen, read-only view with no work-item detail');
  };
}
