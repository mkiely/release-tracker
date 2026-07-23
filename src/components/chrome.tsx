// Shared chrome — TopBar, Brand, SyncButton, PushButton, SettingsPanel, NotFound.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { THEMES, ThemeStore, useTheme } from '../store/theme';
import { ViewModeStore, useViewMode } from '../store/viewMode';
import { TEXT_SCALES, TextScaleStore, useTextScale } from '../store/textScale';
import { PresentationStore, usePresentationMode } from '../store/presentationMode';
import type { Release } from '../types';
import { selDirtyCount, useStore } from '../store/store';
import { useApp } from '../app-context';
import { useConnectorMeta } from '../hooks/useConnectorMeta';
import { connectorCreateTypes } from '../sync/client';
import { Icon } from './Icon';
import { IconButton, PButton } from './primitives';
import { ShareButton } from './ShareButton';
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

export function SettingsPanel() {
  const theme = useTheme();
  const viewMode = useViewMode();
  const textScale = useTextScale();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const firstRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    firstRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onMouse = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onMouse);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onMouse);
    };
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <IconButton
        icon={Icon.sliders}
        onClick={() => setOpen((o) => !o)}
        title="Settings"
      />
      {open && (
        <div className={styles.settings} role="dialog" aria-label="Settings">
          <div className={styles.settingsSection}>
            <div className={styles.settingsSectionLabel}>Colour</div>
            {THEMES.map((t, i) => {
              const isActive = t.id === theme;
              return (
                <button
                  key={t.id}
                  ref={i === 0 ? firstRef : undefined}
                  onClick={() => ThemeStore.set(t.id)}
                  className={`${styles.paletteOption} ${isActive ? styles.paletteOptionActive : ''}`}
                >
                  <ThemeSwatch bg={t.bg} dot={t.dot} size={16} />
                  <span style={{ flex: 1 }}>{t.label}</span>
                  {isActive && <span style={{ color: 'var(--rt-t2)' }}>{Icon.check}</span>}
                </button>
              );
            })}
          </div>
          <div className={styles.settingsDivider} />
          <div className={styles.settingsSection}>
            <div className={styles.settingsSectionLabel}>View style</div>
            {(['cards', 'table'] as const).map((v) => {
              const isActive = viewMode === v;
              return (
                <button
                  key={v}
                  onClick={() => ViewModeStore.set(v)}
                  className={`${styles.paletteOption} ${isActive ? styles.paletteOptionActive : ''}`}
                >
                  <span style={{ flex: 1 }}>{v === 'cards' ? 'Cards' : 'Table'}</span>
                  {isActive && <span style={{ color: 'var(--rt-t2)' }}>{Icon.check}</span>}
                </button>
              );
            })}
          </div>
          <div className={styles.settingsDivider} />
          <div className={styles.settingsSection}>
            <div className={styles.settingsSectionLabel}>Text size</div>
            {TEXT_SCALES.map((s) => {
              const isActive = textScale === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => TextScaleStore.set(s.id)}
                  className={`${styles.paletteOption} ${isActive ? styles.paletteOptionActive : ''}`}
                >
                  <span style={{ flex: 1 }}>{s.label}</span>
                  {isActive && <span style={{ color: 'var(--rt-t2)' }}>{Icon.check}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/** @deprecated Use SettingsPanel instead. Kept for callers that haven't migrated. */
export const PalettePicker = SettingsPanel;

/** Persistent top-bar toggle for presentation mode — enlarges all UI text for
 *  readability when sharing the app in a meeting tab. Lives in every TopBar. */
export function PresentationToggle() {
  const on = usePresentationMode();
  return (
    <IconButton
      icon={Icon.present}
      active={on}
      onClick={() => PresentationStore.toggle()}
      title={on ? 'Presentation mode on — larger text (click to exit)' : 'Presentation mode — larger text for screen sharing'}
    />
  );
}

export function TopBar({
  left,
  title,
  titleIcon,
  sub,
  right,
}: {
  left?: ReactNode;
  title: ReactNode | null;
  titleIcon?: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className={styles.topBar}>
      <div className={styles.topBarLeft}>
        {left}
        <div style={{ minWidth: 0 }}>
          {typeof title === 'string' ? (
            <div className={styles.topBarTitle} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {titleIcon && <span style={{ display: 'inline-flex', color: 'var(--rt-t2)', flexShrink: 0 }}>{titleIcon}</span>}
              {title}
            </div>
          ) : (
            title
          )}
          {sub && <div className={styles.topBarSub}>{sub}</div>}
        </div>
      </div>
      <div className={styles.topBarRight}>
        {right && <div className={styles.topBarActions}>{right}</div>}
        <div className={right ? styles.topBarPaletteDivider : styles.topBarPalette} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <PresentationToggle />
          <SettingsPanel />
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
      ? `Synced ${new Date(sync!.lastISO!).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
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
  const { openModal } = useApp();
  const dirtyCount = useStore((s) => selDirtyCount(s, release.id));

  if (!release.connector) return null;
  if (dirtyCount === 0) return null;

  // Clicking Push opens the review modal; the modal performs the actual push on confirm.
  return (
    <PButton
      variant="subtle"
      sm
      icon={Icon.sync}
      onClick={() => openModal({ type: 'pushReview', releaseId: release.id, onConfirm: onPush })}
      title={`${dirtyCount} pending change${dirtyCount !== 1 ? 's' : ''}`}
      style={{ color: statusVars('In Progress').text }}
    >
      {`Push (${dirtyCount})`}
    </PButton>
  );
}

/** "New work item" button. Always shown for local releases. For connector
 *  releases it's shown only when the connector advertises a create capability
 *  (`creatable.item.types`); otherwise it's hidden — items are owned externally. */
export function NewItemButton({
  release,
  onClick,
  icon = Icon.item,
}: {
  release: Release;
  onClick: () => void;
  icon?: ReactNode;
}) {
  const meta = useConnectorMeta(release.connector?.type);
  if (release.connector && connectorCreateTypes(meta).length === 0) return null;
  return (
    <PButton sm icon={icon} onClick={onClick}>
      New work item
    </PButton>
  );
}

/** The shared TopBar action cluster for both sprint presenters (card + table):
 *  edit-sprint (or "Days off" on connector releases), Push, Sync, New work item. */
export function SprintTopActions({
  release,
  onEditSprint,
  onPush,
  onSync,
  onNewItem,
}: {
  release: Release;
  onEditSprint: () => void;
  onPush: () => void | Promise<void>;
  onSync: () => void | Promise<void>;
  onNewItem: () => void;
}) {
  return (
    <>
      {release.connector ? (
        <PButton variant="subtle" sm icon={Icon.cal} onClick={onEditSprint}>
          Days off
        </PButton>
      ) : (
        <PButton variant="subtle" sm icon={Icon.sprint} onClick={onEditSprint}>
          Edit sprint
        </PButton>
      )}
      <ShareButton release={release} />
      <PushButton release={release} onPush={onPush} />
      <SyncButton release={release} onSync={onSync} />
      <NewItemButton release={release} onClick={onNewItem} />
    </>
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
