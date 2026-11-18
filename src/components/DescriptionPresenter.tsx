// A work item's description, full-screen, for the meeting where a team reads it
// together before sizing it and agreeing acceptance criteria. The aim is the most
// readable text on one shared screen: big type, the screen's whole width, and
// columns that fill its height before scrolling.
//
// Opened from inside the work-item dialog and bound to that dialog's draft rather
// than the store, so what's presented is what the dialog holds — including edits
// not yet saved — and edits made while presenting land in the same draft, saved
// (or discarded) by the dialog's own buttons. That's also why it is local state of
// the dialog and not a ModalSpec: it has no life apart from the dialog beneath it.

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Status } from '../types';
import {
  PRESENT_SCALE_MAX,
  PRESENT_SCALE_MIN,
  PresentColumnsStore,
  PresentScaleStore,
  stepPresentScale,
  type PresentColumns,
} from '../store/descriptionPresenter';
import { RichTextEditor } from './RichTextEditor';
import { SegmentedToggle } from './SegmentedToggle';
import { StatusPill } from './Badges';
import { MetaChip } from './ui/Callout';
import { Icon } from './Icon';
import { IconButton } from './primitives';
import styles from './DescriptionPresenter.module.css';

const COLUMN_OPTIONS: { value: PresentColumns; label: string; title: string }[] = [
  { value: '1', label: '1 col', title: 'One readable column that scrolls down' },
  { value: '2', label: '2 col', title: 'Two columns that fill the screen height' },
  { value: 'auto', label: 'Auto', title: 'As many columns as fit the width at this text size' },
];

