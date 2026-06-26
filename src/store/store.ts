// Typed Zustand store — port of the Store singleton in proto-store.jsx.
// Keeps localStorage persistence and the sync() seam so a real backend can
// replace it later. State is treated immutably so React re-renders correctly.

import { create } from 'zustand';
import {
  SCHEMA_VERSION,
  SPRINT_LEN_DAYS,
  type AppState,
  type ItemType,
  type Member,
  type Release,
  STATUSES,
  type ReleaseCatalog,
  type ReleaseConnector,
  type ReleaseEvent,
  type Sprint,
  type Status,
  type Team,
  type WorkItem,
  type WorkStream,
} from '../types';
import { buildSprints, dOf, todayISO, uid } from '../lib/dates';
import { sprintVel } from '../lib/derive';
import { seed } from '../lib/seed';
import { applyCreatedItem, applySync } from '../sync/applySync';
import { buildPushChanges } from '../sync/push';
import { allWriteableLocalFields, canonicalBaseline, writeableLocalFieldsForItem } from '../lib/connectorFields';
import { syncClient, SyncValidationError, type CreateItemInput } from '../sync/client';
import type { PushResult, SyncResult } from '../sync/schema';
import type { SharePayload } from '../lib/shareRelease';

/** Result of a sync attempt, shaped so the UI can craft a precise toast. */
export type SyncOutcome =
  | { ok: true; result: SyncResult }
  | { ok: false; reason: 'no-connector' | 'error'; message: string };

/** Result of a push attempt. */
export type PushOutcome =
  | { ok: true; result: PushResult }
  | { ok: false; reason: 'no-connector' | 'nothing-to-push' | 'error'; message: string };

/** Result of creating an item on a connector release. `validation` failures carry
 *  the service's field-keyed errors so the form can mark the offending inputs. */
export type CreateItemOutcome =
  | { ok: true; item: WorkItem }
  | { ok: false; reason: 'no-connector' | 'validation' | 'error'; message: string; fieldErrors?: { field: string; message: string }[] };

export const LS_KEY = 'release-tracker:v1';

