// The durable backup: keeps a copy of the app's whole data namespace in work-truck,
// so clearing the browser loses nothing. docs/backup.md has the full argument.
//
// The app owns the data and localStorage stays the working copy; this only mirrors
// it. Backup is NOT push — nothing here talks to a connector, and a restore brings
// unpushed edits back still unpushed.
//
// ── Who wins ─────────────────────────────────────────────────────────────────
// Timestamps alone can't detect a real conflict (one port edits offline while another
// writes a newer backup — newest-wins silently drops the offline edits). So each
// browser remembers, in device keys, the backup revision it last agreed with and the
// local stamp at that moment. Reconcile is then a three-way decision:
//
//   changed here?  backup changed?   →
//   no             no                   nothing
//   yes            no                   save
//   no             yes                  restore (automatic — this is the post-wipe case)
//   yes            yes                  conflict: the user chooses
//
// A wiped browser has no stamp and no remembered revision, so it restores without
// asking. Data that predates stamps is stamped on load (storage.ts) so it reads as
// "changed here" and can never be silently replaced.
//
// ── Never write before reading ───────────────────────────────────────────────
// Writes are only possible once reconcile has read the backup's meta and decided.
// A browser that boots on demo data after a wipe would otherwise replace the real
// backup with the demo.

import { useSyncExternalStore } from 'react';
import type { BackupMeta } from '@release-tracker/sync-contract';
import { BackupUnavailableError, type BackupClient } from './backupClient';
import { EPOCH, buildEnvelope, checkEnvelope, envelopeEntries } from './backupEnvelope';
import { kb, logInfo, logWarn } from './log';
import {
  DEVICE_PREFIX,
  localSavedAt,
  onLocalChange,
  readLocal,
  removeLocal,
  restoreNamespace,
  snapshotNamespace,
  writeLocal,
} from './local';

/** The backup revision this browser last saved or restored. */
const REV_KEY = `${DEVICE_PREFIX}backupRev`;
/** This browser's savedAt at that moment; a later stamp means "changed here". */
const BASE_SAVED_AT_KEY = `${DEVICE_PREFIX}backupSavedAt`;
/** Set by "Start fresh": this browser neither restores from nor writes to the backup. */
const DETACHED_KEY = `${DEVICE_PREFIX}backupDetached`;
/** When this browser last restored. Pull before push after this (see applySync). */
const RESTORED_AT_KEY = `${DEVICE_PREFIX}restoredAt`;

export type BackupStatus =
  | { kind: 'off' }
  | { kind: 'checking' }
  | { kind: 'unavailable'; message: string }
  | { kind: 'saving'; meta: BackupMeta | null }
  | { kind: 'backed-up'; meta: BackupMeta }
  | { kind: 'restoring' }
  | { kind: 'conflict'; current: BackupMeta | null }
  | { kind: 'refused'; reason: 'newer-schema' | 'unreadable'; schemaVersion?: number }
  | { kind: 'detached' };

export interface BackupControllerDeps {
  client: BackupClient;
  /** Reload the page so every store re-reads the restored namespace. */
  reload(): void;
  /** Quiet period after the last change before saving. */
  debounceMs?: number;
  /** Longest a run of changes can postpone a save. */
  maxWaitMs?: number;
  /** How soon to look for work-truck again after it was unreachable. Doubles on each
   *  consecutive miss, up to maxRetryMs: someone not running work-truck shouldn't get
   *  a connection error in their console every half minute, forever. */
  retryMs?: number;
  maxRetryMs?: number;
}

export interface BackupController {
  /** Subscribe to changes and run the first reconcile. Idempotent. */
  start(): void;
  stop(): void;
  getStatus(): BackupStatus;
  subscribe(listener: () => void): () => void;
  /** Save now, skipping the debounce — after a pull or push, and "Back up now".
   *  `reason` only labels the console line. */
  flushNow(reason?: string): Promise<void>;
  /** Look for work-truck now rather than waiting for the retry. */
  retry(): Promise<void>;
  /** Settle a conflict: take the backup (reloads), or overwrite it with this browser. */
  resolveConflict(choice: 'use-backup' | 'keep-this-browser'): Promise<void>;
  /** "Start fresh": stop restoring from and writing to the backup in this browser. */
  detach(): void;
  /** Rejoin the backup. Treated as a first meeting, so real local data can't be lost. */
  attach(): Promise<void>;
  /** When this browser last restored, if it has. */
  restoredAt(): string | null;
}