export function DescriptionPresenter({
  itemKey,
  subject,
  typeLabel,
  status,
  statusLabel,
  points,
  value,
  format,
  editable,
  onChange,
  onClose,
}: {
  itemKey: string;
  subject: string;
  typeLabel?: string;
  status: Status;
  /** The connector's native status name, when it has one. */
  statusLabel?: string;
  points: number | null;
  value: string;
  format: 'html' | 'text';
  editable: boolean;
  onChange: (v: string) => void;
  onClose: () => void;
}) {
  const columns = PresentColumnsStore.use();
  const scale = PresentScaleStore.use();
  const rootRef = useRef<HTMLDivElement>(null);
  // Plain text edits in a textarea, which can't flow into columns.
  const layout: PresentColumns = format === 'text' && editable ? '1' : columns;

  // Esc closes the presenter only. Capture phase so this runs before the dialog's
  // own window listener, which skips an event already marked handled.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
  }, [onClose]);

  // Return focus to whatever opened the presenter (the Present button).
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    rootRef.current?.focus();
    return () => opener?.focus?.();
  }, []);

  // Whether text runs past the screen, and which way. Columns overflow sideways,
  // which nothing else on screen would reveal — a table can sit one page to the
  // right with the room none the wiser — so the stage says so and offers a page turn.
  const [more, setMore] = useState<'right' | 'down' | null>(null);
  const [back, setBack] = useState(false);
  const scroller = () => rootRef.current?.querySelector<HTMLElement>('[data-scroll]') ?? null;
  useEffect(() => {
    const el = scroller();
    if (!el) return;
    const check = () => {
      const right = el.scrollWidth - el.clientWidth - el.scrollLeft > 2;
      const down = el.scrollHeight - el.clientHeight - el.scrollTop > 2;
      setMore(right ? 'right' : down ? 'down' : null);
      setBack(el.scrollLeft > 2);
    };
    // The rich editor renders after mount, so check again once it has painted.
    const raf = requestAnimationFrame(check);
    const ro = new ResizeObserver(check);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    el.addEventListener('scroll', check, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeEventListener('scroll', check);
    };
  }, [value, scale, layout]);

  // A sideways page is the visible width plus one column gap: the next column
  // starts a gap past the right edge, so turning by the width alone drifts a gap
  // further each page and pushes the last column off screen.
  const pageBy = (dir: 1 | -1) => {
    const el = scroller();
    if (!el) return;
    if (more === 'down' && dir > 0) {
      el.scrollBy({ top: el.clientHeight * 0.85 });
      return;
    }
    const flow = el.querySelector<HTMLElement>('.ProseMirror') ?? el.querySelector<HTMLElement>('[data-columns]');
    const gap = flow ? parseFloat(getComputedStyle(flow).columnGap) || 0 : 0;
    el.scrollBy({ left: dir * (el.clientWidth + gap) });
  };

  // The size lives in a custom property on the stage so a fit pass can try sizes
  // without a render per attempt. Layout effect, so the first paint is at size.
  useLayoutEffect(() => {
    rootRef.current?.style.setProperty('--rt-present-scale', String(scale));
  }, [scale]);

  // The largest size at which the whole description is on screen at once, never
  // below the floor. A one-shot command rather than a mode: re-fitting while
  // someone types would resize the text under their caret.
  const fit = () => {
    const root = rootRef.current;
    const el = scroller();
    if (!root || !el) return;
    const fits = (s: number) => {
      root.style.setProperty('--rt-present-scale', String(s));
      return el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1;
    };
    let lo = PRESENT_SCALE_MIN;
    let hi = PRESENT_SCALE_MAX;
    if (fits(hi)) lo = hi;
    else {
      for (let i = 0; i < 10; i++) {
        const mid = (lo + hi) / 2;
        if (fits(mid)) lo = mid;
        else hi = mid;
      }
    }
    const next = Math.floor(lo * 100) / 100;
    root.style.setProperty('--rt-present-scale', String(next));
    PresentScaleStore.set(next);
  };

  const pct = `${Math.round((scale / PRESENT_SCALE_MIN) * 100)}%`;

  let body: ReactNode;
  if (format === 'html') {
    body = <RichTextEditor value={value} editable={editable} onChange={onChange} variant="present" columns={layout} />;
  } else if (editable) {
    body = (
      <textarea
        className={styles.plainEdit}
        data-scroll=""
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="No description yet — add detail, acceptance criteria, links…"
        aria-label="Description"
      />
    );
  } else {
    body = (
      <div className={styles.plainScroll} data-scroll="">
        <div className={styles.plain} data-columns={layout}>
          {value || <span className="t3">No description.</span>}
        </div>
      </div>
    );
  }

  return createPortal(
    <div ref={rootRef} tabIndex={-1} className={styles.stage} role="dialog" aria-modal="true" aria-label={`${itemKey} description`}>
      <header className={styles.head}>
        <div className={styles.titleBlock}>
          <div className={styles.meta}>
            <span className={`mono ${styles.key}`}>{itemKey}</span>
            {typeLabel && <MetaChip>{typeLabel}</MetaChip>}
            <StatusPill status={status} label={statusLabel} />
            {/* Unestimated is the usual state in this meeting, so it's said, not hidden. */}
            <MetaChip title={points == null ? 'No estimate yet' : 'Estimate'}>
              {points == null ? 'Unestimated' : `${points} pts`}
            </MetaChip>
            {!editable && <span className={`t3 ${styles.readOnlyNote}`}>Read-only</span>}
          </div>
          <h1 className={styles.subject}>{subject}</h1>
        </div>
        <div className={styles.controls}>
          <SegmentedToggle options={COLUMN_OPTIONS} value={layout} onChange={PresentColumnsStore.set} ariaLabel="Columns" />
          <div className={styles.sizeGroup} role="group" aria-label="Text size">
            <button
              type="button"
              className={styles.sizeBtn}
              onClick={() => PresentScaleStore.set(stepPresentScale(scale, -1))}
              disabled={scale <= PRESENT_SCALE_MIN}
              title="Smaller text"
              aria-label="Smaller text"
            >
              A−
            </button>
            <span className={`mono t3 ${styles.sizeReadout}`} aria-live="polite">{pct}</span>
            <button
              type="button"
              className={styles.sizeBtn}
              onClick={() => PresentScaleStore.set(stepPresentScale(scale, 1))}
              disabled={scale >= PRESENT_SCALE_MAX}
              title="Larger text"
              aria-label="Larger text"
            >
              A+
            </button>
            <button type="button" className={styles.fitBtn} onClick={fit} title="Largest text that fits the whole description on screen">
              Fit
            </button>
          </div>
          <IconButton icon={Icon.close} onClick={onClose} title="Close presenter (Esc)" />
        </div>
      </header>
      <main className={styles.body}>
        {body}
        {back && (
          <button
            type="button"
            className={`${styles.more} ${styles.back}`}
            onClick={() => pageBy(-1)}
            title="Back to the previous columns"
          >
            {Icon.chevLeft} Back
          </button>
        )}
        {more && (
          <button
            type="button"
            className={styles.more}
            onClick={() => pageBy(1)}
            title={more === 'right' ? 'The description continues in the next columns' : 'The description continues below'}
          >
            More {more === 'right' ? Icon.chevRight : Icon.chevDown}
          </button>
        )}
      </main>
    </div>,
    document.body,
  );
}
