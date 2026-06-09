// Drift guard for src/schema.json — the hand-maintained, machine-readable schema
// doc for adapter builders. It went stale once (sat at 8.0.0 while the app reached
// 13); these checks make the test suite fail the moment the data model moves
// without the doc moving with it.

import { describe, expect, it } from 'vitest';
import schema from './schema.json';
import { SCHEMA_VERSION, STATUSES } from './types';
import { seed } from './lib/seed';

type Def = { properties?: Record<string, unknown> };
const defs = schema.definitions as unknown as Record<string, Def>;
const propsOf = (def: string): Set<string> => new Set(Object.keys(defs[def]?.properties ?? {}));

describe('schema.json stays in lockstep with the data model', () => {
  it('tracks SCHEMA_VERSION in both the version string and the constants block', () => {
    expect(schema.constants.SCHEMA_VERSION.value).toBe(SCHEMA_VERSION);
    expect(schema.version).toBe(`${SCHEMA_VERSION}.0.0`);
  });

  it('declares the app status set exactly', () => {
    expect(schema.definitions.Status.enum).toEqual([...STATUSES]);
    expect(schema.constants.STATUSES.value).toEqual([...STATUSES]);
  });

  // Every key present on real runtime objects must be documented. (The reverse
  // isn't asserted: optional fields may be absent from seed data.)
  it('documents every field the seed data actually carries', () => {
    const s = seed();
    const expectSubset = (obj: object, def: string) => {
      const documented = propsOf(def);
      for (const key of Object.keys(obj)) {
        expect(documented, `schema.json ${def} is missing "${key}"`).toContain(key);
      }
    };
    expect(s.version).toBe(SCHEMA_VERSION);
    for (const t of s.teams) {
      expectSubset(t, 'Team');
      for (const m of t.members) expectSubset(m, 'Member');
    }
    for (const r of s.releases) {
      expectSubset(r, 'Release');
      for (const ws of r.workStreams) expectSubset(ws, 'WorkStream');
      for (const sp of r.sprints) expectSubset(sp, 'Sprint');
      for (const ev of r.events) expectSubset(ev, 'Event');
    }
    for (const it of s.items) expectSubset(it, 'WorkItem');
  });
});
