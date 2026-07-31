import { Fragment, type ReactNode } from 'react';
import { isAnyFacetActive, type FacetGroup } from '../../lib/facets';
import { avatarPalette, memberInitials } from '../../components/Avatar';
import { FilterChip, ClearFiltersButton } from '../../components/FilterChip';
import styles from './table.module.css';

/**
 * The table's labeled-group presentation of the generic facet groups — every
 * facet, built-in and connector-declared, renders here with no per-field wiring.
 * Member facets keep the leading-avatar chip style.
 *
 * Shared by all three table presenters (sprint, work stream, item list). It used
 * to be exported from SprintTable.tsx and imported by the other two, which made a
 * screen module the de-facto home of shared table furniture.
 */
export function TableFacetBar<T>({
  groups,
  onToggle,
  onClear,
  trailing,
}: {
  groups: FacetGroup<T>[];
  onToggle: (facetKey: string, value: string) => void;
  onClear: () => void;
  /** Extra bar content after the facets (e.g. the item list's group-by toggle). */
  trailing?: ReactNode;
}) {
  const visible = groups.filter((g) => g.visible);
  if (visible.length === 0 && !trailing) return null;
  const isFiltered = isAnyFacetActive(groups);
  return (
    <div className={styles.filterBarRow}>
      <div className={styles.filterBar}>
        {visible.map((g, gi) => (
        <Fragment key={g.def.key}>
          {gi > 0 && <div className={styles.filterDivider} />}
          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>{g.def.label}</span>
            <div className={styles.filterChips}>
              {g.options.map((o) => {
                const active = g.selection.has(o.value);
                const title = active ? `Remove filter: ${o.label}` : `Filter: ${o.label}`;
                if (g.def.chip?.render === 'avatar') {
                  const pal = avatarPalette(o.value);
                  return (
                    <FilterChip
                      key={o.value}
                      active={active}
                      label={o.label.split(' ')[0]}
                      title={title}
                      onClick={() => onToggle(g.def.key, o.value)}
                      leading={
                        <span
                          className={styles.facetAvatar}
                          style={{
                            background: active ? pal.bg : 'var(--rt-fill)',
                            color: active ? pal.color : 'var(--rt-t3)',
                          }}
                        >
                          {memberInitials(o.label)}
                        </span>
                      }
                    />
                  );
                }
                return (
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
            </div>
          </div>
        </Fragment>
      ))}
        {isFiltered && (
          <div className={styles.filterClear}>
            <ClearFiltersButton onClick={onClear} />
          </div>
        )}
      </div>
      {trailing && (
        // Outside the scroller, not merely pinned inside it: the facets scroll
        // when they outrun the window, and a control living in that overflow is
        // both parked off-screen and unclickable — focusing it makes the browser
        // scroll the bar, moving the button out from under the pointer mid-click.
        <div className={styles.filterTrailing}>
          {visible.length > 0 && <div className={styles.filterDivider} />}
          {trailing}
        </div>
      )}
    </div>
  );
}
