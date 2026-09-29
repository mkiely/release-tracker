// Small pieces shared between modals. Row is the labelled key/value line the
// sprint and metrics modals both lay their readouts out with; it lives here
// rather than in either of them so neither imports the other.

import { type ReactNode } from 'react';
import { statusVars } from '../components/statusVars';

export function Row({ k, v, big }: { k: ReactNode; v: ReactNode; big?: boolean }) {
  return (
    <div className="calc" style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, fontSize: big ? 15 : 13 }}>
      <span title={typeof k === 'string' ? k : undefined} style={{ color: big ? 'var(--rt-ink)' : 'var(--rt-t2)', fontWeight: big ? 700 : 400, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k}</span>
      <span className="mono" style={{ fontWeight: 'var(--rt-fw-semibold)', color: big ? statusVars('In Progress').text : 'var(--rt-ink)', whiteSpace: 'nowrap', fontSize: big ? 15 : 13 }}>
        {v}
      </span>
    </div>
  );
}
