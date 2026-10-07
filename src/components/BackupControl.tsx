// The durable backup's UI: a status control in every top bar, and a banner for the
// two states that need a decision (a conflict, a backup this build won't use).
//
// The backup itself runs without any of this (store/backup.ts). What the UI adds is
// visibility — whether this browser's data is safe right now — and the few verbs a
// person needs: back up now, export/import a file, settle a conflict, start fresh.
// There is deliberately no "storage mode" setting: data is backed up exactly when
// work-truck is running, so the status says which, and Export is one click away.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useApp } from '../app-context';
import { fmtDateTime, relTime } from '../lib/dates';
import { EPOCH } from '../store/backupEnvelope';
import { applyImport, backupFileName, exportEnvelope, parseBackupFile } from '../store/backupFile';
import { getBackup, useBackupStatus, type BackupStatus } from '../store/backup';
import { getActions } from '../store/store';
import { Icon } from './Icon';
import { IconButton, PButton } from './primitives';
import chrome from './AppChrome.module.css';
import styles from './BackupControl.module.css';

type Tone = 'ok' | 'busy' | 'idle' | 'alert';

interface View {
  tone: Tone;
  headline: string;
  detail: ReactNode;
}

/** When the backed-up data last changed, in words. EPOCH = demo data never touched. */
function lastChange(savedAt: string): string {
  return savedAt === EPOCH ? 'no changes made yet' : `last change ${relTime(savedAt)}`;
}

function describe(status: BackupStatus): View {
  switch (status.kind) {
    case 'checking':
      return { tone: 'busy', headline: 'Checking backup…', detail: 'Looking for work-truck.' };
    case 'saving':
      return { tone: 'busy', headline: 'Saving backup…', detail: status.meta ? `Backup rev ${status.meta.rev}.` : 'Creating the first backup.' };
    case 'restoring':
      return { tone: 'busy', headline: 'Restoring backup…', detail: 'The page reloads when it’s done.' };
    case 'backed-up':
      return {
        tone: 'ok',
        headline: 'Backed up',
        detail: `Everything in this browser is saved in work-truck — ${lastChange(status.meta.savedAt)}.`,
      };
    case 'unavailable':
      return {
        tone: 'idle',
        headline: 'Not backed up',
        detail: 'work-truck isn’t running, so your data is only in this browser. Start work-truck to back up automatically, or export a copy.',
      };
    case 'conflict':
      return {
        tone: 'alert',
        headline: 'Backup conflict',
        detail: 'This browser and the backup have both changed. Choose which to keep — nothing is saved until you do.',
      };
    case 'refused':
      return status.reason === 'newer-schema'
        ? {
            tone: 'alert',
            headline: 'Backup not used',
            detail: 'The backup was written by a newer version of the app. Update this one to use it — nothing has been overwritten.',
          }
        : {
            tone: 'alert',
            headline: 'Backup unreadable',
            detail: 'The backup file couldn’t be read. Nothing has been overwritten; earlier copies are in ~/.work-truck/backup/history.',
          };
    case 'detached':
      return {
        tone: 'idle',
        headline: 'Backup detached',
        detail: 'You started fresh, so this browser isn’t restoring from or saving to the backup.',
      };
    case 'off':
      return { tone: 'idle', headline: '', detail: '' };
  }
}

