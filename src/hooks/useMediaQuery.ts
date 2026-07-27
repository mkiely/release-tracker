import { useEffect, useState } from 'react';

/**
 * Subscribes to a CSS media query. Used by the top-bar collapse ladder, where the
 * rule is: commands give up their labels first, navigation last, and identity
 * never truncates. A hook rather than a CSS class swap because the collapsed form
 * is a genuinely different control (an icon button carrying its label as a
 * tooltip), not the same control with text hidden.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(query).matches
      : false,
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/** Width below which the release top bar's command zones shed their labels. */
export const NARROW_CHROME = '(max-width: 1260px)';
