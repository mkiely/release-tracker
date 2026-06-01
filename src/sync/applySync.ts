// The upsert engine: applies a MappedRelease (from the sync service) onto local
// AppState. Pure and immutable — returns a new state plus a SyncResult tally.
//
// Policy (see documents/connector-sync-design.md):
//  - Match by externalId, scoped to (release × entity type).
//  - External wins: matched synced fields are overwritten.
//  - Locally-created entities (externalId === null) are never matched or touched.
//  - No deletion of synced-but-now-missing entities this iteration.
//  - Sprints use the fixed 8-slot grid: link by chronological order, never create;
//    the grid keeps owning sprint dates (option A).
//  - Items with an unresolved work stream are skipped + warned; an unresolved
//    sprint lands the item in the backlog (sprintN 0).

import type { AppState, Sprint, WorkItem, WorkStream } from '../types';
import { uid } from '../lib/dates';
import type { MappedRelease, SyncResult } from './schema';

export function applySync(
  state: AppState,
  releaseId: string,
  mapped: MappedRelease,
): { next: AppState; result: SyncResult } {
  const result: SyncResult = { created: 0, updated: 0, skipped: 0, warnings: [] };

  const release = state.releases.find((r) => r.id === releaseId);
  if (!release) {
    result.warnings.push(`Release ${releaseId} not found; nothing applied.`);
    return { next: state, result };
  }

  // --- 1. Work streams: match by externalId, else create ---
  const workStreams: WorkStream[] = release.workStreams.map((ws) => ({ ...ws }));
  const wsByExt = new Map<string, string>(); // external id -> local workStreamId
  for (const m of mapped.workStreams) {
    const existing = workStreams.find((ws) => ws.externalId === m.externalId);
    if (existing) {
      existing.name = m.fields.name;
      wsByExt.set(m.externalId, existing.id);
      result.updated++;
    } else {
      const ws: WorkStream = { id: uid('ws'), name: m.fields.name, externalId: m.externalId };
      workStreams.push(ws);
      wsByExt.set(m.externalId, ws.id);
      result.created++;
    }
  }

  // --- 2. Sprints: fixed grid, link (never create) by chronological order ---
  const sprints: Sprint[] = release.sprints.map((s) => ({ ...s }));
  const sprintByExt = new Map<string, number>(); // external id -> local sprint n
  for (const s of sprints) {
    if (s.externalId) sprintByExt.set(s.externalId, s.n); // pre-seed existing links
  }
  const incoming = [...mapped.sprints].sort((a, b) =>
    a.fields.startISO.localeCompare(b.fields.startISO),
  );
  for (const m of incoming) {
    const linked = sprints.find((s) => s.externalId === m.externalId);
    if (linked) {
      linked.name = m.fields.name; // refresh name on an already-linked slot
      continue;
    }
    const slot = sprints.find((s) => s.externalId === null); // next free slot, in n order
    if (!slot) {
      result.skipped++;
      result.warnings.push(
        `No free sprint slot for external sprint "${m.fields.name}" (${m.externalId}); dropped.`,
      );
      continue;
    }
    slot.externalId = m.externalId;
    slot.name = m.fields.name;
    sprintByExt.set(m.externalId, slot.n);
  }

  // --- 3. Items: resolve refs, then match by externalId or create ---
  const items: WorkItem[] = state.items.map((i) => ({ ...i }));
  for (const m of mapped.items) {
    const workStreamId = m.extWorkStreamId !== null ? wsByExt.get(m.extWorkStreamId) : undefined;
    if (!workStreamId) {
      result.skipped++;
      result.warnings.push(
        `Item ${m.fields.key} skipped: unresolved work stream (${m.extWorkStreamId ?? 'none'}).`,
      );
      continue;
    }

    let sprintN = 0; // backlog by default
    if (m.extSprintId !== null) {
      const resolved = sprintByExt.get(m.extSprintId);
      if (resolved === undefined) {
        result.warnings.push(`Item ${m.fields.key}: sprint ${m.extSprintId} not mapped; placed in backlog.`);
      } else {
        sprintN = resolved;
      }
    }

    const existing = items.find((i) => i.releaseId === releaseId && i.externalId === m.externalId);
    if (existing) {
      existing.workStreamId = workStreamId;
      existing.sprintN = sprintN;
      existing.key = m.fields.key;
      existing.subject = m.fields.subject;
      existing.description = m.fields.description;
      existing.status = m.fields.status;
      existing.points = m.fields.points;
      result.updated++;
    } else {
      items.push({
        id: uid('it'),
        releaseId,
        workStreamId,
        sprintN,
        key: m.fields.key,
        subject: m.fields.subject,
        description: m.fields.description,
        status: m.fields.status,
        points: m.fields.points,
        externalId: m.externalId,
      });
      result.created++;
    }
  }

  const releases = state.releases.map((r) =>
    r.id === releaseId ? { ...r, workStreams, sprints } : r,
  );
  return { next: { ...state, releases, items }, result };
}