// Migrate a persisted state forward to the current SCHEMA_VERSION. Returns null
// if the stored shape is too old/unknown to upgrade safely.
export function migrate(p: AppState): AppState | null {
  let s = p;
  // v1 → v2: connector sync. Releases gain `connector`/`sync` (default null).
  if (s.version === 1) {
    s = {
      ...s,
      version: 2,
      releases: s.releases.map((r) => ({ ...r, connector: r.connector ?? null, sync: r.sync ?? null })),
    };
  }
  // v2 → v3: sprints keyed by string id (was positional `n`); items reference
  // sprints by `sprintId` (was `sprintN`, with 0 meaning backlog → null).
  if (s.version === 2) {
    const releaseSprintMap = new Map<string, Map<number, string>>();
    const releases = s.releases.map((r) => {
      const nToId = new Map<number, string>();
      const sprints = r.sprints.map((sp: any) => {
        const id = uid('sp');
        nToId.set(sp.n, id);
        const { n, ...rest } = sp;
        return { ...rest, id };
      });
      releaseSprintMap.set(r.id, nToId);
      return { ...r, sprints };
    });
    const items = s.items.map((it: any) => {
      const nToId = releaseSprintMap.get(it.releaseId);
      const sprintId = it.sprintN === 0 ? null : (nToId?.get(it.sprintN) ?? null);
      const { sprintN, ...rest } = it;
      return { ...rest, sprintId };
    });
    s = { ...s, version: 3, releases, items };
  }
  // v3 → v4: work items gain assignedMemberId and dirtyFields.
  if (s.version === 3) {
    s = {
      ...s,
      version: 4,
      items: s.items.map((it) => ({
        ...it,
        assignedMemberId: (it as any).assignedMemberId ?? null,
        dirtyFields: (it as any).dirtyFields ?? [],
      })),
    };
  }
  // v4 → v5: work items gain build (cross-release patch label, set by connector).
  if (s.version === 4) {
    s = {
      ...s,
      version: 5,
      items: s.items.map((it) => ({ ...it, build: (it as any).build ?? null })),
    };
  }
  // v5 → v6: workStreamId becomes string | null (existing items are unchanged).
  if (s.version === 5) {
    s = { ...s, version: 6 };
  }
  // v6 → v7: work items gain descriptionFormat (default 'text').
  if (s.version === 6) {
    s = {
      ...s,
      version: 7,
      items: s.items.map((it) => ({ ...it, descriptionFormat: (it as any).descriptionFormat ?? 'text' })),
    };
  }
  // v7 → v8: members gain nonContributing (default false); items gain itemType (default null).
  if (s.version === 7) {
    s = {
      ...s,
      version: 8,
      teams: s.teams.map((t) => ({
        ...t,
        members: t.members.map((m) => ({ ...m, nonContributing: (m as any).nonContributing ?? false })),
      })),
      items: s.items.map((it) => ({ ...it, itemType: (it as any).itemType ?? null })),
    };
  }
  // v8 → v9: 'Active' status renamed to 'In Progress'; 'Under Review' added as a new status.
  if (s.version === 8) {
    s = {
      ...s,
      version: 9,
      items: s.items.map((it) => ({
        ...it,
        status: (it.status as string) === 'Active' ? 'In Progress' : it.status,
      })),
    };
  }
  // v9 → v10: work streams gain engineersRequired (app-owned enrichment; default null).
  if (s.version === 9) {
    s = {
      ...s,
      version: 10,
      releases: s.releases.map((r) => ({
        ...r,
        workStreams: r.workStreams.map((ws) => ({ ...ws, engineersRequired: (ws as any).engineersRequired ?? null })),
      })),
    };
  }
  // v10 → v11: synced work items gain syncedValues — the last connector value for
  // the writeable fields (points, sprint), used to preview/revert pending pushes.
  // Seed from the current value (best available baseline for already-stored items).
  if (s.version === 10) {
    s = {
      ...s,
      version: 11,
      items: s.items.map((it) => ({
        ...it,
        syncedValues:
          (it as any).syncedValues ??
          (it.externalId != null ? { points: it.points, sprintId: it.sprintId } : null),
      })),
    };
  }
  // v11 → v12: work streams gain build (connector-owned provenance; null = native
  // to this release). Existing streams are treated as native.
  if (s.version === 11) {
    s = {
      ...s,
      version: 12,
      releases: s.releases.map((r) => ({
        ...r,
        workStreams: r.workStreams.map((ws) => ({ ...ws, build: (ws as any).build ?? null })),
      })),
    };
  }
  // v12 → v13: items and work streams gain attributes (connector vocabulary,
  // default {}); releases gain catalog (itemTypes snapshot, default null).
  if (s.version === 12) {
    s = {
      ...s,
      version: 13,
      releases: s.releases.map((r) => ({
        ...r,
        catalog: r.catalog ?? null,
        workStreams: r.workStreams.map((ws) => ({ ...ws, attributes: ws.attributes ?? {} })),
      })),
      items: s.items.map((it) => ({ ...it, attributes: it.attributes ?? {} })),
    };
  }
  // v13 → v14: syncedValues becomes a record keyed by local dirty-field name
  // ('points', 'sprint', writeable vocabulary keys). The old fixed pair migrates
  // key-for-key; attribute baselines accrue on the next sync/push.
  if (s.version === 13) {
    s = {
      ...s,
      version: 14,
      items: s.items.map((it) => {
        const sv = it.syncedValues as unknown as { points: number; sprintId: string | null } | null | undefined;
        return {
          ...it,
          syncedValues: sv == null ? (sv ?? null) : 'sprintId' in sv ? { points: sv.points, sprint: sv.sprintId } : sv,
        };
      }),
    };
  }
  // v14 → v15: status vocabulary. Items gain statusNative (default null); the
  // release catalog snapshot grows from a bare itemTypes array to
  // { itemTypes, statuses } (existing snapshots wrap with an empty vocabulary —
  // refreshed on the next sync).
  if (s.version === 14) {
    s = {
      ...s,
      version: 15,
      releases: s.releases.map((r) => {
        const cat = r.catalog as unknown;
        return {
          ...r,
          catalog: cat == null ? null : Array.isArray(cat) ? { itemTypes: cat, statuses: [] } : (cat as ReleaseCatalog),
        };
      }),
      items: s.items.map((it) => ({ ...it, statusNative: it.statusNative ?? null })),
    };
  }
  // v15 → v16: connector-provided deep links. Work items and work streams gain
  // externalUrl (default null); populated on the next sync (external wins).
  if (s.version === 15) {
    s = {
      ...s,
      version: 16,
      releases: s.releases.map((r) => ({
        ...r,
        workStreams: r.workStreams.map((ws) => ({ ...ws, externalUrl: (ws as any).externalUrl ?? null })),
      })),
      items: s.items.map((it) => ({ ...it, externalUrl: (it as any).externalUrl ?? null })),
    };
  }
  // v16 → v17: points becomes number | null; 0 was the "unset" sentinel, now null.
  if (s.version === 16) {
    s = {
      ...s,
      version: 17,
      items: s.items.map((it) => ({ ...it, points: (it as any).points === 0 ? null : (it as any).points })),
    };
  }
  // v17 → v18: releases gain a uniform sprintLengthDays. Derive it from the first
  // sprint's calendar span when sprints exist; otherwise fall back to the default.
  if (s.version === 17) {
    s = {
      ...s,
      version: 18,
      releases: s.releases.map((r) => {
        const sp = r.sprints[0];
        const len = sp
          ? Math.round((dOf(sp.endISO).getTime() - dOf(sp.startISO).getTime()) / 86400000) + 1
          : SPRINT_LEN_DAYS;
        return { ...r, sprintLengthDays: (r as any).sprintLengthDays ?? len };
      }),
    };
  }
  // v18 → v19: sprints gain a point-in-time plannedVelocity baseline (app-owned,
  // frozen once a sprint starts). Backfill: stamp every already-started sprint
  // (startISO <= today) with its current derived velocity so existing attainment
  // history is preserved as a fact; future sprints stay null (derive live). New
  // crossings are handled lazily by stampStartedSprints on every load.
  if (s.version === 18) {
    const today = todayISO();
    s = {
      ...s,
      version: 19,
      releases: s.releases.map((r) => {
        const team = s.teams.find((t) => t.id === r.teamId);
        return {
          ...r,
          sprints: r.sprints.map((sp) => ({
            ...sp,
            plannedVelocity:
              (sp as any).plannedVelocity ?? (sp.startISO <= today ? sprintVel(team, sp, sp.daysOff) : null),
          })),
        };
      }),
    };
  }
  // v19 → v20: work streams gain planningMuted (app-owned enrichment for the
  // planning-runway alarm; default false). Existing streams are unmuted.
  if (s.version === 19) {
    s = {
      ...s,
      version: 20,
      releases: s.releases.map((r) => ({
        ...r,
        workStreams: r.workStreams.map((ws) => ({ ...ws, planningMuted: (ws as any).planningMuted ?? false })),
      })),
    };
  }
  return s.version === SCHEMA_VERSION ? s : null;
}

