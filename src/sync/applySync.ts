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
//  - Dirty writeable fields on matched items are preserved (local push pending).
//  - Team (step 0): when mapped.team is present on a connector release, the team
//    is created or reused by externalId, members are upserted, and release.teamId
//    is repointed. Velocity is app-owned and never overwritten.

import type { AppState, ItemType, Member, Release, Sprint, Team, WorkItem, WorkStream } from '../types';
import { uid } from '../lib/dates';
import type { MappedItem, MappedRelease, SyncResult } from './schema';

/** External-id → local-id lookups for resolving a MappedItem's refs. */
export interface ExtMaps {
  wsByExt: Map<string, string>;
  sprintByExt: Map<string, string>;
  memberByExt: Map<string, string>;
}

/** Build ref lookups from a release's already-synced entities (each carrying an
 *  externalId). Used by the single-item create path; full sync builds them
 *  incrementally as it upserts streams/sprints/members. */
export function buildExtMaps(release: Release, teams: Team[]): ExtMaps {
  const wsByExt = new Map<string, string>();
  for (const ws of release.workStreams) if (ws.externalId) wsByExt.set(ws.externalId, ws.id);
  const sprintByExt = new Map<string, string>();
  for (const s of release.sprints) if (s.externalId) sprintByExt.set(s.externalId, s.id);
  const memberByExt = new Map<string, string>();
  const team = teams.find((t) => t.id === release.teamId);
  for (const m of team?.members ?? []) if (m.externalId) memberByExt.set(m.externalId, m.id);
  return { wsByExt, sprintByExt, memberByExt };
}

/** Normalize a wire itemType (whose `id` is optional) to the app's ItemType. */
function mapItemType(it: MappedItem['fields']['itemType']): ItemType | null {
  return it ? { id: it.id ?? null, label: it.label } : null;
}

/**
 * Resolve one MappedItem's refs and insert or update it in `items` (mutated in
 * place). Returns the outcome so callers can tally results. Read-only fields are
 * always overwritten (external wins); dirty writeable fields are preserved.
 */
export function upsertItem(
  items: WorkItem[],
  m: MappedItem,
  releaseId: string,
  maps: ExtMaps,
  writeableItemFields: string[],
): { status: 'created' | 'updated' | 'skipped'; warning?: string } {
  let workStreamId: string | null;
  if (m.extWorkStreamId == null) {
    workStreamId = null;
  } else {
    const resolved = maps.wsByExt.get(m.extWorkStreamId);
    if (resolved === undefined) {
      return { status: 'skipped', warning: `Item ${m.fields.key} skipped: unresolved work stream (${m.extWorkStreamId}).` };
    }
    workStreamId = resolved;
  }

  let sprintId: string | null = null; // backlog by default
  let warning: string | undefined;
  if (m.extSprintId != null) {
    const resolved = maps.sprintByExt.get(m.extSprintId);
    if (resolved === undefined) {
      warning = `Item ${m.fields.key}: sprint ${m.extSprintId} not mapped; placed in backlog.`;
    } else {
      sprintId = resolved;
    }
  }

  const assignedMemberId = m.extAssigneeId != null ? (maps.memberByExt.get(m.extAssigneeId) ?? null) : null;

  const existing = items.find((i) => i.releaseId === releaseId && i.externalId === m.externalId);
  if (existing) {
    existing.workStreamId = workStreamId;
    existing.key = m.fields.key;
    existing.subject = m.fields.subject;
    existing.description = m.fields.description;
    existing.descriptionFormat = m.fields.descriptionFormat ?? 'text';
    existing.status = m.fields.status;
    existing.assignedMemberId = assignedMemberId;
    existing.build = m.fields.build ?? null;
    existing.itemType = mapItemType(m.fields.itemType);
    // Dirty-aware: preserve local value for writeable fields pending push.
    const sprintDirty = writeableItemFields.includes('sprint') && existing.dirtyFields.includes('sprint');
    const pointsDirty = writeableItemFields.includes('points') && existing.dirtyFields.includes('points');
    if (!sprintDirty) existing.sprintId = sprintId;
    if (!pointsDirty) existing.points = m.fields.points;
    // Record the incoming external value as the baseline a pending push diverges from.
    existing.syncedValues = { points: m.fields.points, sprintId };
    return { status: 'updated', warning };
  }

  items.push({
    id: uid('it'),
    releaseId,
    workStreamId,
    sprintId,
    key: m.fields.key,
    subject: m.fields.subject,
    description: m.fields.description,
    descriptionFormat: m.fields.descriptionFormat ?? 'text',
    status: m.fields.status,
    points: m.fields.points,
    externalId: m.externalId,
    assignedMemberId,
    build: m.fields.build ?? null,
    itemType: mapItemType(m.fields.itemType),
    dirtyFields: [],
    syncedValues: { points: m.fields.points, sprintId },
  });
  return { status: 'created', warning };
}

