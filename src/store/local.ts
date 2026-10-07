// The app's one door to localStorage. Every persisted value — the domain blob,
// each UI preference, column widths, the summary library — is read and written
// through here, for two reasons:
//
//   1. Guarding. localStorage throws in private-mode Safari, under some embedded
//      webviews and on quota; a value failing to persist must never take the app
//      down. That try/catch used to be repeated at every call site.
//   2. Durability. The backup (docs/backup.md) mirrors the whole `release-tracker:*`
//      namespace. It can only do that if it hears about every change and can tell
//      how fresh this browser's copy is — which only works when there is one writer.
//
// A write stamps `release-tracker:savedAt`. That stamp is what a restore compares
// against, so it must mean "the user changed something", not "the app touched
// storage". Writes the app makes on its own behalf — writing back the seed on a
// first run, or a migrated blob on load — pass `{ quiet: true }`. Get this wrong
// and a freshly wiped browser, booting on demo data, looks newer than the real
// backup and overwrites it.

import { kb, logInfo, logWarn } from './log';

/** Every key the app owns starts with this; nothing else is backed up. */
export const NAMESPACE = 'release-tracker:';

/**
 * Keys about this browser rather than the user's data: when it last changed, which
 * backup revision it last agreed with, whether it opted out. They are never backed
 * up and a restore leaves them alone — copying them to another browser would make
 * it believe it had history it doesn't.
 */
export const DEVICE_PREFIX = `${NAMESPACE}device:`;

/** When the user last changed anything persisted. Absent = never (or wiped). */
export const SAVED_AT_KEY = `${DEVICE_PREFIX}savedAt`;

const isData = (key: string) => key.startsWith(NAMESPACE) && !key.startsWith(DEVICE_PREFIX);

export interface WriteOptions {
  /** An app-initiated write that isn't a user change: no stamp, no notification.
   *  Device keys (and keys outside the namespace) are always treated as quiet. */
  quiet?: boolean;
}

type Listener = (key: string) => void;
const listeners = new Set<Listener>();

/** The stored string at `key`, or null when absent or storage is unavailable. */
export function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Store `value` at `key`. Returns false when storage refused it (quota, private
 *  mode) — callers treat that as "applies for this session only". */
export function writeLocal(key: string, value: string, opts: WriteOptions = {}): boolean {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    // Logged on the transition only — a full quota would otherwise warn on every edit.
    if (!refusing) logWarn('storage', `this browser refused to save ${key} (${kb(value.length)}) — changes apply until reload only`, e);
    refusing = true;
    return false;
  }
  if (refusing) logInfo('storage', 'this browser is accepting saves again');
  refusing = false;
  if (!opts.quiet && isData(key)) changed(key);
  return true;
}

/** Whether the last write was refused, so the warning fires once per episode. */
let refusing = false;

/** Remove `key`. Removing an absent key is not a change, so it neither stamps nor
 *  notifies — load() clears a retired key on every boot. */
export function removeLocal(key: string, opts: WriteOptions = {}): void {
  try {
    if (localStorage.getItem(key) === null) return;
    localStorage.removeItem(key);
  } catch {
    return;
  }
  if (!opts.quiet && isData(key)) changed(key);
}

/** Subscribe to user changes anywhere in the namespace; returns an unsubscribe. */
export function onLocalChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** When the user last changed this browser's copy, or null if they never have. */
export function localSavedAt(): string | null {
  return readLocal(SAVED_AT_KEY);
}

/** Every app-owned data key and its raw value — device keys excluded. */
export function snapshotNamespace(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key === null || !isData(key)) continue;
      const value = localStorage.getItem(key);
      if (value !== null) out[key] = value;
    }
  } catch {
    /* storage unavailable — an empty snapshot */
  }
  return out;
}

/**
 * Replace the namespace's data keys with `entries`, stamped `savedAt`. Data keys the
 * snapshot doesn't carry are removed, so a restore is exact rather than a merge;
 * device keys and keys outside the namespace are left alone.
 *
 * Deliberately silent: the caller reloads straight after, and every store re-reads
 * its key exactly as on a normal boot. Notifying would echo the restored data
 * straight back to the backup it just came from.
 */
export function restoreNamespace(entries: Record<string, string>, savedAt: string): void {
  try {
    const stale: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key !== null && isData(key) && !(key in entries)) stale.push(key);
    }
    stale.forEach((key) => localStorage.removeItem(key));
    for (const [key, value] of Object.entries(entries)) {
      if (isData(key)) localStorage.setItem(key, value);
    }
    localStorage.setItem(SAVED_AT_KEY, savedAt);
  } catch {
    /* storage unavailable — nothing restorable */
  }
}

function changed(key: string) {
  try {
    // Strictly increasing, even within one millisecond (or a frozen test clock): the
    // backup decides "changed since we last agreed" by stamp inequality, and two
    // changes sharing a stamp would make the second invisible.
    const prev = Date.parse(localStorage.getItem(SAVED_AT_KEY) ?? '');
    const now = Date.now();
    const next = Number.isNaN(prev) || now > prev ? now : prev + 1;
    localStorage.setItem(SAVED_AT_KEY, new Date(next).toISOString());
  } catch {
    /* the value landed; only the stamp didn't — the next change retries it */
  }
  listeners.forEach((l) => l(key));
}
