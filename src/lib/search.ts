import type { WorkItem } from '../types';

/**
 * Quick-search match for the item lists. Deliberately only the key and the title:
 * descriptions are long and often rich text, so matching them buries the item
 * someone is looking for under incidental mentions.
 */
export function matchesQuery(item: Pick<WorkItem, 'key' | 'subject'>, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  return item.key.toLowerCase().includes(q) || item.subject.toLowerCase().includes(q);
}
