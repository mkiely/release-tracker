import type { FacetGroup } from '../lib/facets';
import { Menu } from './Menu';

/**
 * A facet as an expandable multi-select rather than a chip row — for facets whose
 * options would otherwise crowd the bar (`FacetDef.collapse`). Same selection
 * semantics as the chips; the trigger carries the count so an active filter is
 * still visible with the menu closed.
 */
export function FacetMenu<T>({
  group,
  onToggle,
}: {
  group: FacetGroup<T>;
  onToggle: (facetKey: string, value: string) => void;
}) {
  const { def, options, selection } = group;
  return (
    <Menu
      sm
      align="left"
      label={selection.size > 0 ? `${def.label} · ${selection.size}` : def.label}
      title={`Filter by ${def.label.toLowerCase()}`}
      // A section keeps a one-option facet in the popover, where its label gives
      // the lone checkbox its context, instead of collapsing to a bare button.
      actions={options.map((o) => ({
        key: o.value || '__none',
        label: o.label,
        checked: selection.has(o.value),
        keepOpen: true,
        section: def.label,
        title: selection.has(o.value) ? `Remove filter: ${o.label}` : `Filter: ${o.label}`,
        onSelect: () => onToggle(def.key, o.value),
      }))}
    />
  );
}
