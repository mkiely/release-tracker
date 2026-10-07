// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SAVED_AT_KEY,
  localSavedAt,
  onLocalChange,
  readLocal,
  removeLocal,
  restoreNamespace,
  snapshotNamespace,
  writeLocal,
} from './local';

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('writeLocal', () => {
  it('stores the value and stamps savedAt', () => {
    expect(writeLocal('release-tracker:theme', 'dark')).toBe(true);
    expect(readLocal('release-tracker:theme')).toBe('dark');
    expect(localSavedAt()).not.toBeNull();
  });

  it('stamps strictly increase, even within one millisecond', () => {
    vi.useFakeTimers({ now: new Date('2026-10-07T12:00:00.000Z'), toFake: ['Date'] });
    writeLocal('release-tracker:a', '1');
    const first = localSavedAt()!;
    writeLocal('release-tracker:a', '2');
    expect(localSavedAt()! > first).toBe(true);
    vi.useRealTimers();
  });

  it('notifies listeners with the changed key until they unsubscribe', () => {
    const seen: string[] = [];
    const unsub = onLocalChange((k) => seen.push(k));
    writeLocal('release-tracker:a', '1');
    unsub();
    writeLocal('release-tracker:b', '2');
    expect(seen).toEqual(['release-tracker:a']);
  });

  it('a quiet write neither stamps nor notifies', () => {
    // The first-run seed is written this way. Stamping it would make a wiped
    // browser look newer than the real backup.
    const listener = vi.fn();
    onLocalChange(listener);
    writeLocal('release-tracker:v1', '{}', { quiet: true });
    expect(readLocal('release-tracker:v1')).toBe('{}');
    expect(localSavedAt()).toBeNull();
    expect(listener).not.toHaveBeenCalled();
  });

  it('a device key is never a user change', () => {
    // Recording the backup revision must not itself trigger another backup.
    const listener = vi.fn();
    onLocalChange(listener);
    writeLocal('release-tracker:device:backupRev', '4');
    expect(listener).not.toHaveBeenCalled();
    expect(localSavedAt()).toBeNull();
  });

  it('reports a refused write without stamping, notifying or throwing', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });
    const listener = vi.fn();
    onLocalChange(listener);
    expect(writeLocal('release-tracker:a', '1')).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('readLocal', () => {
  it('returns null rather than throwing when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(readLocal('release-tracker:a')).toBeNull();
  });
});

describe('removeLocal', () => {
  it('removes a present key as a change', () => {
    localStorage.setItem('release-tracker:a', '1');
    const listener = vi.fn();
    onLocalChange(listener);
    removeLocal('release-tracker:a');
    expect(readLocal('release-tracker:a')).toBeNull();
    expect(listener).toHaveBeenCalledWith('release-tracker:a');
    expect(localSavedAt()).not.toBeNull();
  });

  it('removing an absent key is not a change', () => {
    const listener = vi.fn();
    onLocalChange(listener);
    removeLocal('release-tracker:never-set');
    expect(listener).not.toHaveBeenCalled();
    expect(localSavedAt()).toBeNull();
  });
});

describe('snapshotNamespace', () => {
  it('captures every data key — not device keys, nothing outside the namespace', () => {
    writeLocal('release-tracker:v1', '{"version":31}');
    writeLocal('release-tracker:theme', 'dusk');
    localStorage.setItem('release-tracker:device:backupRev', '3');
    localStorage.setItem('someone-else', 'x');
    expect(snapshotNamespace()).toEqual({
      'release-tracker:v1': '{"version":31}',
      'release-tracker:theme': 'dusk',
    });
  });
});

describe('restoreNamespace', () => {
  it('replaces the namespace exactly and adopts the backup stamp', () => {
    localStorage.setItem('release-tracker:theme', 'light');
    localStorage.setItem('release-tracker:only-here', 'stale');
    localStorage.setItem('someone-else', 'kept');

    restoreNamespace({ 'release-tracker:theme': 'dusk', 'release-tracker:v1': '{}' }, '2026-10-01T00:00:00.000Z');

    expect(readLocal('release-tracker:theme')).toBe('dusk');
    expect(readLocal('release-tracker:v1')).toBe('{}');
    // A restore is exact, not a merge…
    expect(readLocal('release-tracker:only-here')).toBeNull();
    // …but only within the namespace.
    expect(readLocal('someone-else')).toBe('kept');
    expect(localSavedAt()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('is silent, so a restore never echoes back to the backup', () => {
    const listener = vi.fn();
    onLocalChange(listener);
    restoreNamespace({ 'release-tracker:theme': 'dusk' }, '2026-10-01T00:00:00.000Z');
    expect(listener).not.toHaveBeenCalled();
  });

  it('leaves device keys alone — they describe this browser, not the data', () => {
    localStorage.setItem('release-tracker:device:backupRev', '7');
    restoreNamespace({ 'release-tracker:theme': 'dusk' }, '2026-10-01T00:00:00.000Z');
    expect(readLocal('release-tracker:device:backupRev')).toBe('7');
  });

  it('ignores keys outside the namespace and a smuggled device key', () => {
    restoreNamespace(
      { 'release-tracker:theme': 'dusk', 'not-ours': 'x', [SAVED_AT_KEY]: '1999-01-01T00:00:00.000Z' },
      '2026-10-01T00:00:00.000Z',
    );
    expect(readLocal('not-ours')).toBeNull();
    expect(localSavedAt()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('round-trips with snapshotNamespace', () => {
    writeLocal('release-tracker:v1', '{"a":1}');
    writeLocal('release-tracker:col-widths', '{"build":140}');
    const snap = snapshotNamespace();
    localStorage.clear();
    restoreNamespace(snap, '2026-10-01T00:00:00.000Z');
    expect(snapshotNamespace()).toEqual(snap);
  });
});
