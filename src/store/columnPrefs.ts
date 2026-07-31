// Which item-table columns show, and in what order — a user preference, global
// across the item tables (the backlog/unassigned list, the sprint table, the work
// stream table), exactly like the column widths beside it. Keyed by column id, so
// a connector's vocabulary columns (`attr:<key>`) participate on the same terms
// as the app's own.
//
// Deliberately NOT connector configuration: the sync contract describes data,
// never display. See docs/item-columns.md.

import { createPersistedStore } from './persisted';
import { DEFAULT_COLUMN_PREFS, type ColumnPrefs } from '../components/fields/columns';

/** Reject a stored value that isn't the shape we write — a key left by an older
 *  build must not resurrect a half-understood preference. */
function parsePrefs(raw: string): ColumnPrefs | undefined {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    const { visibility, order } = parsed as Partial<ColumnPrefs>;
    if (!Array.isArray(order) || order.some((k) => typeof k !== 'string')) return undefined;
    if (typeof visibility !== 'object' || visibility === null) return undefined;
    const entries = Object.entries(visibility).filter(([, v]) => typeof v === 'boolean');
    return { visibility: Object.fromEntries(entries), order };
  } catch {
    return undefined;
  }
}

export const ColumnPrefsStore = createPersistedStore<ColumnPrefs>({
  key: 'release-tracker:columns',
  initial: DEFAULT_COLUMN_PREFS,
  parse: parsePrefs,
  serialize: (v) => JSON.stringify(v),
});

export const useColumnPrefs = ColumnPrefsStore.use;
