import { Fragment, type ReactNode } from 'react';
import { Icon } from './Icon';

export interface Crumb {
  label: ReactNode;
  /** Optional leading icon, rendered inline before the label. */
  icon?: ReactNode;
  onClick?: () => void;
}

/**
 * The "Releases › {release} › {leaf}" trail at the top of the sprint/work-stream
 * screens. The last crumb is styled as the current location (semibold, t2);
 * earlier crumbs with an `onClick` are clickable. Pass `marginBottom` to make
 * room for a larger title block beneath (the card views do).
 */
export function Breadcrumb({ crumbs, marginBottom }: { crumbs: Crumb[]; marginBottom?: number }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        fontSize: 'var(--rt-fs-sm)',
        color: 'var(--rt-t3)',
        whiteSpace: 'nowrap',
        ...(marginBottom != null ? { marginBottom } : {}),
      }}
    >
      {crumbs.map((c, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <Fragment key={i}>
            <span
              onClick={c.onClick}
              style={{
                cursor: c.onClick ? 'pointer' : undefined,
                ...(c.icon ? { display: 'inline-flex', alignItems: 'center', gap: 4 } : {}),
                ...(isLast ? { fontWeight: 'var(--rt-fw-semibold)', color: 'var(--rt-t2)' } : {}),
              }}
            >
              {c.icon}
              {c.label}
            </span>
            {!isLast && Icon.chevRight}
          </Fragment>
        );
      })}
    </div>
  );
}
