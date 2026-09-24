// Forward migration of persisted state, v1 through the current SCHEMA_VERSION.
//
// Each step upgrades one version and only that version, so a store written by any
// past build walks forward through every intervening step in order. A step never
// reads `SCHEMA_VERSION` — it names its own source and target — which is what lets
// steps be appended without revisiting the ones before them.
//
// Migrations necessarily read fields that older versions carried but the current
// types no longer declare. That is what `legacy()` is for: it types the read at
// the point of use instead of casting whole records to `any`.

import {
  SCHEMA_VERSION,
  SPRINT_LEN_DAYS,
  type AppState,
  type ReleaseCatalog,
  type Sprint,
  type WorkItem,
  type WorkStream,
} from '../types';
import { dOf, todayISO, uid } from '../lib/dates';
import { sprintVel } from '../lib/derive';

/**
 * Read a field an older schema version carried but the current type no longer
 * declares. Returns undefined when absent, so `legacy(...) ?? fallback` reads as
 * the backfill it is.
 */
function legacy<V>(record: object, key: string): V | undefined {
  return (record as Record<string, unknown>)[key] as V | undefined;
}

/**
 * A parsed store of some past (or current) schema version. Only `version` is
 * guaranteed — every other field is whatever that version wrote, and is read by
 * the step that understands it.
 *
 * Typing the parameter as `AppState` would claim migrate only accepts stores
 * already in the current shape, which is the opposite of its job, and forced
 * every caller and test to cast.
 */
export type PersistedState = { version: number } & Record<string, unknown>;

/** Migrate a persisted state forward to the current SCHEMA_VERSION. Returns null
 *  if the stored shape is too old or unknown to upgrade safely. */