/**
 * Freeze the planned-velocity baseline of any sprint whose window has begun
 * (startISO <= today) and that isn't already stamped. This is the lazy "stamp on
 * start" trigger from docs/metrics.md: run on every load and after each sync, it
 * captures the sprint's commitment at the current team velocity exactly once.
 * After stamping, editing `team.velocity` only moves not-yet-started sprints —
 * the property the velocity "Apply" action relies on. Returns the same reference
 * when nothing changed, so callers can skip a redundant persist.
 */
export function stampStartedSprints(state: AppState, today: string = todayISO()): AppState {
  let changed = false;
  const releases = state.releases.map((r) => {
    const team = state.teams.find((t) => t.id === r.teamId);
    let touched = false;
    const sprints = r.sprints.map((sp) => {
      if (sp.plannedVelocity == null && sp.startISO <= today) {
        touched = true;
        return { ...sp, plannedVelocity: sprintVel(team, sp, sp.daysOff) };
      }
      return sp;
    });
    if (!touched) return r;
    changed = true;
    return { ...r, sprints };
  });
  return changed ? { ...state, releases } : state;
}

/** Read persisted state from localStorage, migrating it forward if needed.
 *  Falls back to fresh seed data on a missing/corrupt/too-old store. */
export function load(): AppState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as AppState;
      const current = p?.version === SCHEMA_VERSION ? p : p && migrate(p);
      // Freeze any sprint that has started since the last load (lazy stamp-on-start).
      if (current) return stampStartedSprints(current);
    }
  } catch {
    /* ignore */
  }
  // Seed builds sprints with null baselines; stamp the ones already underway.
  return stampStartedSprints(seed());
}

