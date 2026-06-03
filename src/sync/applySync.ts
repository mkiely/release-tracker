// The upsert engine: applies a MappedRelease (from the sync service) onto local
// AppState. Pure and immutable — returns a new state plus a SyncResult tally.
//
// Policy (see documents/connector-sync-design.md):
//  - Match by externalId, scoped to (release × entity type).
//  - External wins: matched synced fields are overwritten.
//  - Locally-created entities (externalId === null) are never matched or touched.
//  - No deletion of synced-but-now-missing entities this iteration.
//  - Sprints depend on the release kind:
//      · Connector releases (connector !== null): the external system is the
//        calendar authority. Incoming sprints are created on demand and their
//        start/end dates are written (external wins). `daysOff` stays app-owned.
//      · Local releases (connector === null): the fixed grid links by chronological
//        order, never creates, and keeps owning sprint dates.
//  - Items with an unresolved work stream are skipped + warned; an unresolved or
//    unset sprint lands the item in the backlog (sprintId null).

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

  // --- 2. Sprints ---
  // Connector releases create sprints from external data and take external dates;
  // local releases link onto the fixed grid in chronological order (never create).
  const isConnector = release.connector !== null;
  const sprints: Sprint[] = release.sprints.map((s) => ({ ...s }));
  const sprintByExt = new Map<string, string>(); // external id -> local sprint id
  for (const s of sprints) {
    if (s.externalId) sprintByExt.set(s.externalId, s.id); // pre-seed existing links
  }
  const incoming = [...mapped.sprints].sort((a, b) =>
    a.fields.startISO.localeCompare(b.fields.startISO),
  );
  for (const m of incoming) {
    const linked = sprints.find((s) => s.externalId === m.externalId);
    if (linked) {
      linked.name = m.fields.name; // refresh name on an already-linked sprint
      if (isConnector) {
        linked.startISO = m.fields.startISO; // external owns dates for connector releases
        linked.endISO = m.fields.endISO;
      }
      sprintByExt.set(m.externalId, linked.id);
      continue;
    }
    if (!isConnector) {
      // local grid: link onto the next free slot in chronological order, else drop
      const slot = sprints.find((s) => s.externalId === null);
      if (!slot) {
        result.skipped++;
        result.warnings.push(
          `No free sprint slot for external sprint "${m.fields.name}" (${m.externalId}); dropped.`,
        );
        continue;
      }
      slot.externalId = m.externalId;
      slot.name = m.fields.name;
      sprintByExt.set(m.externalId, slot.id);
      continue;
    }
    // connector release: create the sprint from external data
    const sp: Sprint = {
      id: uid('sp'),
      name: m.fields.name,
      startISO: m.fields.startISO,
      endISO: m.fields.endISO,
      daysOff: 0, // app-owned enrichment; adjusted separately, never overwritten by sync
      externalId: m.externalId,
    };
    sprints.push(sp);
    sprintByExt.set(m.externalId, sp.id);
    result.created++;
  }
  // sort by startISO after any additions — this also drives visual display order
  sprints.sort((a, b) => a.startISO.localeCompare(b.startISO));

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

    let sprintId: string | null = null; // backlog by default
    if (m.extSprintId !== null) {
      const resolved = sprintByExt.get(m.extSprintId);
      if (resolved === undefined) {
        result.warnings.push(`Item ${m.fields.key}: sprint ${m.extSprintId} not mapped; placed in backlog.`);
      } else {
        sprintId = resolved;
      }
    }

    const existing = items.find((i) => i.releaseId === releaseId && i.externalId === m.externalId);
    if (existing) {
      existing.workStreamId = workStreamId;
      existing.sprintId = sprintId;
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
        sprintId,
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
