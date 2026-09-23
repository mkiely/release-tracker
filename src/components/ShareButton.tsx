// Top-bar action that copies a self-contained link to this connector release's
// configuration + local metadata (events, days off). Shown on every page within
// a release. Hidden for Local releases, which have no connector to share.

import type { Release } from '../types';
import { buildShareUrl } from '../lib/shareRelease';
import { MAX_URL_LENGTH } from '../lib/urlCodec';
import { copyTextLazy } from '../lib/copyLink';
import { selTeam, useStore } from '../store/store';
import { useApp } from '../app-context';
import { Icon } from './Icon';
import { PButton } from './primitives';

/**
 * The share-link action for a release, or `null` when there's nothing to share
 * (local releases have no connector config to hand off). Extracted so both the
 * standalone {@link ShareButton} and the grouped Share menu drive the same copy
 * flow instead of duplicating it.
 */
export function useShareReleaseLink(release: Release): (() => void) | null {
  const { notify } = useApp();
  const team = useStore((s) => selTeam(s, release.teamId));
  if (!release.connector) return null;

  return async () => {
    // Not awaited before the clipboard is touched — see copyTextLazy. Building the
    // payload deflates it, and that await is long enough to lose the click's user
    // activation, which is what silently broke this copy.
    const built = buildShareUrl(release, window.location.origin, team);
    // A rejection means "nothing to copy": copyTextLazy reports false rather than
    // writing an empty string over whatever the user already had.
    const copied = await copyTextLazy(
      built.then((r) => (r.ok ? r.url : Promise.reject(new Error('no share link to copy')))),
    );
    const result = await built;

    if (!result.ok) {
      notify(
        result.reason === 'too-long'
          ? `Share link too large (${result.length} chars, max ${MAX_URL_LENGTH}) — too many events or sprints to share by link`
          : 'This release isn’t connected, so there’s nothing to share',
      );
      return;
    }
    notify(
      copied
        ? 'Share link copied — the recipient confirms, then syncs to fetch data'
        : 'Couldn’t write to the clipboard — check the browser’s clipboard permission for this site.',
    );
  };
}

export function ShareButton({ release }: { release: Release }) {
  const onShare = useShareReleaseLink(release);
  if (!onShare) return null;

  return (
    <PButton variant="subtle" sm icon={Icon.link} onClick={onShare} title="Copy a link to this release’s configuration and metadata">
      Share
    </PButton>
  );
}
