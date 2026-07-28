// Every mutation of the domain state, as one object hung off the store.
//
// Actions don't close over zustand. They take an {@link ActionContext} — read a
// snapshot, replace the whole state — which keeps this file independent of how
// the store is wired and lets it be exercised against a plain state object.
// CRUD entries are named for their effect; the non-obvious ones (move, revert,
// sync, push) carry their own docs.

import {
  SPRINT_LEN_DAYS,
  STATUSES,
  type AppState,
  type AttrValue,
  type ItemType,
  type Release,
  type ReleaseConnector,
  type ReleaseEvent,
  type Sprint,
  type Status,
  type Team,
  type WorkItem,
  type WorkStream,
} from '../types';
import { buildSprints, todayISO, uid } from '../lib/dates';
import { seed } from '../lib/seed';
import { applyCreatedItem, applySync } from '../sync/applySync';
import { buildCreateRequest, buildPushChanges } from '../sync/push';
import { allWriteableLocalFields, canonicalBaseline, writeableLocalFieldsForItem } from '../lib/connectorFields';
import { syncClient } from '../sync/client';
import type { PushResult, SyncResult } from '../sync/schema';
import type { SharePayload } from '../lib/shareRelease';
import { stampStartedSprints } from './migrate';

/** Result of a sync attempt, shaped so the UI can craft a precise toast. */
export type SyncOutcome =
  | { ok: true; result: SyncResult }
  | { ok: false; reason: 'no-connector' | 'error'; message: string };

/** Result of a push attempt. */
export type PushOutcome =
  | { ok: true; result: PushResult }
  | { ok: false; reason: 'no-connector' | 'nothing-to-push' | 'error'; message: string };

/** A locally-assembled connector item to queue for creation. Carries LOCAL ref ids
 *  and canonical/vocabulary values; the external ids and wire `fields` are derived
 *  at push time (see push.ts `buildCreateRequest`), so edits made before the push
 *  are reflected. The create modal validates these client-side before queuing. */
export interface ConnectorItemDraft {
  itemType: ItemType;
  workStreamId: string | null;
  sprintId: string | null;
  assignedMemberId: string | null;
  subject: string;
  description: string;
  descriptionFormat: 'text' | 'html';
  status: Status;
  points: number | null;
  attributes: Record<string, AttrValue>;
}

/** How the actions reach the state they mutate. The store supplies this; a test
 *  can supply a plain object. */
export interface ActionContext {
  /** A shallow copy of the persisted data slice, safe to mutate in place. */
  snapshot(): AppState;
  /** Persist a whole new state and trigger a re-render. */
  replace(next: AppState): void;
}

/** All state mutations, grouped under `store.actions`. Each commits immutably,
 *  persists to localStorage, and triggers a re-render. */
