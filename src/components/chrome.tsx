// Shared chrome — TopBar, Brand, SyncButton, PalettePicker, NotFound.
// Ported from proto-app.jsx.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { THEMES, ThemeStore, useTheme } from '../store/theme';
import type { Release } from '../types';
import { Icon } from './Icon';
import { IconButton, PButton } from './primitives';
import { WF } from './tokens';

// Small two-tone swatch: left half = bg, right half = active dot
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
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            zIndex: 60,
            background: WF.paper,
            border: `1.5px solid ${WF.line}`,
            borderRadius: 12,
            boxShadow: `0 8px 28px var(--wf-shadow)`,
            padding: '6px 0',
            minWidth: 180,
          }}
        >
          {THEMES.map((t) => {
            const isActive = t.id === theme;
            return (
              <button
                key={t.id}
                onClick={() => { ThemeStore.set(t.id); setOpen(false); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  width: '100%',
                  padding: '7px 14px',
                  background: isActive ? WF.fill : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: 13,
                  fontWeight: isActive ? 650 : 400,
                  color: WF.ink,
                  textAlign: 'left',
                }}
              >
                <ThemeSwatch bg={t.bg} dot={t.dot} size={16} />
                <span style={{ flex: 1 }}>{t.label}</span>
                {isActive && (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ color: WF.t2 }}>
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
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        padding: '14px 24px',
        borderBottom: `1.5px solid ${WF.line}`,
        background: WF.paper,
        flex: '0 0 auto',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
        {left}
        <div style={{ minWidth: 0 }}>
          {typeof title === 'string' ? (
            <div style={{ fontSize: 19, fontWeight: 750, letterSpacing: '-0.02em', lineHeight: 1.05, whiteSpace: 'nowrap' }}>
              {title}
            </div>
          ) : (
            title
          )}
          {sub && (
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 6, color: WF.t3, fontSize: 12.5, marginTop: 3, whiteSpace: 'nowrap' }}
            >
              {sub}
            </div>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {right && <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>{right}</div>}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            paddingLeft: right ? 12 : 0,
            borderLeft: right ? `1.5px solid ${WF.line}` : 'none',
          }}
        >
          <PalettePicker />
        </div>
      </div>
    </div>
  );
}

export function Brand() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
      <div style={{ width: 26, height: 26, borderRadius: 7, background: WF.ink }} />
      <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: '-0.01em' }}>Release Tracker</span>
    </div>
  );
}

// Per-release sync control. Hidden entirely for Local releases (no connector).
// Reflects the release's own sync status: time on success, red on error, spinner
// while in flight.
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
  const color = busy ? undefined : ok ? WF.status.Complete.text : err ? WF.status.Blocked.text : undefined;

  const run = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onSync();
    } finally {
      setBusy(false);
    }
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

export function NotFound({ label }: { label: string }) {
  const navigate = useNavigate();
  return (
    <div className="wf wf-screen pt-root" style={{ alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <div style={{ fontSize: 16, fontWeight: 650, color: WF.t2 }}>{label}</div>
      <PButton icon={Icon.chevLeft} onClick={() => navigate('/')}>
        Back to releases
      </PButton>
    </div>
  );
}
