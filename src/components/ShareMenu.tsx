import type { Release } from '../types';
import { Icon } from './Icon';
import { Menu } from './Menu';
import { useShareReleaseLink } from './ShareButton';

/**
 * The "get data out" group in the release-view header: the connector share link
 * and the TSV export, collapsed behind one `Share` trigger. On a local release
 * (no share link) the group falls back to a plain `Export TSV` button — the
 * collapse-to-flat behaviour lives in {@link Menu}.
 */
export function ShareMenu({ release, onExport }: { release: Release; onExport: () => void }) {
  const onShare = useShareReleaseLink(release);
  return (
    <Menu
      label="Share"
      icon={Icon.link}
      sm
      actions={[
        {
          key: 'link',
          label: 'Copy share link',
          icon: Icon.link,
          onSelect: onShare ?? (() => {}),
          visible: !!onShare,
          title: 'Copy a link to this release’s configuration and metadata',
        },
        {
          key: 'export',
          label: 'Export TSV',
          icon: Icon.copy,
          onSelect: onExport,
          title: 'Copy every work item in this release as tab-separated values',
        },
      ]}
    />
  );
}