export interface Actions {
  reset: () => void;
  createTeam: (input: { name: string; velocity: number | string; members: string[] }) => Team;
  updateTeam: (id: string, patch: Partial<Pick<Team, 'name' | 'velocity' | 'members'>>) => void;
  deleteTeam: (id: string) => void;
  createRelease: (input: { name: string; startISO: string; teamId: string; connector?: ReleaseConnector | null; sprintCount?: number; sprintLengthDays?: number }) => Release;
  /** Recreate a connector release from a decoded share payload: connector config +
   *  local metadata (events, sprints incl. days off). No work items/streams — those
   *  arrive on the recipient's first sync. The team arrives from the connector too. */
  importSharedRelease: (payload: SharePayload) => Release;
  deleteRelease: (id: string) => void;
  /** Sets/clears the release's code check-in deadline. null = defaults to the last
   *  sprint's endISO (see derive.effectiveCodeFreeze). */
  setCodeFreeze: (releaseId: string, codeFreezeISO: string | null) => void;
  /** Set (or clear) a connector release's background auto-sync cadence. `minutes`
   *  <= 0 or null turns it off. No-op for Local releases in practice (they never sync). */
  setAutoSync: (releaseId: string, minutes: number | null) => void;
  createWorkStream: (releaseId: string, name: string) => WorkStream | null;
  updateWorkStream: (releaseId: string, wsId: string, patch: Partial<Pick<WorkStream, 'name' | 'engineersRequired' | 'planningState' | 'codeFreezeISO'>>) => void;
  createEvent: (releaseId: string, input: { label: string; dateISO: string }) => void;
  updateEvent: (releaseId: string, eventId: string, patch: Partial<Pick<ReleaseEvent, 'label' | 'dateISO'>>) => void;
  deleteEvent: (releaseId: string, eventId: string) => void;
  updateSprint: (releaseId: string, sprintId: string, patch: Partial<Sprint>) => void;
  createItem: (
    releaseId: string,
    input: { workStreamId: string | null; sprintId: string | null; subject: string; description?: string; status?: Status; points?: number | null; assignedMemberId?: string | null; itemType?: ItemType | null },
  ) => WorkItem | null;
  updateItem: (id: string, patch: Partial<WorkItem>) => void;
  /** Move an item to another sprint (e.g. via drag-and-drop). For synced items, marks or clears the 'sprint' dirty flag relative to the synced baseline so the move is pushable. */
  moveItemToSprint: (id: string, sprintId: string | null) => void;
  /** Discard an item's pending push: restore its dirty writeable fields to the last synced value. No-op without a synced baseline. */
  revertItem: (id: string) => void;
  /** Queue a work item for creation on a connector release: builds a local
   *  `pendingCreate` item shown immediately on the board and sent to the external
   *  system on the next Push (not on save). Returns the queued item, or null for
   *  Local releases / missing release. */
  createConnectorItem: (releaseId: string, draft: ConnectorItemDraft) => WorkItem | null;
  /** Discard a queued (`pendingCreate`) item before it's pushed — the create-side
   *  counterpart to {@link revertItem}. No-op for already-created or non-pending items. */
  discardPendingCreate: (id: string) => void;
  /** Pull from this release's connector and upsert the result. No-op for Local releases. */
  syncRelease: (releaseId: string) => Promise<SyncOutcome>;
  /** Push locally-dirty writeable fields back to the external system. */
  pushRelease: (releaseId: string) => Promise<PushOutcome>;
}

