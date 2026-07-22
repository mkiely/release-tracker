// Share a connector release as a self-contained link.
//
// A connector release's *configuration* (which external system + routing config)
// plus its app-owned *local metadata* (calendar events and per-sprint days off)
// is the only thing worth sharing — work items and work streams are owned by the
// external system and arrive on the recipient's first sync. So the share payload
// deliberately excludes them: the recipient loads a thin release, then clicks
// Sync to pull the live data against their own backend.
//
// The payload is JSON → LZ-compressed → URL-safe string, carried in a `?share=`
// query param. Sprints keep their `externalId` so days off reattach by id on the
// recipient's first sync (applySync matches sprints by externalId; daysOff is
// app-owned and survives). Events keep theirs for the same reason.

import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import type { MemberOverride, Release, ReleaseConnector, Team } from '../types';

/** Query-string key carrying an encoded share payload. */
export const SHARE_PARAM = 'share';

/**
 * Conservative cross-browser cap on a usable URL length. Real limits vary (IE
 * ~2083; most modern browsers far higher) but 2000 is the widely-cited safe
 * ceiling. A share link longer than this is reported, not produced.
 */
export const MAX_SAFE_URL_LENGTH = 2000;

/** Schema version for the share payload, so a future shape change can be detected.
 *  v2 adds `members` (non-contributing overrides). v1 links still decode — `members`
 *  is simply absent, and the recipient's sync seeds member flags from the connector. */
const SHARE_VERSION = 2;

/** Per-sprint metadata that travels in a share. Dates/name are for pre-sync
 *  display; `externalId` + `daysOff` are what make days off reattach on sync. */
interface ShareSprint {
  name: string;
  startISO: string;
  endISO: string;
  daysOff: number;
  externalId: string | null;
}

/** A calendar event that travels in a share. */
interface ShareEvent {
  label: string;
  dateISO: string;
  externalId: string | null;
}

/** Per-stream local metadata that travels in a share. `externalId` is the key
 *  used to reattach `engineersRequired` after the recipient syncs. */
interface ShareWorkStream {
  externalId: string | null;
  engineersRequired: number | null;
}

/** The decoded contents of a share link: enough to recreate a connector release
 *  minus its externally-owned work (items + streams). */
export interface SharePayload {
  v: number;
  name: string;
  startISO: string;
  connector: ReleaseConnector;
  events: ShareEvent[];
  sprints: ShareSprint[];
  /** Local-metadata-only slice of each work stream (no names/items — those come
   *  from sync). Only streams with an externalId can be reattached. */
  workStreams?: ShareWorkStream[];
  /** The sharer's app-owned `nonContributing` flag per synced member, keyed by
   *  `externalId`. Reattaches on the recipient's first sync so a manual override
   *  (either direction) survives instead of resetting to the connector's value.
   *  Absent on v1 links and for members with no externalId. */
  members?: MemberOverride[];
}

/**
 * Build a share payload from a release. Returns null for Local (non-connector)
 * releases — there's no external system for the recipient to sync against, so a
 * link would carry config that can't be filled in.
 *
 * `team` is the release's bound team, used only to carry each synced member's
 * app-owned `nonContributing` flag so a manual override survives the recipient's
 * first sync. Omit it (or pass an unsynced team) and no member overrides travel.
 */
export function buildSharePayload(release: Release, team?: Team): SharePayload | null {
  if (!release.connector) return null;
  return {
    v: SHARE_VERSION,
    name: release.name,
    startISO: release.startISO,
    connector: release.connector,
    events: release.events.map((e) => ({ label: e.label, dateISO: e.dateISO, externalId: e.externalId })),
    sprints: release.sprints.map((s) => ({
      name: s.name,
      startISO: s.startISO,
      endISO: s.endISO,
      daysOff: s.daysOff,
      externalId: s.externalId,
    })),
    workStreams: release.workStreams
      .filter((ws) => ws.engineersRequired !== null)
      .map((ws) => ({ externalId: ws.externalId, engineersRequired: ws.engineersRequired })),
    // Every synced member's current (app-owned) flag, keyed by externalId — reattaches
    // on the recipient's first sync. Members with no externalId can't be matched there.
    members: (team?.members ?? [])
      .filter((m) => m.externalId !== null)
      .map((m) => ({ externalId: m.externalId!, nonContributing: m.nonContributing })),
  };
}

/** Compress + URL-safe-encode a payload into the value for the `?share=` param. */
export function encodeSharePayload(payload: SharePayload): string {
  return compressToEncodedURIComponent(JSON.stringify(payload));
}

/** Decode + decompress a `?share=` value back into a payload. Returns null if the
 *  value is malformed, truncated, or not a recognized share payload. */
export function decodeSharePayload(encoded: string): SharePayload | null {
  try {
    const json = decompressFromEncodedURIComponent(encoded);
    if (!json) return null;
    const p = JSON.parse(json) as Partial<SharePayload>;
    if (
      typeof p !== 'object' || p === null ||
      typeof p.name !== 'string' ||
      typeof p.startISO !== 'string' ||
      !p.connector || typeof p.connector.type !== 'string' ||
      !Array.isArray(p.events) || !Array.isArray(p.sprints)
    ) {
      return null;
    }
    return p as SharePayload;
  } catch {
    return null;
  }
}

/** Result of attempting to build a share link from a release. */
export type ShareLinkResult =
  | { ok: true; url: string }
  | { ok: false; reason: 'not-connector' | 'too-long'; length?: number };

/**
 * Build the absolute share URL for a release against `origin` (e.g.
 * window.location.origin). Reports `too-long` when the result would exceed
 * {@link MAX_SAFE_URL_LENGTH} rather than producing a link that may be truncated.
 */
export function buildShareUrl(release: Release, origin: string, team?: Team): ShareLinkResult {
  const payload = buildSharePayload(release, team);
  if (!payload) return { ok: false, reason: 'not-connector' };
  const url = `${origin}/?${SHARE_PARAM}=${encodeSharePayload(payload)}`;
  if (url.length > MAX_SAFE_URL_LENGTH) return { ok: false, reason: 'too-long', length: url.length };
  return { ok: true, url };
}
