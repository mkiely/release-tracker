// The generic facet framework — the filtering half of the field/column
// descriptor registry (presentation-layer "layer 3", beside columns.tsx).
// One descriptor vocabulary serves data and view: built-in facets (status,
// type, member, build — canonical app data, available for local + connector
// releases) and catalog-derived facets (FieldSpecs with filterable:true) are
// the same shape, so a connector declaring a filterable vocabulary field
// surfaces a filter chip group with no per-field wiring.
//
// Semantics (unit-tested invariants):
//  - empty selection = facet inactive (no filtering);
//  - OR within a facet, AND across facets;
//  - selections store *group keys* (see prefixGroup), never raw values.

import type { ReleaseCatalog, Status, Team, WorkItem, WorkStream } from '../types';
import type { FieldSpec } from '../sync/schema';
import { STATUSES } from '../types';
import { isAttributeField } from './connectorFields';
import { statusVars, typeVars } from '../components/statusVars';
import type { ChipVars } from '../components/FilterChip';

/** Sentinel selection value meaning "entity has no value for this facet". */
export const FACET_NONE = '';

/** Grouped string facets collapse before this cap; past it the facet is
 *  suppressed rather than flooding the chip bar. */
const STRING_FACET_CAP = 12;

export interface FacetOption {
  /** Comparable group key ('' = FACET_NONE). */
  value: string;
  /** Display label ('(none)'/custom for FACET_NONE; enum option labels). */
  label: string;
}

/** Presentation hints consumed by the chip bars — the facet analog of
 *  registry.tsx's data→control mapping, for the filter direction. */
export interface FacetChipHints {
  /** Color tokens for an option's active state (status/type palettes). */
  vars?: (value: string) => ChipVars | undefined;
  /** Square dot = builds (matches the existing build-chip convention). */
  dotShape?: 'round' | 'square';
  /** 'avatar' renders member initials instead of a dot. */
  render?: 'chip' | 'avatar';
}

export interface FacetDef<T> {
  /** Selection-state key: 'status' | 'type' | 'member' | 'build' | `attr:${FieldSpec.key}`. */
  key: string;
  /** Group label, e.g. 'Status', 'Severity', 'Track'. */
  label: string;
  scope: 'item' | 'stream';
  /** Options to offer, derived from the entities in the view's scope. */
  options: (entities: T[]) => FacetOption[];
  /** An entity's *group key* (grouping baked in); FACET_NONE when absent. */
  valueOf: (entity: T) => string;
  /** Fixed-vocabulary facets (status) render even with <2 observed values. */
  alwaysVisible?: boolean;
  chip?: FacetChipHints;
}

/** A def bound to its live options + selection, ready for a chip bar. */
export interface FacetGroup<T> {
  def: FacetDef<T>;
  options: FacetOption[];
  selection: ReadonlySet<string>;
  /** False when the facet couldn't change the view (fewer than two options and
   *  every entity already matches the only one) — the bar skips it. */
  visible: boolean;
}

export type FacetSelections = ReadonlyMap<string, ReadonlySet<string>>;

/** Stock grouping: collapse a value to its leading segment ('264.1' → '264').
 *  Values without the separator form their own group, so grouping degrades to
 *  exact matching for flat value spaces. */
export function prefixGroup(separator = '.'): (raw: string) => string {
  return (raw) => raw.split(separator)[0];
}

const EMPTY_SELECTION: ReadonlySet<string> = new Set();

/** Bind defs to the entities in scope + the current selections. */
export function buildFacetGroups<T>(
  defs: FacetDef<T>[],
  entities: T[],
  selections: FacetSelections,
): FacetGroup<T>[] {
  return defs.map((def) => {
    const options = def.options(entities);
    const selection = selections.get(def.key) ?? EMPTY_SELECTION;
    const visible =
      options.length > 0 &&
      (def.alwaysVisible === true ||
        options.length >= 2 ||
        // A single option still partitions the view when some entity misses it
        // (e.g. one carried-in build among native items).
        entities.some((e) => def.valueOf(e) !== options[0].value));
    return { def, options, selection, visible };
  });
}

/** Empty selection = no filtering; OR within a facet, AND across facets. */
export function applyFacets<T>(entities: T[], groups: FacetGroup<T>[]): T[] {
  const active = groups.filter((g) => g.selection.size > 0);
  if (active.length === 0) return entities;
  return entities.filter((e) => active.every((g) => g.selection.has(g.def.valueOf(e))));
}

export function isAnyFacetActive(groups: { selection: ReadonlySet<string> }[]): boolean {
  return groups.some((g) => g.selection.size > 0);
}

