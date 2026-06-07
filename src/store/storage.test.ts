// @vitest-environment jsdom
//
// True storage-layer tests. Unlike migrate.test.ts (which exercises the pure
// `migrate()` function), these run in jsdom so `load()`/`persist()` hit a real
// localStorage — covering the full round-trip: serialize → store → parse →
// version-check → migrate → return, plus the corrupt-data and quota catch paths.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LS_KEY, load, persist } from './store';
import { seed } from '../lib/seed';
import { SCHEMA_VERSION, type AppState } from '../types';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('persist', () => {
  it('writes the state under LS_KEY as JSON', () => {
    const state = seed();
    persist(state);
    const raw = localStorage.getItem(LS_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!)).toEqual(state);
  });

  it('overwrites any previous value at the key', () => {
    persist(seed());
    const next: AppState = { version: SCHEMA_VERSION, teams: [], releases: [], items: [], meta: { lastSyncISO: '2026-06-07' } };
    persist(next);
    expect(JSON.parse(localStorage.getItem(LS_KEY)!)).toEqual(next);
  });

  it('swallows storage errors (e.g. quota exceeded) without throwing', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });
    expect(() => persist(seed())).not.toThrow();
    expect(spy).toHaveBeenCalled();
  });
});

describe('load', () => {
  it('round-trips persisted state with full fidelity', () => {
    const original = seed();
    persist(original);
    expect(load()).toEqual(original);
  });

  it('returns fresh seed data when localStorage is empty', () => {
    const loaded = load();
    expect(loaded.version).toBe(SCHEMA_VERSION);
    // Seed populates demo content, so this is not an empty store.
    expect(loaded.releases.length).toBeGreaterThan(0);
  });

  it('returns seed data when the stored JSON is corrupt', () => {
    localStorage.setItem(LS_KEY, '{ not valid json ]');
    const loaded = load();
    expect(loaded.version).toBe(SCHEMA_VERSION);
    expect(loaded.releases.length).toBeGreaterThan(0);
  });

  it('returns a current-version payload as-is (no migration)', () => {
    const current: AppState = { version: SCHEMA_VERSION, teams: [], releases: [], items: [], meta: { lastSyncISO: null } };
    localStorage.setItem(LS_KEY, JSON.stringify(current));
    expect(load()).toEqual(current);
  });

  it('migrates an old-version payload up to the current schema', () => {
    // A v1 payload: releases lack connector/sync; items lack later fields.
    const v1 = {
      version: 1,
      teams: [],
      releases: [{ id: 'r1', name: 'Orion 2.0', startISO: '2026-04-13', teamId: 't1', workStreams: [], events: [], sprints: [], externalId: null }],
      items: [],
      meta: { lastSyncISO: null },
    };
    localStorage.setItem(LS_KEY, JSON.stringify(v1));
    const loaded = load();
    expect(loaded.version).toBe(SCHEMA_VERSION);
    expect(loaded.releases[0].connector).toBeNull();
    expect(loaded.releases[0].sync).toBeNull();
    // The original release identity survives the migration (not reseeded).
    expect(loaded.releases[0].id).toBe('r1');
  });

  it('falls back to seed when the stored version is unknown/unmigratable', () => {
    const unknown = { version: 999, teams: [], releases: [], items: [], meta: { lastSyncISO: null } };
    localStorage.setItem(LS_KEY, JSON.stringify(unknown));
    const loaded = load();
    expect(loaded.version).toBe(SCHEMA_VERSION);
    // Did not adopt the unmigratable payload (which had no releases by design);
    // seed restores demo content instead.
    expect(loaded.releases.length).toBeGreaterThan(0);
  });

  it('survives a persist → load → persist → load cycle without drift', () => {
    const a = load();        // seed (empty start)
    persist(a);
    const b = load();
    persist(b);
    const c = load();
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });
});
