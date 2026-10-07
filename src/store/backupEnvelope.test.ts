import { describe, expect, it } from 'vitest';
import { buildEnvelope, checkEnvelope, envelopeEntries } from './backupEnvelope';
import { LS_KEY } from './storage';
import { SCHEMA_VERSION } from '../types';

const entries = {
  [LS_KEY]: JSON.stringify({ version: SCHEMA_VERSION, releases: [] }),
  'release-tracker:theme': 'dusk',
  'release-tracker:col-widths': '{"build":140}',
};

describe('backup envelope', () => {
  it('parses the domain state so the file reads as JSON, and keeps prefs raw', () => {
    const env = buildEnvelope(entries, '2026-10-07T12:00:00.000Z');
    expect(env.state).toEqual({ version: SCHEMA_VERSION, releases: [] });
    expect(env.schemaVersion).toBe(SCHEMA_VERSION);
    expect(env.prefs).toEqual({ 'release-tracker:theme': 'dusk', 'release-tracker:col-widths': '{"build":140}' });
  });

  it('round-trips back to the same namespace entries', () => {
    const env = buildEnvelope(entries, '2026-10-07T12:00:00.000Z');
    const back = envelopeEntries(env);
    expect(back['release-tracker:theme']).toBe('dusk');
    expect(JSON.parse(back[LS_KEY])).toEqual(JSON.parse(entries[LS_KEY]));
  });

  it('accepts its own output, including an older schema', () => {
    expect(checkEnvelope(buildEnvelope(entries, '2026-10-07T12:00:00.000Z')).ok).toBe(true);
    const older = buildEnvelope({ [LS_KEY]: JSON.stringify({ version: 3 }) }, '2026-10-07T12:00:00.000Z');
    expect(checkEnvelope(older).ok).toBe(true);
  });

  it('refuses a backup written by a newer build', () => {
    const newer = buildEnvelope({ [LS_KEY]: JSON.stringify({ version: SCHEMA_VERSION + 1 }) }, '2026-10-07T12:00:00.000Z');
    expect(checkEnvelope(newer)).toEqual({ ok: false, reason: 'newer-schema', schemaVersion: SCHEMA_VERSION + 1 });
  });

  it.each([
    ['null', null],
    ['an array', []],
    ['another format', { format: 'something-else', formatVersion: 1, savedAt: '2026-10-07T12:00:00.000Z', state: {} }],
    ['a future format version', { format: 'release-tracker-backup', formatVersion: 99, savedAt: '2026-10-07T12:00:00.000Z', state: {} }],
    ['a bad savedAt', { format: 'release-tracker-backup', formatVersion: 1, savedAt: 'soon', state: {} }],
    ['non-string prefs', { format: 'release-tracker-backup', formatVersion: 1, savedAt: '2026-10-07T12:00:00.000Z', state: {}, prefs: { a: 1 } }],
  ])('rejects %s', (_label, value) => {
    expect(checkEnvelope(value)).toEqual({ ok: false, reason: 'not-a-backup' });
  });
});
