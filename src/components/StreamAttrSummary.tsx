// Connector-declared work-stream attributes as small `label · value` tags,
// rendered beside the stream title in both work-stream view modes. Unset
// values are skipped (a tag saying "Track · —" is noise in a header).

import type { Release, WorkStream } from '../types';
import { streamAttributeColumns } from './fields/columns';

export function StreamAttrSummary({ release, ws }: { release: Release; ws: WorkStream }) {
  const tags = streamAttributeColumns(release.catalog)
    .map((c) => ({ key: c.key, label: c.label, value: c.cell(ws) }))
    .filter((t) => t.value !== '—');
  if (tags.length === 0) return null;
  return (
    <>
      {tags.map((t) => (
        <span key={t.key} className="tag" style={{ flexShrink: 0 }} title={`${t.label} (from the connector)`}>
          {t.label} · {t.value}
        </span>
      ))}
    </>
  );
}
