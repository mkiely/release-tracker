// Top-bar action that copies a self-contained link to this connector release's
// configuration + local metadata (events, days off). Shown on every page within
// a release. Hidden for Local releases, which have no connector to share.

import type { Release } from '../types';
import { buildShareUrl, MAX_SAFE_URL_LENGTH } from '../lib/shareRelease';
import { useApp } from '../app-context';
import { Icon } from './Icon';
import { PButton } from './primitives';

/** Copy `text` to the clipboard, falling back to a hidden textarea + execCommand
 *  when the async Clipboard API is unavailable (mirrors the TSV export path). */
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

export function ShareButton({ release }: { release: Release }) {
  const { notify } = useApp();
  if (!release.connector) return null;

  const onShare = async () => {
    const result = buildShareUrl(release, window.location.origin);
    if (!result.ok) {
      notify(
        result.reason === 'too-long'
          ? `Share link too large (${result.length} chars, max ${MAX_SAFE_URL_LENGTH}) — too many events or sprints to share by link`
          : 'This release isn’t connected, so there’s nothing to share',
      );
      return;
    }
    await copyToClipboard(result.url);
    notify('Share link copied — the recipient confirms, then syncs to fetch data');
  };

  return (
    <PButton variant="subtle" sm icon={Icon.link} onClick={onShare} title="Copy a link to this release’s configuration and metadata">
      Share
    </PButton>
  );
}
