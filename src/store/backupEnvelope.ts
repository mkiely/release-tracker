// The backup's file format: the app's whole data namespace, with the domain state
// parsed so the file reads (and diffs) as JSON rather than one escaped string.
// Shared by the work-truck backup and Export/Import JSON, so a manual export is a
// valid backup and vice versa.

import type { BackupEnvelope } from '@release-tracker/sync-contract';
import { SCHEMA_VERSION } from '../types';
import { LS_KEY } from './storage';

export const BACKUP_FORMAT = 'release-tracker-backup';
export const BACKUP_FORMAT_VERSION = 1;

/** The stamp a never-changed browser backs up under. Sorts before any real change. */
export const EPOCH = new Date(0).toISOString();

/** Wrap a namespace snapshot (see local.ts) as an envelope. */
export function buildEnvelope(entries: Record<string, string>, savedAt: string): BackupEnvelope {
  const { [LS_KEY]: rawState, ...prefs } = entries;
  let state: Record<string, unknown> = {};
  try {
    if (rawState) state = JSON.parse(rawState) as Record<string, unknown>;
  } catch {
    /* corrupt domain blob — back up the prefs regardless */
  }
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    savedAt,
    schemaVersion: typeof state.version === 'number' ? state.version : undefined,
    state,
    prefs,
  };
}

/** Unwrap an envelope back into namespace entries, ready for restoreNamespace(). */
export function envelopeEntries(env: BackupEnvelope): Record<string, string> {
  return { ...(env.prefs ?? {}), [LS_KEY]: JSON.stringify(env.state) };
}

export type EnvelopeCheck =
  | { ok: true; envelope: BackupEnvelope }
  | { ok: false; reason: 'not-a-backup' }
  /** Written by a newer build. Restoring would hand load() a schema it can't read
   *  (it falls back to seed), and overwriting would destroy the newer data. */
  | { ok: false; reason: 'newer-schema'; schemaVersion: number };

/** Validate untrusted JSON (a server response, an imported file) as an envelope. */
export function checkEnvelope(value: unknown): EnvelopeCheck {
  if (!isRecord(value)) return { ok: false, reason: 'not-a-backup' };
  if (value.format !== BACKUP_FORMAT) return { ok: false, reason: 'not-a-backup' };
  if (typeof value.formatVersion !== 'number' || value.formatVersion > BACKUP_FORMAT_VERSION) {
    return { ok: false, reason: 'not-a-backup' };
  }
  if (typeof value.savedAt !== 'string' || Number.isNaN(Date.parse(value.savedAt))) {
    return { ok: false, reason: 'not-a-backup' };
  }
  if (!isRecord(value.state)) return { ok: false, reason: 'not-a-backup' };
  if (value.prefs !== undefined) {
    if (!isRecord(value.prefs) || Object.values(value.prefs).some((v) => typeof v !== 'string')) {
      return { ok: false, reason: 'not-a-backup' };
    }
  }
  const schemaVersion = typeof value.state.version === 'number' ? value.state.version : 0;
  if (schemaVersion > SCHEMA_VERSION) return { ok: false, reason: 'newer-schema', schemaVersion };
  return { ok: true, envelope: value as unknown as BackupEnvelope };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
