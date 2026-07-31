import { Icon } from '../../components/Icon';
import { Menu, type MenuAction } from '../../components/Menu';
import type { ItemColumnsResult } from '../../hooks/useItemColumns';

/**
 * The item tables' column picker. Lists every column the table *could* show —
 * including a connector's `detailOnly` fields, which are offered here rather than
 * suppressed outright — and toggles each one. The choice is global across the
 * item tables and persisted, like column widths.
 *
 * Connector fields are grouped and get bulk show/hide, because a rich catalog can
 * contribute more columns than the app itself and picking through them one by one
 * is the whole problem. Reordering isn't here: columns are dragged by their
 * headers, where the target position is visible.
 */
export function ColumnMenu({
  all,
  isVisible,
  onToggleColumn,
  isCustomized,
  onResetColumns,
  onSetConnectorColumns,
}: ItemColumnsResult) {
  const isConnector = (key: string) => key.startsWith('attr:');
  const connectorCols = all.filter((c) => isConnector(c.key));
  const anyConnectorShown = connectorCols.some(isVisible);

  const toggle = (c: (typeof all)[number]): MenuAction => ({
    key: c.key,
    label: c.label,
    checked: isVisible(c),
    keepOpen: true,
    disabled: c.lockVisible,
    section: isConnector(c.key) ? 'Connector fields' : undefined,
    title: c.lockVisible ? `${c.label} always shows` : isVisible(c) ? `Hide ${c.label}` : `Show ${c.label}`,
    onSelect: () => onToggleColumn(c),
  });

  return (
    <Menu
      sm
      label="Columns"
      icon={Icon.columns}
      title="Choose which columns to show"
      actions={[
        ...all.filter((c) => !isConnector(c.key)).map(toggle),
        ...connectorCols.map(toggle),
        {
          key: 'bulk-connector',
          section: 'Connector fields',
          label: anyConnectorShown ? 'Hide all connector fields' : 'Show all connector fields',
          keepOpen: true,
          visible: connectorCols.length > 1,
          onSelect: () => onSetConnectorColumns(!anyConnectorShown),
        },
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