/**
 * Apply a single connector-created item (the MappedItem returned by the create
 * endpoint) onto local state, reconciling it as a synced item. Refs are resolved
 * against the release's existing entities. Returns the inserted item (or null on
 * an unresolved/​missing release).
 */
export function applyCreatedItem(
  state: AppState,
  releaseId: string,
  mapped: MappedItem,
  writeableItemFields: string[] = [],
): { next: AppState; item: WorkItem | null; warning?: string } {
  const release = state.releases.find((r) => r.id === releaseId);
  if (!release) return { next: state, item: null, warning: `Release ${releaseId} not found.` };
  const maps = buildExtMaps(release, state.teams);
  const items = state.items.map((i) => ({ ...i }));
  const { status, warning } = upsertItem(items, mapped, releaseId, maps, writeableItemFields);
  if (status === 'skipped') return { next: state, item: null, warning };
  const item = items.find((i) => i.releaseId === releaseId && i.externalId === mapped.externalId) ?? null;
  return { next: { ...state, items }, item, warning };
}

export function applySync(
  state: AppState,
  releaseId: string,
  mapped: MappedRelease,
  writeableItemFields: string[] = [],
): { next: AppState; result: SyncResult } {
  const result: SyncResult = { created: 0, updated: 0, skipped: 0, warnings: [] };

  const release = state.releases.find((r) => r.id === releaseId);
  if (!release) {
    result.warnings.push(`Release ${releaseId} not found; nothing applied.`);
    return { next: state, result };
  }

  const isConnector = release.connector !== null;

  // --- 0. Team & members (connector releases only, when team is provided) ---
  let teams: Team[] = state.teams.map((t) => ({ ...t }));
  let releaseTeamId = release.teamId;
  const memberByExt = new Map<string, string>(); // external member id -> local member id

  if (isConnector && mapped.team) {
    const mt = mapped.team;
    let team = teams.find((t) => t.externalId === mt.externalId);
    if (!team) {
      // Carry velocity from the current bound team if possible; avoids zeroing it.
      const currentTeam = teams.find((t) => t.id === releaseTeamId);
      team = {
        id: uid('team'),
        name: mt.fields.name,
        velocity: currentTeam?.velocity ?? 0,
        externalId: mt.externalId,
        members: [],
      };
      teams.push(team);
      result.created++;
    } else {
      team.name = mt.fields.name; // external wins on name; velocity stays app-owned
      result.updated++;
    }
    releaseTeamId = team.id;

    // Upsert members into the resolved team.
    const members: Member[] = team.members.map((m) => ({ ...m }));
    for (const mm of mt.members) {
      const existing = members.find((m) => m.externalId === mm.externalId);
      if (existing) {
        existing.name = mm.fields.name;
        // nonContributing is app-owned after creation; the connector's value is only
        // used as a seed hint when the member is first added (see else branch below).
        memberByExt.set(mm.externalId, existing.id);
        result.updated++;
      } else {
        const m: Member = {
          id: uid('m'),
          name: mm.fields.name,
          externalId: mm.externalId,
          nonContributing: mm.fields.nonContributing ?? false,
        };
        members.push(m);
        memberByExt.set(mm.externalId, m.id);
        result.created++;
      }
    }
    team.members = members;
  }

  // --- 1. Work streams: match by externalId, else create ---
  const workStreams: WorkStream[] = release.workStreams.map((ws) => ({ ...ws }));
  const wsByExt = new Map<string, string>(); // external id -> local workStreamId
  for (const m of mapped.workStreams) {
    const existing = workStreams.find((ws) => ws.externalId === m.externalId);
    if (existing) {
      existing.name = m.fields.name; // external wins on name only; engineersRequired stays app-owned
      wsByExt.set(m.externalId, existing.id);
      result.updated++;
    } else {
      const ws: WorkStream = { id: uid('ws'), name: m.fields.name, externalId: m.externalId, engineersRequired: null };
      workStreams.push(ws);
      wsByExt.set(m.externalId, ws.id);
      result.created++;
    }
  }

  // --- 2. Sprints ---
  // Connector releases create sprints from external data and take external dates;
  // local releases link onto the fixed grid in chronological order (never create).
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
  const maps: ExtMaps = { wsByExt, sprintByExt, memberByExt };
  for (const m of mapped.items) {
    const { status, warning } = upsertItem(items, m, releaseId, maps, writeableItemFields);
    if (status === 'created') result.created++;
    else if (status === 'updated') result.updated++;
    else result.skipped++;
    if (warning) result.warnings.push(warning);
  }

  const releases = state.releases.map((r) =>
    r.id === releaseId ? { ...r, teamId: releaseTeamId, workStreams, sprints } : r,
  );
  return { next: { ...state, teams, releases, items }, result };
}
