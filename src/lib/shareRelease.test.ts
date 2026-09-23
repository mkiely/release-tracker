import { describe, expect, it } from 'vitest';
import { aConnectorRelease, aMember, aSprint, aStream, aTeam, anEvent } from '../test/factories';
import type { Release, Team } from '../types';
import {
  SHARE_PARAM,
  buildSharePayload,
  buildShareUrl,
  decodeSharePayload,
  encodeSharePayload,
} from './shareRelease';
import { MAX_URL_LENGTH } from './urlCodec';

const connectorRelease = (overrides: Partial<Release> = {}): Release =>
  aConnectorRelease({
    id: 'rel',
    name: 'Atlas 4.0',
    teamId: 'team_local',
    externalId: null,
    connector: { type: 'acme', config: { project: 'ATL', board: '42' } },
    workStreams: [aStream({ id: 'ws1', name: 'Payments', externalId: 'EPIC-1', engineersRequired: 2 })],
    events: [
      anEvent({ id: 'ev1', label: 'Code freeze', dateISO: '2026-05-01', externalId: 'X-EV-1' }),
      anEvent({ id: 'ev2', label: 'GA', dateISO: '2026-05-20' }),
    ],
    sprints: [
      aSprint({ id: 'sp1', name: 'Sprint 1', startISO: '2026-04-13', endISO: '2026-04-26', daysOff: 3, externalId: 'JIRA-S1' }),
      aSprint({ id: 'sp2', name: 'Sprint 2', startISO: '2026-04-27', endISO: '2026-05-10', externalId: 'JIRA-S2' }),
    ],
    ...overrides,
  });

// Members deliberately mix synced/local and contributing/not: the share payload
// only carries overrides for members the connector knows (those with externalId).
const team = (overrides: Partial<Team> = {}): Team =>
  aTeam({
    id: 'team_local',
    name: 'Atlas',
    externalId: 'ACME-TEAM',
    members: [
      aMember({ id: 'm1', name: 'Ada L.', externalId: 'USR-ADA' }),
      aMember({ id: 'm2', name: 'Pete O.', externalId: 'USR-PETE', nonContributing: true }),
      aMember({ id: 'm3', name: 'Local Only', nonContributing: true }),
    ],
    ...overrides,
  });

describe('buildSharePayload', () => {
  it('returns null for a Local (non-connector) release', () => {
    expect(buildSharePayload(connectorRelease({ connector: null }))).toBeNull();
  });

  it('carries each synced member\'s nonContributing flag, skipping members without an externalId', () => {
    const payload = buildSharePayload(connectorRelease(), team())!;
    expect(payload.members).toEqual([
      { externalId: 'USR-ADA', nonContributing: false },
      { externalId: 'USR-PETE', nonContributing: true },
    ]);
  });

  it('emits an empty members list when no team is passed', () => {
    expect(buildSharePayload(connectorRelease())!.members).toEqual([]);
  });

  it('captures config + events + sprints (with days off) + stream local metadata, but not items', () => {
    const payload = buildSharePayload(connectorRelease())!;
    expect(payload.connector).toEqual({ type: 'acme', config: { project: 'ATL', board: '42' } });
    expect(payload.events).toHaveLength(2);
    expect(payload.sprints.map((s) => s.daysOff)).toEqual([3, 0]);
    // Sprint externalIds survive so days off reattach on the recipient's first sync.
    expect(payload.sprints.map((s) => s.externalId)).toEqual(['JIRA-S1', 'JIRA-S2']);
    // Per-stream local metadata travels keyed by externalId, so engineersRequired
    // reattaches after the recipient's first sync (names/items come from sync).
    expect(payload.workStreams).toEqual([{ externalId: 'EPIC-1', engineersRequired: 2, muted: false }]);
    // The frozen plannedVelocity baseline is app-local and is NOT shared — the
    // recipient stamps their own once a sprint starts.
    expect(payload.sprints.every((s) => !('plannedVelocity' in s))).toBe(true);
    expect('items' in payload).toBe(false);
  });

  it('omits streams without a declared engineersRequired (nothing to reattach)', () => {
    const payload = buildSharePayload(
      connectorRelease({
        workStreams: [
          aStream({ id: 'ws1', name: 'Payments', externalId: 'EPIC-1', engineersRequired: 2 }),
          aStream({ id: 'ws2', name: 'Search', externalId: 'EPIC-2' }),
        ],
      }),
    )!;
    expect(payload.workStreams).toEqual([{ externalId: 'EPIC-1', engineersRequired: 2, muted: false }]);
  });
});

describe('encode/decode round-trip', () => {
  it('decodes back to an equivalent payload', async () => {
    const payload = buildSharePayload(connectorRelease())!;
    const decoded = await decodeSharePayload(await encodeSharePayload(payload));
    expect(decoded).toEqual(payload);
  });

  it('preserves member overrides through a round-trip', async () => {
    const payload = buildSharePayload(connectorRelease(), team())!;
    const decoded = await decodeSharePayload(await encodeSharePayload(payload));
    expect(decoded?.members).toEqual([
      { externalId: 'USR-ADA', nonContributing: false },
      { externalId: 'USR-PETE', nonContributing: true },
    ]);
  });

  it('returns null for malformed input', async () => {
    // Valid base64url but not a deflate stream, then invalid base64url, then empty.
    await expect(decodeSharePayload('bm90LWEtc2hhcmU')).resolves.toBeNull();
    await expect(decodeSharePayload('not-a-valid-payload!!!')).resolves.toBeNull();
    await expect(decodeSharePayload('')).resolves.toBeNull();
  });

  it('rejects a payload missing required fields', async () => {
    const encoded = await encodeSharePayload({ v: 1, name: 'X' } as never);
    await expect(decodeSharePayload(encoded)).resolves.toBeNull();
  });
});

describe('buildShareUrl', () => {
  it('produces a #share= URL under the safe length for a normal release', async () => {
    const result = await buildShareUrl(connectorRelease(), 'https://app.example.com');
    expect(result.ok).toBe(true);
    if (result.ok) {
      // The payload rides in the fragment, never a query param: it carries connector
      // config, which must not reach a server's access log.
      expect(result.url.startsWith(`https://app.example.com/#${SHARE_PARAM}=`)).toBe(true);
      expect(result.url).not.toContain('?');
      expect(result.url.length).toBeLessThanOrEqual(MAX_URL_LENGTH);
    }
  });

  it('reports not-connector for a Local release', async () => {
    const result = await buildShareUrl(connectorRelease({ connector: null }), 'https://app.example.com');
    expect(result).toEqual({ ok: false, reason: 'not-connector' });
  });

  it('reports too-long when metadata overflows the safe URL length', async () => {
    // Labels carry a pseudo-random suffix so the guard is exercised against realistic
    // entropy: 400 identically-shaped events compress away to almost nothing, which
    // would test deflate's ratio rather than the length branch.
    const many = Array.from({ length: 4000 }, (_, i) => ({
      id: `ev${i}`,
      label: `Milestone ${i} ${((i * 2654435761) % 2 ** 32).toString(36)}`,
      dateISO: `2026-05-${String((i % 28) + 1).padStart(2, '0')}`,
      externalId: `EXT-${((i * 40503) % 2 ** 16).toString(36)}-${i}`,
    }));
    const result = await buildShareUrl(connectorRelease({ events: many }), 'https://app.example.com');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('too-long');
      expect(result.length).toBeGreaterThan(MAX_URL_LENGTH);
    }
  });
});
