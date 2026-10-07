// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { applyImport, backupFileName, exportEnvelope, parseBackupFile } from './backupFile';
import { localSavedAt, readLocal, writeLocal } from './local';
import { LS_KEY } from './storage';
import { SCHEMA_VERSION } from '../types';

const domain = (name: string) => JSON.stringify({ version: SCHEMA_VERSION, releases: [{ name }] });

beforeEach(() => localStorage.clear());

describe('export / import', () => {
  it('round-trips the whole namespace through a file', () => {
    writeLocal(LS_KEY, domain('mine'));
    writeLocal('release-tracker:theme', 'dusk');
    const text = JSON.stringify(exportEnvelope());

    localStorage.clear();
    const parsed = parseBackupFile(text);
    if (!parsed.ok) throw new Error('expected a valid backup');
    applyImport(parsed.envelope);

    expect(JSON.parse(readLocal(LS_KEY)!)).toEqual(JSON.parse(domain('mine')));
    expect(readLocal('release-tracker:theme')).toBe('dusk');
  });

  it('device keys never travel in an export', () => {
    writeLocal(LS_KEY, domain('mine'));
    localStorage.setItem('release-tracker:device:backupRev', '9');
    expect(JSON.stringify(exportEnvelope())).not.toContain('device:');
  });

  it('an import counts as a change here, so the work-truck backup will save it', () => {
    writeLocal(LS_KEY, domain('mine'));
    const parsed = parseBackupFile(JSON.stringify({ ...exportEnvelope(), savedAt: '2020-01-01T00:00:00.000Z' }));
    if (!parsed.ok) throw new Error('expected a valid backup');
    applyImport(parsed.envelope);
    // Stamped now, not with the (old) file date.
    expect(localSavedAt()! > '2020-01-01T00:00:00.000Z').toBe(true);
  });

  it('rejects files that are not backups, and backups from a newer version', () => {
    expect(parseBackupFile('not json')).toEqual({ ok: false, reason: 'not-a-backup' });
    expect(parseBackupFile('{"hello":1}')).toEqual({ ok: false, reason: 'not-a-backup' });
    writeLocal(LS_KEY, JSON.stringify({ version: SCHEMA_VERSION + 1 }));
    expect(parseBackupFile(JSON.stringify(exportEnvelope()))).toMatchObject({ ok: false, reason: 'newer-schema' });
  });

  it('names the file by local date', () => {
    expect(backupFileName(new Date(2026, 9, 7, 23, 30))).toBe('release-tracker-backup-2026-10-07.json');
  });
});
