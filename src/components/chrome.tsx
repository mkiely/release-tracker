// Shared chrome — TopBar, Brand, SyncButton, PushButton, PalettePicker, NotFound.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { THEMES, ThemeStore, useTheme } from '../store/theme';
import type { Release } from '../types';
import { selDirtyCount, useStore } from '../store/store';
import { Icon } from './Icon';
import { IconButton, PButton } from './primitives';
import { statusVars } from './statusVars';
import styles from './chrome.module.css';

function ThemeSwatch({ bg, dot, size = 14 }: { bg: string; dot: string; size?: number }) {
  const r = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0, borderRadius: '50%', overflow: 'hidden' }}>
      <rect x="0" y="0" width={r} height={size} fill={bg} />
      <rect x={r} y="0" width={r} height={size} fill={dot} />
    </svg>
  );
}

export function PalettePicker() {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = THEMES.find((t) => t.id === theme) ?? THEMES[0];

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <IconButton
        icon={<ThemeSwatch bg={active.bg} dot={active.dot} size={15} />}
        onClick={() => setOpen((o) => !o)}
        title="Choose colour theme"
      />
      {open && (
        <div className={styles.palette}>
          {THEMES.map((t) => {
            const isActive = t.id === theme;
            return (
              <button
                key={t.id}
                onClick={() => { ThemeStore.set(t.id); setOpen(false); }}
                className={`${styles.paletteOption} ${isActive ? styles.paletteOptionActive : ''}`}
              >
                <ThemeSwatch bg={t.bg} dot={t.dot} size={16} />
                <span style={{ flex: 1 }}>{t.label}</span>
                {isActive && (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--rt-t2)' }}>
                    <path d="M2 6l2.8 3L10 3" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function TopBar({
  left,
  title,
  sub,
  right,
}: {
  left?: ReactNode;
  title: ReactNode | null;
  sub?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className={styles.topBar}>
      <div className={styles.topBarLeft}>
        {left}
        <div style={{ minWidth: 0 }}>
          {typeof title === 'string' ? (
            <div className={styles.topBarTitle}>{title}</div>
          ) : (
            title
          )}
          {sub && <div className={styles.topBarSub}>{sub}</div>}
        </div>
      </div>
      <div className={styles.topBarRight}>
        {right && <div className={styles.topBarActions}>{right}</div>}
        <div className={right ? styles.topBarPaletteDivider : styles.topBarPalette}>
          <PalettePicker />
        </div>
      </div>
    </div>
  );
}

export function Brand() {
  return (
    <div className={styles.brand}>
      <div className={styles.brandLogo} />
      <span className={styles.brandLabel}>Release Tracker</span>
    </div>
  );
}

export function SyncButton({ release, onSync }: { release: Release; onSync: () => void | Promise<void> }) {
  const [busy, setBusy] = useState(false);
  if (!release.connector) return null;

  const sync = release.sync;
  const ok = sync?.state === 'ok' && sync.lastISO;
  const err = sync?.state === 'error';
  const label = busy
    ? 'Syncing…'
    : ok
      ? `Synced ${new Date(sync!.lastISO!).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
      : err
        ? 'Sync failed'
        : 'Sync';
  const color = busy
    ? undefined
    : ok
      ? statusVars('Complete').text
      : err
        ? statusVars('Blocked').text
        : undefined;

  const run = async () => {
    if (busy) return;
    setBusy(true);
    try { await onSync(); } finally { setBusy(false); }
  };

  return (
    <PButton
      variant="subtle"
      sm
      icon={Icon.sync}
      onClick={run}
      disabled={busy}
      title={err && sync?.message ? sync.message : undefined}
      style={color ? { color } : undefined}
    >
      {label}
    </PButton>
  );
}

export function PushButton({ release, onPush }: { release: Release; onPush: () => void | Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const dirtyCount = useStore((s) => selDirtyCount(s, release.id));

  if (!release.connector) return null;
  if (dirtyCount === 0 && !busy) return null;

  const run = async () => {
    if (busy) return;
    setBusy(true);
    try { await onPush(); } finally { setBusy(false); }
  };

  return (
    <PButton
      variant="subtle"
      sm
      icon={Icon.sync}
      onClick={run}
      disabled={busy || dirtyCount === 0}
      title={dirtyCount > 0 ? `${dirtyCount} pending change${dirtyCount !== 1 ? 's' : ''}` : undefined}
      style={dirtyCount > 0 ? { color: statusVars('In Progress').text } : undefined}
    >
      {busy ? 'Pushing…' : `Push${dirtyCount > 0 ? ` (${dirtyCount})` : ''}`}
    </PButton>
  );
}

export function NotFound({ label }: { label: string }) {
  const navigate = useNavigate();
  return (
    <div className={`wf screen ${styles.notFound}`}>
      <div className={styles.notFoundLabel}>{label}</div>
      <PButton icon={Icon.chevLeft} onClick={() => navigate('/')}>
        Back to releases
      </PButton>
    </div>
  );
}
