// The item tables' columns, with the user's hiding and ordering applied — one
// hook so the three table presenters can't drift on how preferences are read.

import { applyColumnPrefs, itemColumns, type ItemCellCtx, type ItemColumn } from '../components/fields/columns';
import { ColumnPrefsStore, useColumnPrefs } from '../store/columnPrefs';
import { moveColumn, setColumnVisible } from '../components/fields/columns';
import type { ReleaseCatalog } from '../types';

export interface ItemColumnsResult {
  /** What the table renders: applicable, visible, in the user's order. */
  columns: ItemColumn[];
  /** Every applicable column including hidden ones — what the picker lists. */
  all: ItemColumn[];
  /** Whether a column is currently shown (the picker's checked state). */
  isVisible: (column: ItemColumn) => boolean;
  onToggleColumn: (column: ItemColumn) => void;
  onMoveColumn: (fromKey: string, toKey: string) => void;
  /** True when anything has been hidden or reordered — enables "Reset". */
  isCustomized: boolean;
  onResetColumns: () => void;
  /** Show or hide every connector-declared column at once — the one action that
   *  matters on a release whose catalog runs to dozens of fields. */
  onSetConnectorColumns: (visible: boolean) => void;
}

export function useItemColumns(catalog: ReleaseCatalog | null | undefined, ctx: ItemCellCtx): ItemColumnsResult {
  const prefs = useColumnPrefs();
  const all = itemColumns(catalog, ctx);
  const columns = applyColumnPrefs(all, prefs);
  const visible = new Set(columns.map((c) => c.key));

  return {
    columns,
    all,
    isVisible: (column) => visible.has(column.key),
    onToggleColumn: (column) => ColumnPrefsStore.set(setColumnVisible(prefs, column, !visible.has(column.key))),
    onMoveColumn: (fromKey, toKey) => ColumnPrefsStore.set(moveColumn(prefs, all, fromKey, toKey)),
    isCustomized: prefs.order.length > 0 || Object.keys(prefs.visibility).length > 0,
    onResetColumns: () => ColumnPrefsStore.set({ visibility: {}, order: [] }),
    onSetConnectorColumns: (show) =>
      ColumnPrefsStore.set(
        all.filter((c) => c.key.startsWith('attr:')).reduce((p, c) => setColumnVisible(p, c, show), prefs),
      ),
  };
}
