// Shared chrome — TopBar, Brand, SyncButton, PushButton, SettingsPanel, NotFound.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { THEMES, ThemeStore, useTheme } from '../store/theme';
import { ViewModeStore, useViewMode } from '../store/viewMode';
import { TEXT_SCALES, TextScaleStore, useTextScale } from '../store/textScale';
import { PresentationStore, usePresentationMode } from '../store/presentationMode';
import type { Release } from '../types';
import { getActions, selDirtyCount, useStore } from '../store/store';
import { useApp } from '../app-context';
import { useConnectorMeta } from '../hooks/useConnectorMeta';
import { connectorCreateTypes } from '../sync/client';
import { Breadcrumb, type Crumb } from './Breadcrumb';
import { Icon } from './Icon';
import { Menu } from './Menu';
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
  crumbs,
  title,
  titleIcon,
  sub,
  right,
}: {
  left?: ReactNode;
  /** Trail rendered above the title. */
  crumbs?: Crumb[];
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
          {crumbs && crumbs.length > 0 && <Breadcrumb crumbs={crumbs} marginBottom={4} />}
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

/** Offered auto-sync cadences (minutes). 0 = off, the default. */
const AUTO_SYNC_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: 'Off' },
  { value: 10, label: '10 min' },
  { value: 30, label: '30 min' },
  { value: 60, label: '60 min' },
];

/** Compact "how long ago" for the sync trigger. An absolute timestamp is precision
 *  nobody reads; what matters is whether the data is minutes or days old. */
function relTime(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

/**
 * The release header's connector cluster, collapsed behind one trigger: the face
 * reports freshness ("Synced 2h ago") and badges pending changes, the caret holds
 * pull / push / auto-sync cadence. Replaces three separate top-bar controls whose
 * combined 310px was mostly idle state, and stops Push from popping in and out of
 * the row as the dirty count crosses zero.
 */
export function SyncMenu({
  release,
  onSync,
  onPush,
}: {
  release: Release;
  onSync: () => void | Promise<void>;
  onPush: () => void | Promise<void>;
}) {
  const { openModal } = useApp();
  const dirtyCount = useStore((s) => selDirtyCount(s, release.id));
  const [busy, setBusy] = useState(false);
  if (!release.connector) return null;

  const sync = release.sync;
  const ok = sync?.state === 'ok' && sync.lastISO;
  const err = sync?.state === 'error';
  const cadence = release.autoSyncMinutes ?? 0;

  const label = busy ? 'Syncing…' : ok ? `Synced ${relTime(sync!.lastISO!)}` : err ? 'Sync failed' : 'Sync';
  const color = busy ? undefined : err ? statusVars('Blocked').text : ok ? statusVars('Complete').text : undefined;

  const pull = async () => {
    if (busy) return;
    setBusy(true);
    try { await onSync(); } finally { setBusy(false); }
  };

  return (
    <Menu
      label={
        <>
          {label}
          {dirtyCount > 0 && (
            <span className={styles.dirtyBadge} title={`${dirtyCount} pending change${dirtyCount !== 1 ? 's' : ''}`}>
              {dirtyCount}
            </span>
          )}
        </>
      }
      icon={Icon.sync}
      sm
      title={err && sync?.message ? sync.message : 'Connector sync — pull, push, and automatic pull cadence'}
      style={color ? { color } : undefined}
      actions={[
        {
          key: 'push',
          label: `Push ${dirtyCount} change${dirtyCount !== 1 ? 's' : ''}…`,
          icon: Icon.sync,
          visible: dirtyCount > 0,
          onSelect: () => openModal({ type: 'pushReview', releaseId: release.id, onConfirm: onPush }),
          title: 'Review local edits before sending them to the connector',
        },
        {
          key: 'pull',
          label: busy ? 'Pulling…' : 'Pull now',
          icon: Icon.sync,
          disabled: busy,
          onSelect: pull,
          title: 'Fetch the latest from the connector',
        },
        ...AUTO_SYNC_OPTIONS.map((o) => ({
          key: `auto-${o.value}`,
          section: 'Automatic pull',
          label: o.value === 0 ? 'Off' : `Every ${o.label}`,
          checked: cadence === o.value,
          onSelect: () => getActions().setAutoSync(release.id, o.value || null),
        })),
      ]}
    />
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

/**
 * The TopBar action cluster shared by every screen inside a release (sprint,
 * work stream, backlog, unassigned), in both densities.
 *
 * Every one of these screens used to spell this cluster out for itself, and they
 * had drifted: the work-stream table had lost its Share button, and the sprint
 * screens carried a `SprintTopActions` variant that the others didn't. `leading`
 * is the only genuine per-screen difference (the sprint screens put an
 * edit-sprint button first), so it's the only thing passed in.
 *
 * Connector controls go through SyncMenu — one trigger holding pull, push and
 * cadence — rather than the separate Sync and Push buttons these screens used,
 * which reported freshness in a different format from the release header and
 * made Push pop in and out of the row as the dirty count crossed zero.
 */
export function ReleaseActions({
  release,
  leading,
  onPush,
  onSync,
  onNewItem,
  newItemIcon,
}: {
  release: Release;
  /** Screen-specific actions, rendered before the shared ones. */
  leading?: ReactNode;
  onPush: () => void | Promise<void>;
  onSync: () => void | Promise<void>;
  onNewItem: () => void;
  newItemIcon?: ReactNode;
}) {
  return (
    <>
      {leading}
      <ShareButton release={release} />
      <SyncMenu release={release} onSync={onSync} onPush={onPush} />
      <NewItemButton release={release} onClick={onNewItem} icon={newItemIcon} />
    </>
  );
}

/** The edit-sprint action that leads the cluster on the two sprint screens.
 *  Connector releases own the sprint itself, so only days off is editable. */
export function EditSprintButton({ release, onEditSprint }: { release: Release; onEditSprint: () => void }) {
  return release.connector ? (
    <PButton variant="subtle" sm icon={Icon.cal} onClick={onEditSprint}>
      Days off
    </PButton>
  ) : (
    <PButton variant="subtle" sm icon={Icon.sprint} onClick={onEditSprint}>
      Edit sprint
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
