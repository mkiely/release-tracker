// The standalone viewer's local "remembered summaries" library.
//
// Every snapshot the viewer opens is saved here, keyed by its durable summaryId
// (= the source release's id). A fresher share of the same release replaces the
// remembered copy in place (upsert-if-newer by generatedAtISO) rather than piling
// up stale duplicates. This store is deliberately separate from the main app's
// release store — the viewer knows nothing about connectors, teams, or work items,
// only frozen snapshots.

import type { SnapshotPayload } from '../lib/releaseSnapshot';

/** localStorage key for the remembered-summaries map. Namespaced apart from the
 *  app's own state so the two never collide even when served same-origin. */
export const LIBRARY_KEY = 'release-tracker:summaries';

/** Stored shape: summaryId → the most recent snapshot seen for that release. */
type Library = Record<string, SnapshotPayload>;

function read(): Library {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Library) : {};
  } catch {
    return {};
  }
}

function write(lib: Library): void {
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(lib));
  } catch {
    // Quota or unavailable storage — the viewer still works for the current link,
    // it just won't remember. Nothing to recover here.
  }
}

/** All remembered summaries, newest snapshot first. */
export function listSummaries(): SnapshotPayload[] {
  return Object.values(read()).sort((a, b) => (a.generatedAtISO < b.generatedAtISO ? 1 : -1));
}

/** One remembered summary by id, or null. */
export function getSummary(summaryId: string): SnapshotPayload | null {
  return read()[summaryId] ?? null;
}

/**
 * Remember a snapshot, keeping the fresher of it and any existing copy for the same
 * release. Returns the copy now stored (the incoming one when it won or there was
 * none; the existing one when it was already newer) so callers can render the best
 * available data even if the link they followed was stale.
 */
export function rememberSummary(payload: SnapshotPayload): SnapshotPayload {
  const lib = read();
  const existing = lib[payload.summaryId];
  if (existing && existing.generatedAtISO >= payload.generatedAtISO) return existing;
  lib[payload.summaryId] = payload;
  write(lib);
  return payload;
}

/** Forget one remembered summary. No-op if it isn't stored. */
export function forgetSummary(summaryId: string): void {
  const lib = read();
  if (!(summaryId in lib)) return;
  delete lib[summaryId];
  write(lib);
}
