// Shared chrome — TopBar, Brand, SyncButton, ThemeToggle, NotFound.
// Ported from proto-app.jsx.

import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ThemeStore, useTheme } from '../store/theme';
import type { Release } from '../types';
import { Icon } from './Icon';
import { IconButton, PButton } from './primitives';
import { WF } from './tokens';

export function ThemeToggle() {
  const theme = useTheme();
  const dark = theme === 'dark';
  return (
    <IconButton
      icon={dark ? Icon.sun : Icon.moon}
      onClick={ThemeStore.toggle}
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
    />
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
          <ThemeToggle />
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