/** The backup verbs, shared by the top-bar menu and the banner. */
function useBackupActions() {
  const { openModal, notify } = useApp();
  const status = useBackupStatus();
  const fileRef = useRef<HTMLInputElement>(null);

  const exportFile = () => {
    const blob = new Blob([JSON.stringify(exportEnvelope(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = backupFileName();
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const checked = parseBackupFile(await file.text());
    if (!checked.ok) {
      notify(checked.reason === 'newer-schema' ? 'That backup is from a newer version of the app' : 'That file isn’t a Release Tracker backup');
      return;
    }
    const env = checked.envelope;
    const when = fmtDateTime(env.savedAt);
    openModal({
      type: 'confirm',
      title: 'Import backup?',
      body:
        `Replace everything in this browser — releases, items, teams and settings — with ` +
        `${env.savedAt === EPOCH ? 'this backup' : `the backup from ${when}`}? ` +
        (status.kind === 'backed-up' ? 'The work-truck backup will be updated to match.' : 'Export a copy first if you might want what’s here now.'),
      confirmLabel: 'Replace and reload',
      onConfirm: () => {
        applyImport(env);
        window.location.reload();
      },
    });
  };

  const chooseBackup = () =>
    openModal({
      type: 'confirm',
      title: 'Use the backup?',
      body: 'This browser’s data is replaced with the backup and the page reloads. Changes made only in this browser are lost — export a copy first if you might want them.',
      confirmLabel: 'Use the backup',
      onConfirm: () => void getBackup()?.resolveConflict('use-backup'),
    });

  const chooseThisBrowser = () =>
    openModal({
      type: 'confirm',
      title: 'Keep this browser?',
      body: 'The backup is replaced with this browser’s data. Its current copy is kept in work-truck’s backup history, so it can still be recovered by hand.',
      confirmLabel: 'Keep this browser',
      onConfirm: () => void getBackup()?.resolveConflict('keep-this-browser'),
    });

  const startFresh = () =>
    openModal({
      type: 'confirm',
      title: 'Start fresh?',
      body:
        'This browser’s data is replaced with the demo data, and it stops restoring from and saving to the backup. ' +
        (status.kind === 'backed-up'
          ? 'The backup itself is left as it is — re-attach to get it back.'
          : 'There’s no backup to come back to right now, so export a copy first if you want to keep anything.'),
      confirmLabel: 'Start fresh',
      onConfirm: () => {
        getBackup()?.detach();
        getActions().reset();
      },
    });

  const reattach = () =>
    openModal({
      type: 'confirm',
      title: 'Re-attach to the backup?',
      body: 'This browser goes back to using the backup. If it has changes since you started fresh, you’ll be asked which to keep — nothing is overwritten without asking.',
      confirmLabel: 'Re-attach',
      onConfirm: () => void getBackup()?.attach(),
    });

  const backUpNow = async () => {
    await getBackup()?.flushNow('backed up by hand');
    if (getBackup()?.getStatus().kind === 'backed-up') notify('Backed up');
  };

  const fileInput = (
    <input
      ref={fileRef}
      type="file"
      accept="application/json,.json"
      hidden
      onChange={(e) => {
        void onFile(e.target.files?.[0]);
        e.target.value = ''; // so choosing the same file again still fires
      }}
    />
  );

  return {
    status,
    exportFile,
    importFile: () => fileRef.current?.click(),
    fileInput,
    chooseBackup,
    chooseThisBrowser,
    startFresh,
    reattach,
    backUpNow,
    checkAgain: () => void getBackup()?.retry(),
  };
}

/** The top bar's backup status: an icon with a status dot, and a menu of verbs. */
export function BackupControl() {
  const a = useBackupActions();
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

  if (a.status.kind === 'off') return null;
  const view = describe(a.status);
  const kind = a.status.kind;

  const items: { key: string; label: string; icon: ReactNode; run: () => void; visible: boolean }[] = [
    { key: 'now', label: 'Back up now', icon: Icon.backup, run: a.backUpNow, visible: kind === 'backed-up' },
    { key: 'check', label: 'Check again', icon: Icon.sync, run: a.checkAgain, visible: kind === 'unavailable' || kind === 'refused' },
    { key: 'use', label: 'Use the backup…', icon: Icon.backup, run: a.chooseBackup, visible: kind === 'conflict' },
    { key: 'keep', label: 'Keep this browser…', icon: Icon.check, run: a.chooseThisBrowser, visible: kind === 'conflict' },
    { key: 'export', label: 'Export JSON', icon: Icon.push, run: a.exportFile, visible: true },
    { key: 'import', label: 'Import JSON…', icon: Icon.copy, run: a.importFile, visible: true },
    { key: 'fresh', label: 'Start fresh…', icon: Icon.trash, run: a.startFresh, visible: kind !== 'detached' && kind !== 'conflict' },
    { key: 'attach', label: 'Re-attach to backup…', icon: Icon.link, run: a.reattach, visible: kind === 'detached' },
  ];
  const shown = items.filter((i) => i.visible);

  return (
    <div ref={ref} className={styles.anchor}>
      <span className={styles.trigger}>
        <IconButton icon={Icon.backup} onClick={() => setOpen((o) => !o)} title={`Backup: ${view.headline}`} active={open} />
        <span className={`${styles.dot} ${styles[view.tone]}`} aria-hidden />
      </span>
      {open && (
        <div className={chrome.settings} role="dialog" aria-label="Backup">
          <div className={styles.head}>
            <div className={`${styles.headline} ${styles[`${view.tone}Text`]}`}>{view.headline}</div>
            <div className={styles.detail}>{view.detail}</div>
          </div>
          <div className={chrome.settingsDivider} />
          <div className={chrome.settingsSection}>
            {shown.map((item, i) => (
              <button
                key={item.key}
                ref={i === 0 ? firstRef : undefined}
                className={chrome.paletteOption}
                onClick={() => {
                  setOpen(false);
                  item.run();
                }}
              >
                <span className={styles.itemIcon}>{item.icon}</span>
                <span className={styles.itemLabel}>{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {a.fileInput}
    </div>
  );
}

/**
 * Pinned to the bottom of the window while the backup needs a decision. A conflict
 * blocks every save until settled, and silently sitting in that state is how data
 * goes unprotected without anyone noticing — so it isn't dismissible.
 */
export function BackupBanner() {
  const a = useBackupActions();
  const [hidden, setHidden] = useState(false);
  const kind = a.status.kind;
  if (kind !== 'conflict' && kind !== 'refused') return null;
  if (kind === 'refused' && hidden) return null;
  const view = describe(a.status);

  return (
    <div className={styles.banner} role="alert">
      <span className={`${styles.bannerIcon} ${styles.alertText}`}>{Icon.alert}</span>
      <div className={styles.bannerBody}>
        <div className={styles.headline}>{view.headline}</div>
        <div className={styles.detail}>{view.detail}</div>
        <div className={styles.bannerActions}>
          {kind === 'conflict' ? (
            <>
              <PButton sm onClick={a.chooseBackup}>Use the backup…</PButton>
              <PButton sm variant="subtle" onClick={a.chooseThisBrowser}>Keep this browser…</PButton>
              <PButton sm variant="ghost" icon={Icon.push} onClick={a.exportFile}>Export JSON</PButton>
            </>
          ) : (
            <>
              <PButton sm variant="subtle" icon={Icon.sync} onClick={a.checkAgain}>Check again</PButton>
              <PButton sm variant="ghost" onClick={() => setHidden(true)}>Dismiss</PButton>
            </>
          )}
        </div>
      </div>
      {a.fileInput}
    </div>
  );
}
