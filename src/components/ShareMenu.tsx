import type { Release, WorkStream } from '../types';
import type { ExportScope } from '../store/exportScope';
import { scopeOptionLabel, scopeStreamCount } from '../lib/exportScope';
import { Icon } from './Icon';
import { Menu, type MenuAction } from './Menu';
import { useShareReleaseLink } from './ShareButton';
import { useSummaryLink } from './SummaryLinkButton';

/** The scopes offered, in menu order. */
const SCOPES: ExportScope[] = ['current-build', 'all-builds', 'filters'];

/**
 * The "get data out" group in the release-view header: the connector share link,
 * the executive summary link and the TSV export, behind one `Share` trigger.
 *
 * The menu also owns the **data scope** — which work streams leave the app. That
 * used to be an invisible side effect of the view's stream facets, which only
 * apply on the stream axis, so the same button silently exported different data
 * depending on the By sprint / By stream toggle. It's now an explicit choice,
 * shown with live stream counts so the consequence is visible before the click.
 *
 * `Copy share link` sits ABOVE the scope section: it carries release configuration
 * and metadata, never work items, so it isn't governed by the choice and mustn't
 * look as though it is.
 */
export function ShareMenu({
  release,
  onExport,
  workStreams,
  facetVisibleStreamIds,
  facetsActive,
  scope,
  onSetScope,
  exportStreamIds,
}: {
  release: Release;
  onExport: () => void;
  workStreams: readonly WorkStream[];
  /** Streams the active facets select — backs the "match current filters" option. */
  facetVisibleStreamIds?: ReadonlySet<string> | undefined;
  /** Whether any stream facet is currently active; hides the filters option when not. */
  facetsActive: boolean;
  scope: ExportScope;
  onSetScope: (scope: ExportScope) => void;
  /** Streams the current scope selects — what the summary link should carry. */
  exportStreamIds?: ReadonlySet<string> | undefined;
}) {
  const onShare = useShareReleaseLink(release);
  const onSummary = useSummaryLink(release, exportStreamIds);

  const scopeActions: MenuAction[] = SCOPES.map((s) => ({
    key: `scope-${s}`,
    section: 'Data scope',
    label: `${scopeOptionLabel(s)} · ${scopeStreamCount(s, workStreams, facetVisibleStreamIds)}`,
    checked: scope === s,
    // The filters option is meaningless with nothing selected, so it only appears
    // while facets are actually narrowing the view.
    visible: s !== 'filters' || facetsActive,
    onSelect: () => onSetScope(s),
    title:
      s === 'current-build'
        ? 'Work streams native to this release (the build facet’s “Current Build”)'
        : s === 'all-builds'
          ? 'Every work stream, including any carried in from a prior build'
          : 'Whatever the active stream filters currently select',
  }));

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
          title: 'Copy a link to this release’s configuration and metadata — no work items, so the scope below doesn’t apply',
        },
        ...scopeActions,
        {
          key: 'summary',
          section: 'Copy out',
          label: 'Copy summary link',
          icon: Icon.present,
          onSelect: onSummary,
          title: 'Copy a self-contained executive summary link — frozen analysis, no work-item detail',
        },
        {
          key: 'export',
          section: 'Copy out',
          label: 'Export TSV',
          icon: Icon.copy,
          onSelect: onExport,
          title: 'Copy this release’s work items as tab-separated values',
        },
      ]}
    />
  );
}