// ── Built-in facets ────────────────────────────────────────────────────────
// Canonical app data; available for local and connector releases alike. Each
// preserves the exact semantics of the bespoke Set filter it replaced.

/** Canonical status — fixed vocabulary, always offered in full. `exclude`
 *  drops statuses a view rules out by construction (e.g. the backlog holds no
 *  Complete items), so no dead chip is offered. */
export function statusFacet(exclude: readonly Status[] = []): FacetDef<WorkItem> {
  return {
    key: 'status',
    label: 'Status',
    scope: 'item',
    options: () => STATUSES.filter((s) => !exclude.includes(s)).map((s) => ({ value: s, label: s })),
    valueOf: (i) => i.status,
    alwaysVisible: true,
    chip: { vars: (v) => statusVars(v as Status) },
  };
}

/** Work-item type — observed labels; an active selection excludes untyped items. */
export function typeFacet(): FacetDef<WorkItem> {
  return {
    key: 'type',
    label: 'Type',
    scope: 'item',
    options: (items) => {
      const seen = new Set<string>();
      const out: FacetOption[] = [];
      for (const i of items) {
        const t = i.itemType?.label;
        if (t === undefined || seen.has(t)) continue;
        seen.add(t);
        out.push({ value: t, label: t });
      }
      return out;
    },
    valueOf: (i) => i.itemType?.label ?? FACET_NONE,
    chip: { vars: (v) => typeVars(v) },
  };
}

/** Assignee — team members with at least one observed assignment; an active
 *  selection excludes unassigned items. */
export function memberFacet(team: Team | undefined): FacetDef<WorkItem> {
  return {
    key: 'member',
    label: 'Assignee',
    scope: 'item',
    options: (items) =>
      (team?.members ?? [])
        .filter((m) => items.some((i) => i.assignedMemberId === m.id))
        .map((m) => ({ value: m.id, label: m.name })),
    valueOf: (i) => i.assignedMemberId ?? FACET_NONE,
    chip: { render: 'avatar' },
  };
}

/** Item work stream — the release's streams with at least one observed item,
 *  plus a 'No stream' option when unstreamed items are in scope. Used by the
 *  backlog, where items from every stream (and none) mix in one list. */
export function streamItemFacet(streams: WorkStream[]): FacetDef<WorkItem> {
  return {
    key: 'stream',
    label: 'Stream',
    scope: 'item',
    options: (items) => {
      const out: FacetOption[] = streams
        .filter((ws) => items.some((i) => i.workStreamId === ws.id))
        .map((ws) => ({ value: ws.id, label: ws.name }));
      if (items.some((i) => i.workStreamId === null)) out.push({ value: FACET_NONE, label: 'No stream' });
      return out;
    },
    valueOf: (i) => i.workStreamId ?? FACET_NONE,
  };
}

/** Item build — observed carried-in builds, prefix-grouped so point builds
 *  ('264.1', '264.2') collapse under their line ('264'). */
export function buildItemFacet(): FacetDef<WorkItem> {
  const group = prefixGroup();
  return {
    key: 'build',
    label: 'Build',
    scope: 'item',
    options: (items) => {
      const seen = new Set<string>();
      const out: FacetOption[] = [];
      for (const i of items) {
        if (i.build === null) continue;
        const g = group(i.build);
        if (seen.has(g)) continue;
        seen.add(g);
        out.push({ value: g, label: g });
      }
      return out;
    },
    valueOf: (i) => (i.build === null ? FACET_NONE : group(i.build)),
    chip: { dotShape: 'square' },
  };
}

/** Stream build — the successor of the "on-build only" lens. Observed builds
 *  (prefix-grouped) plus a 'Native' option for streams native to this release
 *  (build === null); selecting only 'Native' reproduces the old lens. */
export function buildStreamFacet(): FacetDef<WorkStream> {
  const group = prefixGroup();
  return {
    key: 'build',
    label: 'Build',
    scope: 'stream',
    options: (streams) => {
      const seen = new Set<string>();
      const out: FacetOption[] = [];
      for (const ws of streams) {
        if (ws.build === null) continue;
        const g = group(ws.build);
        if (seen.has(g)) continue;
        seen.add(g);
        out.push({ value: g, label: g });
      }
      if (streams.some((ws) => ws.build === null)) out.push({ value: FACET_NONE, label: 'Current Build' });
      return out;
    },
    valueOf: (ws) => (ws.build === null ? FACET_NONE : group(ws.build)),
    chip: { dotShape: 'square' },
  };
}