/** Write the data slice to localStorage. Silently no-ops if storage is unavailable. */
export function persist(state: AppState) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

/** All state mutations, grouped under `store.actions`. Each commits immutably,
 *  persists to localStorage, and triggers a re-render. CRUD entries are named for
 *  their effect; non-obvious ones (move/revert/sync/push) carry their own docs. */
interface Actions {
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
  createWorkStream: (releaseId: string, name: string) => WorkStream | null;
  updateWorkStream: (releaseId: string, wsId: string, patch: Partial<Pick<WorkStream, 'name' | 'engineersRequired' | 'planningMuted'>>) => void;
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
  /** Create a work item on a connector release via the sync service, then reconcile
   *  the returned item into local state as a synced item. No-op for Local releases. */
  createConnectorItem: (releaseId: string, req: CreateItemInput) => Promise<CreateItemOutcome>;
  /** Pull from this release's connector and upsert the result. No-op for Local releases. */
  syncRelease: (releaseId: string) => Promise<SyncOutcome>;
  /** Push locally-dirty writeable fields back to the external system. */
  pushRelease: (releaseId: string) => Promise<PushOutcome>;
}

/** The Zustand store value: the persisted {@link AppState} plus the {@link Actions}
 *  that mutate it. Components select slices via {@link useStore}. */
type StoreState = AppState & { actions: Actions };

// helper: shallow-clone the data slice for an immutable update
function snapshot(s: StoreState): AppState {
  return { version: s.version, teams: s.teams, releases: s.releases, items: s.items, meta: s.meta };
}

/** The application store. Initialized from {@link load} (and written back on first
 *  run), then every action persists through the `commit` helper. This is the seam
 *  a real backend would slot behind in place of localStorage + the sync client. */