interface WriteOpts {
  keepalive?: boolean;
  /** Why this save happened, for the console. */
  reason?: string;
}

export function createBackupController(deps: BackupControllerDeps): BackupController {
  const { client, reload, debounceMs = 1000, maxWaitMs = 5000, retryMs = 30_000, maxRetryMs = 600_000 } = deps;
  let nextRetryMs = retryMs;

  let status: BackupStatus = { kind: 'off' };
  const listeners = new Set<() => void>();
  let started = false;
  let unsubscribeLocal: (() => void) | null = null;

  /** True only between a successful reconcile and the next conflict/outage. */
  let connected = false;
  let rev: number | null = null;
  let lastMeta: BackupMeta | null = null;

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let firstQueuedAt: number | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<void> | null = null;
  let again = false;
  let reconciling: Promise<void> | null = null;
  /** Last known reachability, so the console hears about changes, not every retry. */
  let reachable: boolean | null = null;

  const setStatus = (next: BackupStatus) => {
    status = next;
    listeners.forEach((l) => l());
  };

  const isDetached = () => readLocal(DETACHED_KEY) === '1';

  const rememberedRev = (): number | null => {
    const n = Number(readLocal(REV_KEY));
    return Number.isInteger(n) && n > 0 ? n : null;
  };

  const changedHere = (): boolean => {
    const savedAt = localSavedAt();
    return savedAt !== null && savedAt !== readLocal(BASE_SAVED_AT_KEY);
  };

  const remember = (r: number, savedAt: string) => {
    writeLocal(REV_KEY, String(r));
    writeLocal(BASE_SAVED_AT_KEY, savedAt);
  };

  const unavailable = (e: unknown) => {
    connected = false;
    const message = e instanceof Error ? e.message : String(e);
    setStatus({ kind: 'unavailable', message });
    if (!(e instanceof BackupUnavailableError)) console.error('[backup]', e);
    // Logged when it stops being reachable, not on every retry.
    if (reachable !== false) {
      logInfo('backup', `${message} — your data is saved in this browser only until it's back`);
    }
    reachable = false;
    if (started && !retryTimer) {
      retryTimer = setTimeout(() => {
        retryTimer = null;
        void reconcile();
      }, nextRetryMs);
      nextRetryMs = Math.min(nextRetryMs * 2, maxRetryMs);
    }
  };

  const clearDebounce = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = null;
    firstQueuedAt = null;
  };

  // ── Reconcile ──────────────────────────────────────────────────────────────

  function reconcile(): Promise<void> {
    reconciling ??= reconcileOnce().finally(() => {
      reconciling = null;
    });
    return reconciling;
  }

  async function reconcileOnce(): Promise<void> {
    if (isDetached()) {
      connected = false;
      logInfo('backup', 'this browser is detached (Start fresh) — not restoring from or saving to the backup');
      setStatus({ kind: 'detached' });
      return;
    }
    connected = false;
    setStatus({ kind: 'checking' });

    let meta: BackupMeta | null;
    try {
      meta = await client.meta();
    } catch (e) {
      unavailable(e);
      return;
    }
    if (reachable === false) logInfo('backup', 'work-truck is reachable again');
    reachable = true;
    lastMeta = meta;
    nextRetryMs = retryMs;

    if (!meta) {
      // Nothing stored yet (or it was deleted by hand): this browser seeds it.
      logInfo('backup', 'no backup exists yet — creating one from this browser');
      rev = null;
      connected = true;
      await writeQueued({ reason: 'first backup' });
      return;
    }

    const known = rememberedRev();
    const backupChanged = meta.rev !== known;
    const here = changedHere();
    if (!backupChanged) {
      rev = meta.rev;
      connected = true;
      if (here) {
        logInfo('backup', `backup is at rev ${meta.rev}; this browser has changes it doesn't — saving them`);
        await writeQueued({ reason: 'changes the backup didn\'t have yet' });
      } else {
        logInfo('backup', `backup is current (rev ${meta.rev}, ${kb(meta.size)}, last changed ${meta.savedAt})`);
        setStatus({ kind: 'backed-up', meta });
      }
      return;
    }
    if (!here) {
      logInfo(
        'backup',
        known === null
          ? `this browser has no saved changes and the backup holds rev ${meta.rev} (last changed ${meta.savedAt}) — restoring`
          : `the backup moved on from rev ${known} to rev ${meta.rev} elsewhere and this browser has no changes — restoring`,
      );
      await restore();
      return;
    }
    logWarn(
      'backup',
      known === null
        ? `this browser has its own data and a backup already exists (rev ${meta.rev}, last changed ${meta.savedAt}) — waiting for you to choose which to keep`
        : `both this browser and the backup changed since rev ${known} (backup is now rev ${meta.rev}) — waiting for you to choose which to keep`,
    );
    setStatus({ kind: 'conflict', current: meta });
  }

  async function restore(): Promise<void> {
    connected = false;
    clearDebounce();
    setStatus({ kind: 'restoring' });

    let got: { rev: number; body: unknown } | null;
    try {
      got = await client.get();
    } catch (e) {
      unavailable(e);
      return;
    }
    if (!got) {
      // Deleted between meta and get — start over.
      await reconcileOnce();
      return;
    }
    const checked = checkEnvelope(got.body);
    if (!checked.ok) {
      // Neither restore nor overwrite: a newer build's backup is the user's newest
      // data, and an unreadable one may be recoverable by hand from history/.
      if (checked.reason === 'newer-schema') {
        logWarn('backup', `backup rev ${got.rev} was written by a newer version (schema v${checked.schemaVersion}) — not restoring it, and not overwriting it`);
        setStatus({ kind: 'refused', reason: 'newer-schema', schemaVersion: checked.schemaVersion });
      } else {
        logWarn('backup', `backup rev ${got.rev} isn't a readable backup — not restoring it, and not overwriting it`);
        setStatus({ kind: 'refused', reason: 'unreadable' });
      }
      return;
    }
    const env = checked.envelope;
    const entries = envelopeEntries(env);
    restoreNamespace(entries, env.savedAt);
    remember(got.rev, env.savedAt);
    writeLocal(RESTORED_AT_KEY, new Date().toISOString());
    logInfo('backup', `restored rev ${got.rev} (${Object.keys(entries).length} keys, last changed ${env.savedAt}) — reloading`);
    reload();
  }

  // ── Writes ─────────────────────────────────────────────────────────────────

  function schedule() {
    if (!connected) return; // reconcile compares stamps when it connects
    const now = Date.now();
    firstQueuedAt ??= now;
    const wait = Math.max(0, Math.min(debounceMs, maxWaitMs - (now - firstQueuedAt)));
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      clearDebounce();
      void writeQueued();
    }, wait);
  }

  /** One write in flight at a time; anything arriving meanwhile becomes one more. */
  function writeQueued(opts: WriteOpts = {}): Promise<void> {
    if (!connected) return Promise.resolve();
    if (inFlight) {
      again = true;
      return inFlight;
    }
    inFlight = (async () => {
      do {
        again = false;
        await writeOnce(opts);
      } while (again && connected);
    })().finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  async function writeOnce(opts: WriteOpts): Promise<void> {
    const savedAt = localSavedAt() ?? EPOCH;
    const body = JSON.stringify(buildEnvelope(snapshotNamespace(), savedAt));
    setStatus({ kind: 'saving', meta: lastMeta });

    const startedAt = performance.now();
    let res;
    try {
      res = await client.put(body, rev, { keepalive: opts.keepalive });
    } catch (e) {
      unavailable(e);
      return;
    }
    if (!res.ok) {
      // Someone else wrote since we last agreed. Stop: never last-write-wins.
      connected = false;
      clearDebounce();
      lastMeta = res.current;
      logWarn(
        'backup',
        `save refused: the backup changed elsewhere (expected rev ${rev ?? 'none'}, it is now rev ${res.current?.rev ?? 'none'}) — no further saves until you choose which to keep`,
      );
      setStatus({ kind: 'conflict', current: res.current });
      return;
    }
    rev = res.meta.rev;
    lastMeta = res.meta;
    remember(res.meta.rev, savedAt);
    const ms = Math.round(performance.now() - startedAt);
    logInfo('backup', `saved rev ${res.meta.rev} (${kb(res.meta.size)}, ${ms} ms${opts.reason ? `, ${opts.reason}` : ''})`);
    setStatus({ kind: 'backed-up', meta: res.meta });
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  const onFocus = () => {
    if (status.kind !== 'unavailable') return;
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
    void reconcile();
  };
  const onHide = () => {
    // Best effort only: localStorage holds the tail, and the next boot saves it.
    if (document.visibilityState === 'hidden' && debounceTimer) {
      clearDebounce();
      void writeQueued({ keepalive: true, reason: 'tab hidden' });
    }
  };

  return {
    start() {
      if (started) return;
      started = true;
      unsubscribeLocal = onLocalChange(schedule);
      if (typeof window !== 'undefined') {
        window.addEventListener('focus', onFocus);
        window.addEventListener('online', onFocus);
        document.addEventListener('visibilitychange', onHide);
      }
      void reconcile();
    },

    stop() {
      started = false;
      connected = false;
      unsubscribeLocal?.();
      unsubscribeLocal = null;
      clearDebounce();
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', onFocus);
        window.removeEventListener('online', onFocus);
        document.removeEventListener('visibilitychange', onHide);
      }
      setStatus({ kind: 'off' });
    },

    getStatus: () => status,

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    flushNow(reason) {
      clearDebounce();
      return writeQueued({ reason });
    },

    retry: () => reconcile(),

    async resolveConflict(choice) {
      if (status.kind !== 'conflict') return;
      if (choice === 'use-backup') {
        logInfo('backup', 'conflict settled: using the backup, discarding this browser\'s changes');
        await restore();
        return;
      }
      // Adopt the backup's current revision as the one we replace — deliberately.
      let meta: BackupMeta | null;
      try {
        meta = await client.meta();
      } catch (e) {
        unavailable(e);
        return;
      }
      logInfo('backup', `conflict settled: keeping this browser, replacing backup rev ${meta?.rev ?? 'none'}`);
      rev = meta?.rev ?? null;
      lastMeta = meta;
      connected = true;
      await writeQueued({ reason: 'kept this browser over the backup' });
    },

    detach() {
      writeLocal(DETACHED_KEY, '1');
      connected = false;
      clearDebounce();
      logInfo('backup', 'detached this browser (Start fresh) — the backup is left as it was');
      setStatus({ kind: 'detached' });
    },

    async attach() {
      logInfo('backup', 're-attaching this browser to the backup');
      removeLocal(DETACHED_KEY);
      // Forget the old agreement: a detached browser has diverged, so meeting the
      // backup again must be a three-way decision from scratch.
      removeLocal(REV_KEY);
      removeLocal(BASE_SAVED_AT_KEY);
      await reconcile();
    },

    restoredAt: () => readLocal(RESTORED_AT_KEY),
  };
}

// ── The app's instance ─────────────────────────────────────────────────────────

let instance: BackupController | null = null;

/** Install the app-wide controller (main.tsx). Tests build their own instead. */
export function installBackup(controller: BackupController): BackupController {
  instance = controller;
  return controller;
}

/** The app-wide controller, or null where none runs (tests, the summary viewer). */
export function getBackup(): BackupController | null {
  return instance;
}

const OFF: BackupStatus = { kind: 'off' };
const noop = () => () => {};

/** React binding: the current backup status, re-rendering on change. */
export function useBackupStatus(): BackupStatus {
  return useSyncExternalStore(
    instance ? instance.subscribe : noop,
    instance ? instance.getStatus : () => OFF,
  );
}