// ── Catalog-derived facets ─────────────────────────────────────────────────
// Filterable vocabulary fields from the release's catalog *snapshot* (not live
// meta) — facet options must interpret the values the entities were actually
// synced under, exactly like columns.tsx's attributeColumns. Absent catalog
// (local releases) ⇒ no catalog facets; built-ins still work.

type AttrCarrier = { attributes?: Record<string, unknown> };

const rawOf = (e: AttrCarrier, key: string): string => {
  const v = e.attributes?.[key];
  return v == null || v === '' ? FACET_NONE : String(v);
};

/** The group function a spec declares, or identity. Grouping is only defined
 *  for string fields (the contract restricts facetGroup to kind=string; enum
 *  and boolean options are already bounded). */
const specGroup = (spec: FieldSpec): ((raw: string) => string) =>
  spec.kind === 'string' && spec.facetGroup === 'prefix' ? prefixGroup(spec.facetSeparator ?? '.') : (raw) => raw;

/** Derive one facet's options from a spec + the observed raw values, applying
 *  the per-kind rule: enum = declared ∩ observed (declared order, declared
 *  labels); boolean = observed subset of Yes/No; string = observed distinct
 *  group keys (first-seen order, capped). */
function specOptions(spec: FieldSpec, observed: string[]): FacetOption[] {
  const present = new Set(observed.filter((v) => v !== FACET_NONE));
  if (spec.kind === 'enum') {
    return (spec.options ?? [])
      .filter((o) => present.has(o.value))
      .map((o) => ({ value: o.value, label: o.label }));
  }
  if (spec.kind === 'boolean') {
    const out: FacetOption[] = [];
    if (present.has('true')) out.push({ value: 'true', label: 'Yes' });
    if (present.has('false')) out.push({ value: 'false', label: 'No' });
    return out;
  }
  // string: observed distinct group keys, first-seen order, chip-explosion cap.
  const group = specGroup(spec);
  const seen = new Set<string>();
  const out: FacetOption[] = [];
  for (const v of observed) {
    if (v === FACET_NONE) continue;
    const g = group(v);
    if (seen.has(g)) continue;
    seen.add(g);
    out.push({ value: g, label: g });
  }
  return out.length > STRING_FACET_CAP ? [] : out;
}

/**
 * Item facets from filterable vocabulary FieldSpecs across catalog.itemTypes.
 * Mirrors attributeColumns' per-type resolution: union of keys declared
 * filterable by ANY type, first-seen label; matching is on the raw stringified
 * attribute value (grouped per the first declaring spec), so two types sharing
 * a key both match. No '(none)' option — an active selection excludes items
 * without the field, matching the type/member facet semantics.
 */
export function catalogItemFacets(catalog: ReleaseCatalog | null | undefined): FacetDef<WorkItem>[] {
  const byKey = new Map<string, FieldSpec>();
  for (const t of catalog?.itemTypes ?? []) {
    for (const f of t.fields) {
      if (f.filterable !== true || !isAttributeField(f) || byKey.has(f.key)) continue;
      byKey.set(f.key, f);
    }
  }
  return [...byKey.values()].map((spec) => attrFacet<WorkItem>(spec, 'item', false));
}

/**
 * Stream facets from filterable specs in catalog.workStreamFields (flat — no
 * type dimension). Streams are few and nullable values are meaningful lens
 * choices, so a '(none)' option is offered when an observed stream lacks the
 * key.
 */
export function catalogStreamFacets(catalog: ReleaseCatalog | null | undefined): FacetDef<WorkStream>[] {
  return (catalog?.workStreamFields ?? [])
    .filter((f) => f.filterable === true && isAttributeField(f))
    .map((spec) => attrFacet<WorkStream>(spec, 'stream', true));
}

function attrFacet<T extends AttrCarrier>(spec: FieldSpec, scope: 'item' | 'stream', offerNone: boolean): FacetDef<T> {
  const group = specGroup(spec);
  return {
    key: `attr:${spec.key}`,
    label: spec.label ?? spec.key,
    scope,
    options: (entities) => {
      const observed = entities.map((e) => rawOf(e, spec.key));
      const out = specOptions(spec, observed);
      if (offerNone && out.length > 0 && observed.includes(FACET_NONE)) {
        out.push({ value: FACET_NONE, label: '(none)' });
      }
      return out;
    },
    valueOf: (e) => {
      const raw = rawOf(e, spec.key);
      return raw === FACET_NONE ? FACET_NONE : group(raw);
    },
  };
}
