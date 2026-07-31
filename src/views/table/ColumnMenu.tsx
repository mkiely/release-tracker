import { Icon } from '../../components/Icon';
import { Menu, type MenuAction } from '../../components/Menu';
import type { ItemColumnsResult } from '../../hooks/useItemColumns';

/**
 * The item tables' column picker. Lists every column the table *could* show —
 * including a connector's `detailOnly` fields, which are offered here rather than
 * suppressed outright — and toggles each one. The choice is global across the
 * item tables and persisted, like column widths.
 *
 * Reordering isn't here: columns are dragged by their headers, where the target
 * position is visible. This menu owns visibility and the reset.
 */
export function ColumnMenu({ all, isVisible, onToggleColumn, isCustomized, onResetColumns }: ItemColumnsResult) {
  const actions: MenuAction[] = all.map((c) => ({
    key: c.key,
    label: c.label,
    checked: isVisible(c),
    keepOpen: true,
    disabled: c.lockVisible,
    title: c.lockVisible
      ? `${c.label} always shows`
      : isVisible(c)
        ? `Hide ${c.label}`
        : `Show ${c.label}`,
    onSelect: () => onToggleColumn(c),
  }));

  return (
    <Menu
      sm
      escapeOverflow
      label="Columns"
      icon={Icon.columns}
      title="Choose which columns to show"
      actions={[
        ...actions,
        {
          key: 'reset',
          section: ' ', // its own group, so it reads as an action not a column
          label: 'Reset columns',
          onSelect: onResetColumns,
          visible: isCustomized,
        },
      ]}
    />
  );
}