export const useStore = create<StoreState>((set, get) => {
  const initial = load();
  persist(initial); // ensure first-run seed is written, matching the prototype

  // commit a mutated-in-place data slice: persist + trigger a re-render
  const commit = (mutate: (data: AppState) => void) => {
    const data = snapshot(get());
    mutate(data);
    persist(data);
    set({ ...data });
  };

  const release = (id: string) => get().releases.find((r) => r.id === id);

  const actions: Actions = {
    reset: () => {
      const fresh = seed();
      persist(fresh);
      set({ ...fresh });
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
            planningMuted: false,
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
        externalId: null,
        connector: payload.connector,
        sync: null,
        // Nominal only — a connector's actual sprints arrive (and may vary) on sync.
        sprintLengthDays: SPRINT_LEN_DAYS,
        catalog: null,
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

    createWorkStream: (releaseId, name) => {
      if (!release(releaseId)) return null;
      const ws: WorkStream = { id: uid('ws'), name: name || 'Untitled stream', externalId: null, engineersRequired: null, planningMuted: false, build: null, externalUrl: null, attributes: {} };
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
      const count = get().items.filter((i) => i.releaseId === releaseId).length;
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

    createConnectorItem: async (releaseId, req) => {
      const r = release(releaseId);
      if (!r) return { ok: false, reason: 'error', message: 'Release not found' };
      if (!r.connector) return { ok: false, reason: 'no-connector', message: 'Release is not connected' };

      try {
        // The connector's writeable fields drive the created item's dirty baseline.
        const connectors = await syncClient.listConnectors();
        const meta = connectors.find((c) => c.type === r.connector!.type);
        const writeableItemFields = [...allWriteableLocalFields(meta?.itemTypes)];

        const mapped = await syncClient.createItem(r.connector, req);
        const { next, item, warning } = applyCreatedItem(snapshot(get()), releaseId, mapped, writeableItemFields);
        if (!item) return { ok: false, reason: 'error', message: warning ?? 'Created item could not be placed' };
        persist(next);
        set({ ...next });
        return { ok: true, item };
      } catch (e) {
        if (e instanceof SyncValidationError) {
          return { ok: false, reason: 'validation', message: e.message, fieldErrors: e.fieldErrors };
        }
        return { ok: false, reason: 'error', message: e instanceof Error ? e.message : String(e) };
      }
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
        const { next: synced, result } = applySync(snapshot(get()), releaseId, mapped, writeableItemFields);
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
                catalog: meta ? { itemTypes: meta.itemTypes ?? [], statuses: meta.statuses ?? [] } : null,
              }
            : rel,
        );
        persist(next);
        set({ ...next });
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

      const stamp = () => new Date().toISOString();
      try {
        const connectors = await syncClient.listConnectors();
        const meta = connectors.find((c) => c.type === r.connector!.type);

        const releaseItems = get().items.filter((i) => i.releaseId === releaseId && i.externalId !== null && i.dirtyFields.length > 0);
        if (releaseItems.length === 0) {
          return { ok: false, reason: 'nothing-to-push', message: 'No pending changes to push' };
        }

        const members = get().teams.find((t) => t.id === r.teamId)?.members ?? [];
        const changes = buildPushChanges(releaseItems, { sprints: r.sprints, workStreams: r.workStreams, members }, meta?.itemTypes);
        if (changes.length === 0) {
          return { ok: false, reason: 'nothing-to-push', message: 'No writeable changes to push' };
        }

        const result = await syncClient.push(r.connector, changes);
        const at = stamp();

        // Clear dirtyFields on successfully pushed items, and advance the synced
        // baseline to the just-pushed values (the external system now matches).
        const pushedExternalIds = new Set(changes.map((c) => c.externalId));
        commit((d) => {
          d.items = d.items.map((i) => {
            if (!(i.releaseId === releaseId && i.externalId && pushedExternalIds.has(i.externalId))) return i;
            const baseline = canonicalBaseline(i, writeableLocalFieldsForItem(i, meta?.itemTypes), i.attributes);
            return { ...i, dirtyFields: [], syncedValues: baseline };
          });
          d.releases = d.releases.map((rel) =>
            rel.id === releaseId
              ? { ...rel, sync: { lastISO: at, state: 'ok' as const, message: `Pushed ${result.pushed} change${result.pushed !== 1 ? 's' : ''}` } }
              : rel,
          );
        });

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
  };

  return { ...initial, actions };
});

// Non-reactive accessors — for reading state / firing actions outside React
// render (event handlers, drag-and-drop, async flows) without subscribing.
export const getState = () => useStore.getState();
export const getActions = () => useStore.getState().actions;

// ---- selectors (pure; take the current state) ----
// Small lookups over an AppState snapshot. Pure so they can run inside useStore
// selectors (reactive) or against a plain snapshot (tests, async flows) alike.
export const selTeam = (s: AppState, id: string | undefined): Team | undefined =>
  s.teams.find((t) => t.id === id);
export const selRelease = (s: AppState, id: string | undefined): Release | undefined =>
  s.releases.find((r) => r.id === id);
export const selItemsFor = (s: AppState, releaseId: string): WorkItem[] =>
  s.items.filter((i) => i.releaseId === releaseId);
export const selItemsForStream = (s: AppState, releaseId: string, wsId: string): WorkItem[] =>
  s.items.filter((i) => i.releaseId === releaseId && i.workStreamId === wsId);
export const selUnassignedItems = (s: AppState, releaseId: string): WorkItem[] =>
  s.items.filter((i) => i.releaseId === releaseId && i.workStreamId === null);
export const selItem = (s: AppState, id: string): WorkItem | undefined =>
  s.items.find((i) => i.id === id);

/** Count of dirty (pending push) synced items for a release. */
export const selDirtyCount = (s: AppState, releaseId: string): number =>
  s.items.filter((i) => i.releaseId === releaseId && i.externalId !== null && i.dirtyFields.length > 0).length;

export type { Member };
