// Export / Import JSON: the manual backup. Same envelope as the work-truck backup,
// so an export is a valid backup and a file copied out of ~/.work-truck/backup
// imports as-is. This is what protects someone who doesn't run work-truck.

import type { BackupEnvelope } from '@release-tracker/sync-contract';
import { EPOCH, buildEnvelope, checkEnvelope, envelopeEntries, type EnvelopeCheck } from './backupEnvelope';
import { localSavedAt, restoreNamespace, snapshotNamespace } from './local';
import { logInfo } from './log';

/** This browser's whole data namespace as an envelope, ready to save to a file. */
export function exportEnvelope(): BackupEnvelope {
  return buildEnvelope(snapshotNamespace(), localSavedAt() ?? EPOCH);
}

/** `release-tracker-backup-2026-10-07.json`, in the reader's local date. */
export function backupFileName(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `release-tracker-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

/** Validate a file's text as a backup. */
export function parseBackupFile(text: string): EnvelopeCheck {
  try {
    return checkEnvelope(JSON.parse(text));
  } catch {
    return { ok: false, reason: 'not-a-backup' };
  }
}

/**
 * Replace this browser's data with an imported backup. The caller reloads.
 *
 * Stamped now rather than with the file's own savedAt: importing is a change the
 * user made here, so the work-truck backup must treat it as one and save it — even
 * when the file is older than what the backup holds. Restoring is silent (see
 * local.ts), so it's the reload's reconcile that picks it up.
 */
export function applyImport(env: BackupEnvelope): void {
  const entries = envelopeEntries(env);
  restoreNamespace(entries, new Date().toISOString());
  logInfo('storage', `imported a backup file (${Object.keys(entries).length} keys, last changed ${env.savedAt}) — reloading`);
}
