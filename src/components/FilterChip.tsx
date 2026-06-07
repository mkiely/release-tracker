import type { ReactNode } from 'react';

/** Color tokens for the active state of a colored chip (from statusVars/typeVars). */
export interface ChipVars {
  dot: string;
  soft: string;
  text: string;
}

/**
 * A pill-shaped toggle used in every filter bar. Two flavors:
 *  - colored: pass `vars` (status/type tokens) — active state tints border/bg/text.
 *  - ink: omit `vars` — active state uses the neutral ink/fill tokens.
 * A `leading` node (e.g. an avatar) replaces the default status dot; `dotShape`
 * switches the dot between round (default) and square (builds).
 */
export function FilterChip({
  active,
  label,
  title,
  onClick,
  vars,
  dotShape = 'round',
  leading,
}: {
  active: boolean;
  label: ReactNode;
  title?: string;
  onClick: () => void;
  vars?: ChipVars;
  dotShape?: 'round' | 'square';
  leading?: ReactNode;
}) {
  const activeBorder = vars ? vars.dot : 'var(--rt-ink)';
  const activeBg = vars ? vars.soft : 'var(--rt-fill)';
  const activeColor = vars ? vars.text : 'var(--rt-ink)';
  const activeDot = vars ? vars.dot : 'var(--rt-ink)';
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: leading ? '2px 9px 2px 5px' : '2px 9px 2px 7px',
        borderRadius: 20,
        border: `1.5px solid ${active ? activeBorder : 'var(--rt-line)'}`,
        background: active ? activeBg : 'transparent',
        color: active ? activeColor : 'var(--rt-t3)',
        cursor: 'pointer',
        fontSize: 'var(--rt-fs-xs)',
        fontWeight: active ? 700 : 500,
        fontFamily: 'var(--rt-sans)',
        whiteSpace: 'nowrap',
      }}
    >
      {leading ?? (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: dotShape === 'square' ? 2 : '50%',
            background: active ? activeDot : 'var(--rt-t3)',
            flexShrink: 0,
          }}
        />
      )}
      {label}
    </button>
  );
}

/**
 * The "Clear" text button that ends a filter bar. Style matches the previous
 * inline clear buttons exactly so it drops into either card or table bars.
 */
export function ClearFiltersButton({ onClick, title = 'Clear all filters' }: { onClick: () => void; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        fontSize: 'var(--rt-fs-xs)',
        fontWeight: 'var(--rt-fw-semibold)',
        color: 'var(--rt-t3)',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        fontFamily: 'var(--rt-sans)',
        padding: '2px 4px',
      }}
    >
      Clear
    </button>
  );
}
