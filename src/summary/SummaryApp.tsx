// The standalone summary viewer's root. Entirely stateless with respect to the
// main app: it reads a snapshot from the URL hash, remembers it locally, and
// renders either that snapshot or the library of remembered ones. No store, no
// router, no connector knowledge — it runs as a static page (e.g. a GitHub Page).

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { SnapshotPayload } from '../lib/releaseSnapshot';
import { SNAPSHOT_PARAM, decodeSnapshot } from '../lib/releaseSnapshot';
import { ThemeStore, THEMES, useTheme } from '../store/theme';
import { fmtLong } from '../lib/dates';
import { Icon } from '../components/Icon';
import { forgetSummary, listSummaries, rememberSummary } from './library';
import { SummaryView } from './SummaryView';
import styles from './summary.module.css';

/** Parse an `#s=<payload>` fragment into a snapshot, or null. Tolerates a leading
 *  `#` and other hash params in any order. */
function snapshotFromHash(hash: string): SnapshotPayload | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const encoded = params.get(SNAPSHOT_PARAM);
  return encoded ? decodeSnapshot(encoded) : null;
}

/** Cycle to the next theme (light ↔ dark is the common case; the full palette is
 *  available in the app itself). Keeps the viewer honest to the app's tokens. */
function ThemeToggle() {
  const theme = useTheme();
  const isDark = THEMES.find((t) => t.id === theme)?.dark ?? false;
  return (
    <button
      type="button"
      className={styles.iconBtn}
      title={isDark ? 'Switch to light' : 'Switch to dark'}
      onClick={() => ThemeStore.set(isDark ? 'light' : 'dark')}
    >
      {isDark ? Icon.sun : Icon.moon}
    </button>
  );
}

/** Subscribe to the library so removing a summary re-renders the index. A trivial
 *  external store: a version counter bumped whenever the viewer mutates the library. */
let libVersion = 0;
const libListeners = new Set<() => void>();
function bumpLibrary() {
  libVersion++;
  libListeners.forEach((l) => l());
}
function useLibrary(): SnapshotPayload[] {
  // Re-render on every library mutation; listSummaries() then reads the fresh state.
  useSyncExternalStore(
    (cb) => {
      libListeners.add(cb);
      return () => libListeners.delete(cb);
    },
    () => libVersion,
    () => libVersion,
  );
  return listSummaries();
}

function LibraryIndex({ onOpen }: { onOpen: (id: string) => void }) {
  const summaries = useLibrary();

  if (summaries.length === 0) {
    return (
      <div className={styles.empty}>
        <span className={styles.emptyTitle}>No summaries yet</span>
        <span>Open a summary link to view it here. Summaries you open are remembered on this device.</span>
      </div>
    );
  }

  return (
    <>
      <div className={styles.header}>
        <h1 className="t-title">Release summaries</h1>
        <div className={styles.headerMeta}>Remembered on this device · newest first</div>
      </div>
      <div className={styles.libList}>
        {summaries.map((s) => (
          <div key={s.summaryId} className={`card ${styles.libRow}`} onClick={() => onOpen(s.summaryId)}>
            <div className={styles.libMain}>
              <span className={styles.libName}>{s.name}</span>
              <span className={styles.libSub}>
                {s.teamName ? `${s.teamName} · ` : ''}
                {s.dateRange} · generated {fmtLong(s.generatedAtISO.slice(0, 10))}
              </span>
            </div>
            <div className={styles.libRight}>
              <span className={styles.libPct}>{s.overall.completionPct}%</span>
              <button
                type="button"
                className={styles.forget}
                title="Forget this summary"
                onClick={(e) => {
                  e.stopPropagation();
                  forgetSummary(s.summaryId);
                  bumpLibrary();
                }}
              >
                {Icon.trash}
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export function SummaryApp() {
  // The snapshot in the URL, if any. Consumed once on mount: we remember it, then
  // strip the hash so a reload lands on the library rather than re-importing.
  const [openId, setOpenId] = useState<string | null>(null);
  const [invalidLink, setInvalidLink] = useState(false);

  useEffect(() => {
    const payload = snapshotFromHash(window.location.hash);
    if (window.location.hash.includes(`${SNAPSHOT_PARAM}=`) && !payload) {
      setInvalidLink(true);
    }
    if (payload) {
      rememberSummary(payload);
      bumpLibrary();
      setOpenId(payload.summaryId);
      // Drop the (large) payload from the address bar; the summary now lives in the
      // local library and is addressed by id.
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, []);

  const summaries = useLibrary();
  const open = useCallback((id: string) => setOpenId(id), []);
  const back = useCallback(() => setOpenId(null), []);

  const current = openId ? summaries.find((s) => s.summaryId === openId) ?? null : null;

  return (
    <div className={`wf ${styles.page}`}>
      <div className={styles.topbar}>
        <span className={styles.brand}>{Icon.release} Release Tracker · Summary</span>
        <ThemeToggle />
      </div>

      {invalidLink && !current && (
        <div className={styles.empty}>
          <span className={styles.emptyTitle}>That summary link is invalid or expired</span>
          <span>The link may be truncated. Ask for a fresh one, or browse remembered summaries below.</span>
        </div>
      )}

      {current ? <SummaryView snapshot={current} onBack={back} /> : <LibraryIndex onOpen={open} />}
    </div>
  );
}