/** Build the action set against a state context. Called once by the store. */
export function createActions(ctx: ActionContext): Actions {
  // Commit a mutated-in-place data slice: persist + trigger a re-render.
  const commit = (mutate: (data: AppState) => void) => {
    const data = ctx.snapshot();
    mutate(data);
    ctx.replace(data);
  };

  const release = (id: string) => ctx.snapshot().releases.find((r) => r.id === id);

  return {
    reset: () => {
      ctx.replace(seed());
    },

    createTeam: ({ name, velocity, members }) => {
      const t: Team = {
        id: uid('team'),
        name: name || 'Untitled team',
        velocity: Number(velocity) || 0,
        externalId: null,
        members: (members || []).filter((m) => m.trim()).map((m) => ({ id: uid('m'), name: m.trim(), externalId: null, nonContributing: false })),
      };
      commit((d) => { d.teams = [...d.teams, t]; });
      return t;
    },

    updateTeam: (id, patch) => {
      commit((d) => {
        d.teams = d.teams.map((t) => (t.id === id ? { ...t, ...patch } : t));
      });
    },

    deleteTeam: (id) => {
      commit((d) => {
        const memberIds = new Set(d.teams.find((t) => t.id === id)?.members.map((m) => m.id) ?? []);
        d.teams = d.teams.filter((t) => t.id !== id);
        // Null the teamId on any release that referenced this team.
        d.releases = d.releases.map((r) => (r.teamId === id ? { ...r, teamId: '' } : r));
        // Null assignedMemberId on any work item assigned to a member of the deleted team.
        if (memberIds.size > 0) {
          d.items = d.items.map((i) =>
            i.assignedMemberId && memberIds.has(i.assignedMemberId) ? { ...i, assignedMemberId: null } : i,
          );
        }
      });
    },

    createRelease: ({ name, startISO, teamId, connector, sprintCount, sprintLengthDays }) => {
      const start = startISO || todayISO();
      const len = sprintLengthDays ?? SPRINT_LEN_DAYS;
      const r: Release = {
        id: uid('rel'),
        name: name || 'Untitled release',
        startISO: start,
        teamId,
        workStreams: [],
        events: [],
        // Connector releases get their sprints from the external system on first
        // sync; local releases build a uniform grid of `len`-day sprints.
        sprints: connector ? [] : buildSprints(start, {}, sprintCount, len),
        codeFreezeISO: null,
        externalId: null,
        connector: connector ?? null,
        sync: null,
        // Connector sprints may vary in length; store the nominal default for them.
        sprintLengthDays: len,
        catalog: null,
      };
      commit((d) => { d.releases = [...d.releases, r]; });
      return r;
    },

    importSharedRelease: (payload) => {
      const r: Release = {
        id: uid('rel'),
        name: payload.name || 'Untitled release',
        startISO: payload.startISO || todayISO(),
        // A connector release's team is repointed on first sync; start unbound.
        teamId: '',
        // Seed work streams from the share so that engineersRequired (app-owned
        // local metadata) survives the first sync: applySync matches by externalId
        // and preserves app-owned fields on existing streams rather than resetting
        // them to null. Only streams with an externalId can be reattached.
        workStreams: (payload.workStreams ?? [])
          .filter((ws) => ws.externalId !== null)
          .map((ws) => ({
            id: uid('ws'),
            name: '',
            externalId: ws.externalId,
            engineersRequired: ws.engineersRequired ?? null,
            planningState: 'open',
            build: null,
            externalUrl: null,
            attributes: {},
          })),
        events: payload.events.map((e) => ({
          id: uid('ev'),
          label: e.label || 'Event',
          dateISO: e.dateISO,
          externalId: e.externalId ?? null,
        })),
        // Carry sprints (with externalId) so days off reattach on the first sync,
        // which matches sprints by externalId and preserves the app-owned daysOff.
        sprints: payload.sprints.map((s) => ({
          id: uid('sp'),
          name: s.name,
          startISO: s.startISO,
          endISO: s.endISO,
          daysOff: s.daysOff || 0,
          externalId: s.externalId ?? null,
          plannedVelocity: null,
        })),
        codeFreezeISO: null,
        externalId: null,
        connector: payload.connector,
        sync: null,
        // Nominal only — a connector's actual sprints arrive (and may vary) on sync.
        sprintLengthDays: SPRINT_LEN_DAYS,
        catalog: null,
        // Stash the sharer's non-contributing overrides until the first sync creates
        // the members (the team is unbound until then). applySync consumes + clears.
        pendingMemberOverrides: payload.members?.length ? payload.members : undefined,
      };
      commit((d) => { d.releases = [...d.releases, r]; });
      return r;
    },

    deleteRelease: (id) => {
      commit((d) => {
        d.releases = d.releases.filter((r) => r.id !== id);
        d.items = d.items.filter((i) => i.releaseId !== id);
      });
    },

    setCodeFreeze: (releaseId, codeFreezeISO) => {
      commit((d) => {
        d.releases = d.releases.map((r) => (r.id === releaseId ? { ...r, codeFreezeISO } : r));
      });
    },

    setAutoSync: (releaseId, minutes) => {
      commit((d) => {
        d.releases = d.releases.map((r) =>
          r.id === releaseId ? { ...r, autoSyncMinutes: minutes && minutes > 0 ? minutes : null } : r,
        );
      });
    },

    createWorkStream: (releaseId, name) => {
      if (!release(releaseId)) return null;
      const ws: WorkStream = { id: uid('ws'), name: name || 'Untitled stream', externalId: null, engineersRequired: null, planningState: 'open', build: null, externalUrl: null, attributes: {} };
      commit((d) => {
        d.releases = d.releases.map((r) =>
          r.id === releaseId ? { ...r, workStreams: [...r.workStreams, ws] } : r,
        );
      });
      return ws;
    },

    updateWorkStream: (releaseId, wsId, patch) => {
      commit((d) => {
        d.releases = d.releases.map((r) =>
          r.id === releaseId
            ? { ...r, workStreams: r.workStreams.map((ws) => (ws.id === wsId ? { ...ws, ...patch } : ws)) }
            : r,
        );
      });
    },

    createEvent: (releaseId, { label, dateISO }) => {
      if (!release(releaseId)) return;
      const ev = { id: uid('ev'), label: label || 'Event', dateISO: dateISO || todayISO(), externalId: null };
      commit((d) => {
        d.releases = d.releases.map((r) =>
          r.id === releaseId ? { ...r, events: [...r.events, ev] } : r,
        );
      });
    },

    updateEvent: (releaseId, eventId, patch) => {
      commit((d) => {
        d.releases = d.releases.map((r) =>
          r.id === releaseId
            ? { ...r, events: r.events.map((e) => (e.id === eventId ? { ...e, ...patch } : e)) }
            : r,
        );
      });
    },

    deleteEvent: (releaseId, eventId) => {
      commit((d) => {
        d.releases = d.releases.map((r) =>
          r.id === releaseId ? { ...r, events: r.events.filter((e) => e.id !== eventId) } : r,
        );
      });
    },

    updateSprint: (releaseId, sprintId, patch) => {
      commit((d) => {
        d.releases = d.releases.map((r) =>
          r.id === releaseId
            ? { ...r, sprints: r.sprints.map((s) => (s.id === sprintId ? { ...s, ...patch } : s)) }
            : r,
        );
      });
    },

    createItem: (releaseId, { workStreamId, sprintId, subject, description, status, points, assignedMemberId, itemType }) => {
      const r = release(releaseId);
      if (!r) return null;
      const prefix = (r.name.match(/[A-Za-z]/g) || ['I']).slice(0, 3).join('').toUpperCase();
      const count = ctx.snapshot().items.filter((i) => i.releaseId === releaseId).length;
      const it: WorkItem = {
        id: uid('it'),
        releaseId,
        workStreamId,
        sprintId,
        key: `${prefix}-${100 + count}`,
        subject: subject || 'Untitled item',
        description: description || '',
        descriptionFormat: 'html', // new local items use the rich-text editor
        status: status || 'Not Started',
        points: points ?? null,
        externalId: null,
        assignedMemberId: assignedMemberId ?? null,
        build: null,
        externalUrl: null,
        dirtyFields: [],
        syncedValues: null,
        itemType: itemType ?? null,
        statusNative: null,
        attributes: {},
      };
      commit((d) => { d.items = [...d.items, it]; });
      return it;
    },

    updateItem: (id, patch) => {
      commit((d) => {
        d.items = d.items.map((i) => (i.id === id ? { ...i, ...patch } : i));
      });
    },

    moveItemToSprint: (id, sprintId) => {
      commit((d) => {
        d.items = d.items.map((i) => {
          if (i.id !== id || i.sprintId === sprintId) return i;
          const next: WorkItem = { ...i, sprintId };
          // Synced items track the sprint change for push-back, measured against the
          // synced baseline — moving back to the synced sprint clears the dirty flag.
          if (i.externalId && i.syncedValues && 'sprint' in i.syncedValues) {
            const sprintDirty = sprintId !== i.syncedValues.sprint;
            const has = i.dirtyFields.includes('sprint');
            if (sprintDirty && !has) next.dirtyFields = [...i.dirtyFields, 'sprint'];
            else if (!sprintDirty && has) next.dirtyFields = i.dirtyFields.filter((f) => f !== 'sprint');
          }
          return next;
        });
      });
    },

    revertItem: (id) => {
      commit((d) => {
        d.items = d.items.map((i) => {
          if (i.id !== id || !i.syncedValues || i.dirtyFields.length === 0) return i;
          const next: WorkItem = { ...i, dirtyFields: [] };
          for (const f of i.dirtyFields) {
            if (!(f in i.syncedValues)) continue; // no baseline for this field — keep local
            if (f === 'points') next.points = (i.syncedValues.points as number | null) ?? null;
            else if (f === 'sprint') next.sprintId = (i.syncedValues.sprint as string | null) ?? null;
            else if (f === 'status') {
              // Baseline holds the native status id (or a bare category when the
              // connector has no vocabulary). Resolve through the release's
              // vocabulary snapshot to restore both the category and the label.
              const v = i.syncedValues.status;
              const vocab = d.releases.find((r) => r.id === i.releaseId)?.catalog?.statuses ?? [];
              const def = vocab.find((sd) => sd.id === v);
              if (def) {
                next.status = def.category;
                next.statusNative = { id: def.id, label: def.label };
              } else if (typeof v === 'string' && (STATUSES as readonly string[]).includes(v)) {
                next.status = v as Status;
                next.statusNative = null;
              }
            } else next.attributes = { ...next.attributes, [f]: i.syncedValues[f] };
          }
          return next;
        });
      });
    },

    createConnectorItem: (releaseId, draft) => {
      const r = release(releaseId);
      if (!r || !r.connector) return null;
      // Local-only: a pendingCreate placeholder shown at once and sent on the next
      // Push. externalId/key are assigned at reconcile time; until then the key is a
      // provisional local ref so the board and push preview have something to show.
      const prefix = (r.name.match(/[A-Za-z]/g) || ['I']).slice(0, 3).join('').toUpperCase();
      const count = ctx.snapshot().items.filter((i) => i.releaseId === releaseId).length;
      const it: WorkItem = {
        id: uid('it'),
        releaseId,
        workStreamId: draft.workStreamId,
        sprintId: draft.sprintId,
        key: `${prefix}-new-${count + 1}`,
        subject: draft.subject || 'Untitled item',
        description: draft.description || '',
        descriptionFormat: draft.descriptionFormat,
        status: draft.status,
        points: draft.points ?? null,
        externalId: null,
        assignedMemberId: draft.assignedMemberId ?? null,
        build: null,
        externalUrl: null,
        dirtyFields: [],
        syncedValues: null,
        itemType: draft.itemType,
        statusNative: null,
        attributes: draft.attributes,
        pendingCreate: true,
      };
      commit((d) => { d.items = [...d.items, it]; });
      return it;
    },

    discardPendingCreate: (id) => {
      commit((d) => { d.items = d.items.filter((i) => !(i.id === id && i.pendingCreate)); });
    },

    syncRelease: async (releaseId) => {
      const r = release(releaseId);
      if (!r) return { ok: false, reason: 'error', message: 'Release not found' };
      if (!r.connector) return { ok: false, reason: 'no-connector', message: 'Release is not connected' };

      const stamp = () => new Date().toISOString();
      try {
        // Fetch the connector's writeable field list so dirty-aware pull knows what to preserve.
        const connectors = await syncClient.listConnectors();
        const meta = connectors.find((c) => c.type === r.connector!.type);
        const writeableItemFields = [...allWriteableLocalFields(meta?.itemTypes)];

        const mapped = await syncClient.sync(r.connector);
        const { next: synced, result } = applySync(ctx.snapshot(), releaseId, mapped, writeableItemFields);
        // Freeze the baseline of any sprint already underway in the just-synced data.
        const next = stampStartedSprints(synced);
        const at = stamp();
        next.meta = { ...next.meta, lastSyncISO: at };
        next.releases = next.releases.map((rel) =>
          rel.id === releaseId
            ? {
                ...rel,
                sync: { lastISO: at, state: 'ok' as const, message: `${result.created} new, ${result.updated} updated` },
                // Snapshot the vocabulary the items were just interpreted under, so
                // attributes + native statuses stay renderable offline and across
                // catalog changes.
                catalog: meta
                  ? {
                      itemTypes: meta.itemTypes ?? [],
                      statuses: meta.statuses ?? [],
                      workStreamFields: meta.workStreamFields ?? [],
                    }
                  : null,
              }
            : rel,
        );
        ctx.replace(next);
        window.dispatchEvent(new CustomEvent('release-tracker:sync', { detail: { snapshot: next } }));
        return { ok: true, result };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        commit((d) => {
          d.releases = d.releases.map((rel) =>
            rel.id === releaseId ? { ...rel, sync: { lastISO: stamp(), state: 'error', message } } : rel,
          );
        });
        return { ok: false, reason: 'error', message };
      }
    },

    pushRelease: async (releaseId) => {
      const r = release(releaseId);
      if (!r) return { ok: false, reason: 'error', message: 'Release not found' };
      if (!r.connector) return { ok: false, reason: 'no-connector', message: 'Release is not connected' };
      const connector = r.connector;

      const stamp = () => new Date().toISOString();
      try {
        const connectors = await syncClient.listConnectors();
        const meta = connectors.find((c) => c.type === connector.type);
        const members = ctx.snapshot().teams.find((t) => t.id === r.teamId)?.members ?? [];
        const refs = { sprints: r.sprints, workStreams: r.workStreams, members };

        // The push queue has two kinds of work: edits to already-synced items, and
        // items created locally but not yet sent (pendingCreate).
        const allItems = ctx.snapshot().items;
        const dirtyItems = allItems.filter((i) => i.releaseId === releaseId && i.externalId !== null && i.dirtyFields.length > 0);
        const pendingItems = allItems.filter((i) => i.releaseId === releaseId && i.pendingCreate);
        const changes = buildPushChanges(dirtyItems, refs, meta?.itemTypes);

        if (changes.length === 0 && pendingItems.length === 0) {
          return { ok: false, reason: 'nothing-to-push', message: 'No pending changes to push' };
        }

        // 1) Edits — one batched push; clear dirtyFields and advance the synced
        // baseline on success (the external system now matches).
        let pushed = 0;
        if (changes.length > 0) {
          const result = await syncClient.push(connector, changes);
          pushed = result.pushed;
          const pushedExternalIds = new Set(changes.map((c) => c.externalId));
          commit((d) => {
            d.items = d.items.map((i) => {
              if (!(i.releaseId === releaseId && i.externalId && pushedExternalIds.has(i.externalId))) return i;
              const baseline = canonicalBaseline(i, writeableLocalFieldsForItem(i, meta?.itemTypes), i.attributes);
              return { ...i, dirtyFields: [], syncedValues: baseline };
            });
          });
        }

        // 2) Queued creates — send each, then swap the placeholder for the reconciled
        // synced item (matched by the assigned externalId). A failed create leaves its
        // placeholder queued so nothing is lost.
        const writeableItemFields = [...allWriteableLocalFields(meta?.itemTypes)];
        let created = 0;
        const createErrors: string[] = [];
        for (const p of pendingItems) {
          try {
            const mapped = await syncClient.createItem(connector, buildCreateRequest(p, refs, meta?.itemTypes));
            const base = ctx.snapshot();
            const withoutPlaceholder = { ...base, items: base.items.filter((i) => i.id !== p.id) };
            const { next, item, warning } = applyCreatedItem(withoutPlaceholder, releaseId, mapped, writeableItemFields);
            if (!item) {
              createErrors.push(warning ?? `Could not place created item ${p.key}`);
              continue; // placeholder stays (base still holds it) — don't drop the queued create
            }
            ctx.replace(next);
            created++;
          } catch (e) {
            createErrors.push(`${p.subject}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }

        const at = stamp();
        const parts: string[] = [];
        if (pushed > 0) parts.push(`${pushed} change${pushed !== 1 ? 's' : ''} pushed`);
        if (created > 0) parts.push(`${created} created`);
        const summary = parts.join(', ') || 'Nothing pushed';
        commit((d) => {
          d.releases = d.releases.map((rel) =>
            rel.id === releaseId
              ? {
                  ...rel,
                  sync: {
                    lastISO: at,
                    state: createErrors.length ? ('error' as const) : ('ok' as const),
                    message: createErrors.length ? createErrors.join('; ') : summary,
                  },
                }
              : rel,
          );
        });

        // A total failure (nothing pushed, nothing created, only errors) is reported as
        // an error; partial success still returns ok with the failure count/messages.
        if (createErrors.length > 0 && pushed === 0 && created === 0) {
          return { ok: false, reason: 'error', message: createErrors.join('; ') };
        }
        return { ok: true, result: { pushed: pushed + created, failed: createErrors.length, errors: createErrors } };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        commit((d) => {
          d.releases = d.releases.map((rel) =>
            rel.id === releaseId ? { ...rel, sync: { lastISO: stamp(), state: 'error', message } } : rel,
          );
        });
        return { ok: false, reason: 'error', message };
      }
    },
  };
}
