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

/**
 * Width below which the release top bar's command zones shed their labels.
 *
 * Sized so the ladder fires *before* the action row overflows, not after: at full
 * labels the row needs ~660px beside the identity block, and once it can't have
 * that the identity block wraps to two lines — the one thing the ladder is meant
 * to protect. Raised from 1260 when the connector cluster split Pull and Push
 * into two controls (~110px), which is exactly the width this has to track.
 */
export const NARROW_CHROME = '(max-width: 1380px)';
