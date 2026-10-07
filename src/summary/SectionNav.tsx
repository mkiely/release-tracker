// A sticky row of jump links to the summary's sections.
//
// The sections are conditional (a snapshot with no velocity history has no Velocity
// block), so the nav is built from what actually rendered rather than a fixed list:
// it scans for elements tagged `data-nav` after each render. Buttons with
// scrollIntoView rather than #anchors, because the URL hash is the payload channel
// for the whole viewer and must not be touched.

import { useEffect, useState } from 'react';
import styles from './summary.module.css';

interface Section {
  id: string;
  label: string;
}

export function SectionNav({ watch }: { watch: unknown }) {
  const [sections, setSections] = useState<Section[]>([]);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const els = [...document.querySelectorAll<HTMLElement>('[data-nav]')];
    setSections(els.map((el) => ({ id: el.id, label: el.dataset.nav! })));
    if (typeof IntersectionObserver === 'undefined' || els.length === 0) return;
    // The active section is the last one whose top has scrolled above a line just
    // under the sticky bar.
    const onScroll = () => {
      let current = els[0].id;
      for (const el of els) if (el.getBoundingClientRect().top <= 90) current = el.id;
      setActive(current);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [watch]);

  if (sections.length < 2) return null;
  return (
    <nav className={styles.sectionNav} aria-label="Sections">
      {sections.map((s) => (
        <button
          key={s.id}
          type="button"
          className={`${styles.sectionNavBtn} ${active === s.id ? styles.sectionNavActive : ''}`}
          aria-current={active === s.id ? 'true' : undefined}
          onClick={() => document.getElementById(s.id)?.scrollIntoView({ block: 'start' })}
        >
          {s.label}
        </button>
      ))}
    </nav>
  );
}
