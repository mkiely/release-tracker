// Renders bound facet groups (lib/facets.ts) as the app's standard chip rows:
// one run of chips per visible group, VDividers between groups, and a trailing
// Clear button when any facet is active. Views embed this inside their own bar
// container (it renders a fragment, not a wrapper), so bespoke bars can keep
// their layout and still get every facet — built-in and connector-declared —
// with no per-field wiring.

import { Fragment } from 'react';
import type { FacetGroup } from '../lib/facets';
import { isAnyFacetActive } from '../lib/facets';
import { ClearFiltersButton, FilterChip } from './FilterChip';
import { memberInitials } from './Avatar';
import { VDivider } from './VDivider';
import { FacetMenu } from './FacetMenu';
import { SearchBox } from './SearchBox';
import type { ItemSearch } from '../hooks/useItemSearch';

/** One avatar-styled toggle (member facets) — matches the sprint bar's look. */
function AvatarChip({ active, label, title, onClick }: { active: boolean; label: string; title: string; onClick: () => void }) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        width: 26,
        height: 26,
        borderRadius: '50%',
        border: active ? `2px solid ${'var(--rt-ink)'}` : `1.5px solid ${'var(--rt-line)'}`,
        background: active ? 'var(--rt-fill)' : 'transparent',
        cursor: 'pointer',
        fontSize: 'var(--rt-fs-micro)',
        fontWeight: 'var(--rt-fw-bold)',
        color: active ? 'var(--rt-ink)' : 'var(--rt-t3)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        fontFamily: 'var(--rt-sans)',
      }}
    >
      {memberInitials(label)}
    </button>
  );
}

export function FacetBar<T>({
  groups,
  onToggle,
  onClear,
  leadingDivider = false,
  search,
}: {
  groups: FacetGroup<T>[];
  onToggle: (facetKey: string, value: string) => void;
  onClear: () => void;
  /** Render a VDivider before the first group (when the bar has leading content). */
  leadingDivider?: boolean;
  /** The list's quick search; rendered first, ahead of the facets. */
  search?: ItemSearch;
}) {
  const visible = groups.filter((g) => g.visible);
  if (visible.length === 0 && !search) return null;
  const isFiltered = isAnyFacetActive(groups) || (search?.query ?? '') !== '';
  // Collapsed facets lead as compact menus; the chip rows keep their order after.
  const menus = visible.filter((g) => g.def.collapse);
  const chips = visible.filter((g) => !g.def.collapse);
  return (
    <>
      {search && (
        <>
          {leadingDivider && <VDivider />}
          <SearchBox value={search.query} onChange={search.setQuery} />
        </>
      )}
      {menus.map((g) => (
        <FacetMenu key={g.def.key} group={g} onToggle={onToggle} />
      ))}
      {chips.map((g, gi) => (
        <Fragment key={g.def.key}>
          {(gi > 0 || leadingDivider || search || menus.length > 0) && <VDivider />}
          {g.options.map((o) => {
            const active = g.selection.has(o.value);
            const title = active ? `Remove filter: ${o.label}` : `Filter: ${o.label}`;
            return g.def.chip?.render === 'avatar' ? (
              <AvatarChip key={o.value} active={active} label={o.label} title={title} onClick={() => onToggle(g.def.key, o.value)} />
            ) : (
              <FilterChip
                key={o.value}
                active={active}
                vars={g.def.chip?.vars?.(o.value)}
                dotShape={g.def.chip?.dotShape}
                label={o.label}
                title={title}
                onClick={() => onToggle(g.def.key, o.value)}
              />
            );
          })}
        </Fragment>
      ))}
      {isFiltered && (
        <>
          <VDivider />
          <ClearFiltersButton onClick={onClear} title="Clear all filters" />
        </>
      )}
    </>
  );
}