export function migrate(persisted: PersistedState): AppState | null {
  // Steps below read through the current types plus legacy(); the input is only
  // loosely typed at the boundary because that is where the uncertainty is.
  let s = persisted as unknown as AppState;

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
    type SprintV2 = Omit<Sprint, 'id'> & { n: number };
    type ItemV2 = Omit<WorkItem, 'sprintId'> & { sprintN: number };

    const releaseSprintMap = new Map<string, Map<number, string>>();
    const releases = s.releases.map((r) => {
      const nToId = new Map<number, string>();
      const sprints = r.sprints.map((raw) => {
        const { n, ...rest } = raw as unknown as SprintV2;
        const id = uid('sp');
        nToId.set(n, id);
        return { ...rest, id } as Sprint;
      });
      releaseSprintMap.set(r.id, nToId);
      return { ...r, sprints };
    });
    const items = s.items.map((raw) => {
      const { sprintN, ...rest } = raw as unknown as ItemV2;
      const nToId = releaseSprintMap.get(rest.releaseId);
      const sprintId = sprintN === 0 ? null : (nToId?.get(sprintN) ?? null);
      return { ...rest, sprintId } as WorkItem;
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
        assignedMemberId: legacy<string | null>(it, 'assignedMemberId') ?? null,
        dirtyFields: legacy<string[]>(it, 'dirtyFields') ?? [],
      })),
    };
  }

  // v4 → v5: work items gain build (cross-release patch label, set by connector).
  if (s.version === 4) {
    s = {
      ...s,
      version: 5,
      items: s.items.map((it) => ({ ...it, build: legacy<string | null>(it, 'build') ?? null })),
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
      items: s.items.map((it) => ({
        ...it,
        descriptionFormat: legacy<'text' | 'html'>(it, 'descriptionFormat') ?? 'text',
      })),
    };
  }

  // v7 → v8: members gain nonContributing (default false); items gain itemType (default null).
  if (s.version === 7) {
    s = {
      ...s,
      version: 8,
      teams: s.teams.map((t) => ({
        ...t,
        members: t.members.map((m) => ({ ...m, nonContributing: legacy<boolean>(m, 'nonContributing') ?? false })),
      })),
      items: s.items.map((it) => ({ ...it, itemType: legacy<WorkItem['itemType']>(it, 'itemType') ?? null })),
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
        workStreams: r.workStreams.map((ws) => ({
          ...ws,
          engineersRequired: legacy<number | null>(ws, 'engineersRequired') ?? null,
        })),
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
          legacy<WorkItem['syncedValues']>(it, 'syncedValues') ??
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
        workStreams: r.workStreams.map((ws) => ({ ...ws, build: legacy<string | null>(ws, 'build') ?? null })),
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
    type SyncedV13 = { points: number; sprintId: string | null };
    s = {
      ...s,
      version: 14,
      items: s.items.map((it) => {
        const sv = it.syncedValues as unknown as SyncedV13 | null | undefined;
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
          catalog:
            cat == null
              ? null
              : Array.isArray(cat)
                ? { itemTypes: cat, statuses: [], workStreamFields: [] }
                : (cat as ReleaseCatalog),
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
        workStreams: r.workStreams.map((ws) => ({ ...ws, externalUrl: legacy<string | null>(ws, 'externalUrl') ?? null })),
      })),
      items: s.items.map((it) => ({ ...it, externalUrl: legacy<string | null>(it, 'externalUrl') ?? null })),
    };
  }

  // v16 → v17: points becomes number | null; 0 was the "unset" sentinel, now null.
  if (s.version === 16) {
    s = {
      ...s,
      version: 17,
      items: s.items.map((it) => ({ ...it, points: it.points === 0 ? null : it.points })),
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
        return { ...r, sprintLengthDays: legacy<number>(r, 'sprintLengthDays') ?? len };
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
              legacy<number | null>(sp, 'plannedVelocity') ??
              (sp.startISO <= today ? sprintVel(team, sp, sp.daysOff) : null),
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
        workStreams: r.workStreams.map((ws) => ({ ...ws, planningMuted: legacy<boolean>(ws, 'planningMuted') ?? false })),
      })),
    };
  }

  // v20 → v21: the release catalog snapshot grows workStreamFields (the connector's
  // work-stream field catalog; empty until the next sync refreshes the snapshot).
  if (s.version === 20) {
    s = {
      ...s,
      version: 21,
      releases: s.releases.map((r) => ({
        ...r,
        catalog:
          r.catalog == null
            ? null
            : { ...r.catalog, workStreamFields: legacy<ReleaseCatalog['workStreamFields']>(r.catalog, 'workStreamFields') ?? [] },
      })),
    };
  }

  // v21 → v22: releases gain codeFreezeISO (default null = last-sprint default,
  // no artificial cutoff); work streams gain an optional per-stream override.
  if (s.version === 21) {
    s = {
      ...s,
      version: 22,
      releases: s.releases.map((r) => ({
        ...r,
        codeFreezeISO: legacy<string | null>(r, 'codeFreezeISO') ?? null,
        workStreams: r.workStreams.map((ws) => ({ ...ws, codeFreezeISO: legacy<string | null>(ws, 'codeFreezeISO') ?? null })),
      })),
    };
  }

  // v22 → v23: releases gain an optional, transient `pendingMemberOverrides` set only
  // on a freshly imported share and cleared by the first sync. Nothing to backfill —
  // existing releases have none — so this is a pure version bump.
  if (s.version === 22) {
    s = { ...s, version: 23 };
  }

  // v23 → v24: work items gain `pendingCreate` (a connector item queued for creation
  // on the next push). Existing items are all already-created or local, so backfill false.
  if (s.version === 23) {
    s = {
      ...s,
      version: 24,
      items: s.items.map((i) => ({ ...i, pendingCreate: legacy<boolean>(i, 'pendingCreate') ?? false })),
    };
  }

  // v24 → v25: releases gain optional `autoSyncMinutes` (background sync cadence).
  // Default is off; nothing to backfill — a pure version bump (absence = off).
  if (s.version === 24) {
    s = { ...s, version: 25 };
  }

  // v25 → v26: work streams' boolean `planningMuted` becomes the three-state
  // `planningState`. muted → 'deferred' (alarm silenced, still under-planned);
  // unmuted → 'open' (default). The new 'complete' state is only ever set by the user.
  if (s.version === 25) {
    s = {
      ...s,
      version: 26,
      releases: s.releases.map((r) => ({
        ...r,
        workStreams: r.workStreams.map((ws) => {
          const { planningMuted, ...rest } = ws as WorkStream & { planningMuted?: boolean };
          return { ...rest, planningState: planningMuted ? 'deferred' : 'open' };
        }),
      })),
    };
  }

  // v26 → v27: work items gain `createdISO` / `updatedISO`. Existing items have no
  // recorded history and none can be reconstructed — a local item's creation time was
  // never stored, and a synced item's belongs to the backend — so both backfill to
  // null (rendered as an em dash) until the item is next created, edited, or synced.
  if (s.version === 26) {
    s = {
      ...s,
      version: 27,
      items: s.items.map((i) => ({ ...i, createdISO: null, updatedISO: null })),
    };
  }

  // v27 → v28: repair synced baselines still keyed 'sprintId'. The v13 → v14 step
  // above renamed that key to 'sprint', but the seed kept minting the old one, and
  // seeded state is stamped at the current SCHEMA_VERSION — so it arrived already
  // "migrated" and walked past the only step that would have fixed it. Every store
  // seeded since v14 carries the stale key.
  //
  // It reads as a missing baseline everywhere the key is looked up: revert restores
  // nothing, the push review shows an empty old value, and a sprint drag never marks
  // the item dirty. Same rename as v14, applied where it never ran.
  if (s.version === 27) {
    s = {
      ...s,
      version: 28,
      items: s.items.map((it) => {
        const sv = it.syncedValues;
        if (sv == null || !('sprintId' in sv)) return it;
        const { sprintId, ...rest } = sv as Record<string, unknown> & { sprintId: string | null };
        // A correct 'sprint' already present wins — never clobber a good baseline
        // with the stale twin.
        return { ...it, syncedValues: { ...rest, sprint: 'sprint' in sv ? sv.sprint : sprintId } as WorkItem['syncedValues'] };
      }),
    };
  }

  // v28 → v29: work streams gain `muted` — the informational/not-our-work flag that
  // drops a stream from exports, summaries and the release-level capacity maths.
  // Backfilled false: every stream a past build wrote was counted, and silently
  // un-counting one would rewrite a release's reported scope on upgrade.
  if (s.version === 28) {
    s = {
      ...s,
      version: 29,
      releases: s.releases.map((r) => ({
        ...r,
        workStreams: r.workStreams.map((ws) => ({ ...ws, muted: false })),
      })),
    };
  }

  // v29 → v30: work items gain `lastPushError`. Nothing to backfill — absence is
  // "no failure recorded", which is the right reading for every item written by a
  // build that couldn't record one. A pure version bump.
  if (s.version === 29) {
    s = { ...s, version: 30 };
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
      // Freeze a started sprint only once there's a real baseline to freeze. A 0 (or
      // null) is treated as unstamped, so a sprint that began while the team velocity
      // was still unset (0 — the connector default) isn't trapped at 0: the next load
      // after a velocity is set stamps it with a meaningful figure. See plannedVel.
      if (!sp.plannedVelocity && sp.startISO <= today) {
        const baseline = sprintVel(team, sp, sp.daysOff);
        if (baseline > 0) {
          touched = true;
          return { ...sp, plannedVelocity: baseline };
        }
      }
      return sp;
    });
    if (!touched) return r;
    changed = true;
    return { ...r, sprints };
  });
  return changed ? { ...state, releases } : state;
}
