import { describe, expect, it } from 'vitest';
import {
  FACET_NONE,
  applyFacets,
  buildFacetGroups,
  buildItemFacet,
  buildStreamFacet,
  catalogItemFacets,
  catalogStreamFacets,
  isAnyFacetActive,
  memberFacet,
  prefixGroup,
  statusFacet,
  streamItemFacet,
  typeFacet,
} from './facets';
import type { FacetDef } from './facets';
import { STATUSES } from '../types';
import type { ReleaseCatalog, Team, WorkItem, WorkStream } from '../types';

// ── Fixtures ───────────────────────────────────────────────────────────────

const item = (over: Partial<WorkItem> = {}): WorkItem =>
  ({
    id: 'it1', releaseId: 'r1', workStreamId: 'ws1', sprintId: 'sp1',
    key: 'K-1', subject: 'S', description: '', descriptionFormat: 'text',
    status: 'Not Started', points: 3, externalId: null, assignedMemberId: null,
    build: null, externalUrl: null, dirtyFields: [], syncedValues: null,
    itemType: null, attributes: {}, statusNative: null,
    ...over,
  }) as WorkItem;

const stream = (over: Partial<WorkStream> = {}): WorkStream => ({
  id: 'ws1', name: 'API', externalId: null, engineersRequired: null,
  planningMuted: false, build: null, externalUrl: null, attributes: {},
  ...over,
});

const team: Team = {
  id: 't1', name: 'Team', velocity: 30, externalId: null,
  members: [
    { id: 'm1', name: 'Ada L.', externalId: null, nonContributing: false },
    { id: 'm2', name: 'Marco P.', externalId: null, nonContributing: false },
  ],
};

const catalog = (over: Partial<ReleaseCatalog> = {}): ReleaseCatalog => ({
  itemTypes: [], statuses: [], workStreamFields: [], ...over,
});

const selections = (entries: [string, string[]][]) => new Map(entries.map(([k, v]) => [k, new Set(v)]));

// ── Core semantics ─────────────────────────────────────────────────────────

describe('applyFacets', () => {
  const items = [
    item({ id: 'a', status: 'Complete', itemType: { id: null, label: 'Bug' } }),
    item({ id: 'b', status: 'Blocked', itemType: { id: null, label: 'Story' } }),
    item({ id: 'c', status: 'Complete', itemType: null }),
  ];
  const defs = [statusFacet(), typeFacet()];

  it('empty selection = no filtering (hard invariant)', () => {
    const groups = buildFacetGroups(defs, items, new Map());
    expect(applyFacets(items, groups)).toEqual(items);
    expect(isAnyFacetActive(groups)).toBe(false);
  });

  it('ORs within a facet', () => {
    const groups = buildFacetGroups(defs, items, selections([['status', ['Complete', 'Blocked']]]));
    expect(applyFacets(items, groups).map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('ANDs across facets', () => {
    const groups = buildFacetGroups(defs, items, selections([['status', ['Complete']], ['type', ['Bug']]]));
    expect(applyFacets(items, groups).map((i) => i.id)).toEqual(['a']);
  });

  it('clearing selections restores the full view', () => {
    const groups = buildFacetGroups(defs, items, new Map());
    expect(applyFacets(items, groups)).toHaveLength(3);
  });
});

describe('prefixGroup', () => {
  it('collapses to the leading segment', () => {
    const g = prefixGroup();
    expect(g('264')).toBe('264');
    expect(g('264.1')).toBe('264');
    expect(g('264.2.5')).toBe('264');
  });

  it('is exact for separator-free values', () => {
    expect(prefixGroup()('alpha')).toBe('alpha');
  });

  it('honors a custom separator', () => {
    expect(prefixGroup('-')('264-1')).toBe('264');
    expect(prefixGroup('-')('264.1')).toBe('264.1');
  });
});

// ── Built-in facets ────────────────────────────────────────────────────────

describe('statusFacet', () => {
  it('always offers the full canonical vocabulary and stays visible', () => {
    const [g] = buildFacetGroups([statusFacet()], [item()], new Map());
    expect(g.options.map((o) => o.value)).toEqual([...STATUSES]);
    expect(g.visible).toBe(true);
  });

  it('omits excluded statuses (backlog views rule out Complete by construction)', () => {
    const [g] = buildFacetGroups([statusFacet(['Complete'])], [item()], new Map());
    expect(g.options.map((o) => o.value)).toEqual(STATUSES.filter((s) => s !== 'Complete'));
  });
});

describe('streamItemFacet', () => {
  const streams = [stream({ id: 'ws1', name: 'API' }), stream({ id: 'ws2', name: 'UI' }), stream({ id: 'ws3', name: 'Empty' })];
  const items = [
    item({ id: 'a', workStreamId: 'ws1' }),
    item({ id: 'b', workStreamId: 'ws2' }),
    item({ id: 'c', workStreamId: null }),
  ];

  it('offers streams with observed items plus a "No stream" option', () => {
    const [g] = buildFacetGroups([streamItemFacet(streams)], items, new Map());
    expect(g.options).toEqual([
      { value: 'ws1', label: 'API' },
      { value: 'ws2', label: 'UI' },
      { value: FACET_NONE, label: 'No stream' },
    ]);
  });

  it('selecting "No stream" matches only unstreamed items', () => {
    const groups = buildFacetGroups([streamItemFacet(streams)], items, selections([['stream', [FACET_NONE]]]));
    expect(applyFacets(items, groups).map((i) => i.id)).toEqual(['c']);
  });

  it('selecting a stream matches its items', () => {
    const groups = buildFacetGroups([streamItemFacet(streams)], items, selections([['stream', ['ws1']]]));
    expect(applyFacets(items, groups).map((i) => i.id)).toEqual(['a']);
  });
});

describe('typeFacet', () => {
  const items = [
    item({ id: 'a', itemType: { id: null, label: 'Bug' } }),
    item({ id: 'b', itemType: { id: null, label: 'Story' } }),
    item({ id: 'c', itemType: null }),
  ];

  it('offers observed labels in first-seen order', () => {
    const [g] = buildFacetGroups([typeFacet()], items, new Map());
    expect(g.options.map((o) => o.value)).toEqual(['Bug', 'Story']);
  });

  it('an active selection excludes untyped items (no "(none)" offered)', () => {
    const groups = buildFacetGroups([typeFacet()], items, selections([['type', ['Bug']]]));
    expect(applyFacets(items, groups).map((i) => i.id)).toEqual(['a']);
    expect(groups[0].options.some((o) => o.value === FACET_NONE)).toBe(false);
  });
});

describe('memberFacet', () => {
  const items = [item({ id: 'a', assignedMemberId: 'm1' }), item({ id: 'b', assignedMemberId: null })];

  it('offers only members with an observed assignment', () => {
    const [g] = buildFacetGroups([memberFacet(team)], items, new Map());
    expect(g.options).toEqual([{ value: 'm1', label: 'Ada L.' }]);
  });

  it('an active selection excludes unassigned items', () => {
    const groups = buildFacetGroups([memberFacet(team)], items, selections([['member', ['m1']]]));
    expect(applyFacets(items, groups).map((i) => i.id)).toEqual(['a']);
  });

  it('handles an undefined team', () => {
    const [g] = buildFacetGroups([memberFacet(undefined)], items, new Map());
    expect(g.options).toEqual([]);
    expect(g.visible).toBe(false);
  });
});

describe('buildItemFacet', () => {
  const items = [
    item({ id: 'a', build: '264' }),
    item({ id: 'b', build: '264.1' }),
    item({ id: 'c', build: null }),
  ];

  it('prefix-groups dotted point builds under their line', () => {
    const [g] = buildFacetGroups([buildItemFacet()], items, new Map());
    expect(g.options).toEqual([{ value: '264', label: '264' }]);
  });

  it('selecting the group matches every dotted variant, not null-build items', () => {
    const groups = buildFacetGroups([buildItemFacet()], items, selections([['build', ['264']]]));
    expect(applyFacets(items, groups).map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('a single build option stays visible when null-build items exist', () => {
    const [g] = buildFacetGroups([buildItemFacet()], items, new Map());
    expect(g.visible).toBe(true);
  });

  it('hides when every item shares the one build group', () => {
    const all264 = [item({ id: 'a', build: '264' }), item({ id: 'b', build: '264.1' })];
    const [g] = buildFacetGroups([buildItemFacet()], all264, new Map());
    expect(g.visible).toBe(false);
  });
});

describe('buildStreamFacet (the on-build lens successor)', () => {
  const streams = [
    stream({ id: 'w1', build: null }),
    stream({ id: 'w2', build: '264' }),
    stream({ id: 'w3', build: '264.1' }),
  ];

  it('offers grouped builds plus Native when a null-build stream exists', () => {
    const [g] = buildFacetGroups([buildStreamFacet()], streams, new Map());
    expect(g.options).toEqual([
      { value: '264', label: '264' },
      { value: FACET_NONE, label: 'Native' },
    ]);
  });

  it('selecting only Native reproduces the old on-build lens', () => {
    const groups = buildFacetGroups([buildStreamFacet()], streams, selections([['build', [FACET_NONE]]]));
    expect(applyFacets(streams, groups).map((w) => w.id)).toEqual(['w1']);
  });

  it('offers no Native option when every stream is carried in', () => {
    const carried = [stream({ id: 'w2', build: '264' }), stream({ id: 'w3', build: '300' })];
    const [g] = buildFacetGroups([buildStreamFacet()], carried, new Map());
    expect(g.options.map((o) => o.value)).toEqual(['264', '300']);
  });
});

// ── Catalog-derived facets ─────────────────────────────────────────────────

describe('catalogItemFacets', () => {
  const severitySpec = {
    key: 'severity', label: 'Severity', kind: 'enum' as const, filterable: true,
    options: [
      { value: 'low', label: 'Low' },
      { value: 'high', label: 'High' },
      { value: 'critical', label: 'Critical' },
    ],
  };
  const cat = catalog({ itemTypes: [{ id: 'acme_bug', label: 'Bug', fields: [severitySpec] }] });
  const items = [
    item({ id: 'a', attributes: { severity: 'high' } }),
    item({ id: 'b', attributes: { severity: 'critical' } }),
    item({ id: 'c', attributes: {} }),
  ];

  it('returns no facets for an absent catalog (local releases)', () => {
    expect(catalogItemFacets(null)).toEqual([]);
    expect(catalogItemFacets(undefined)).toEqual([]);
  });

  it('ignores non-filterable and non-vocabulary fields', () => {
    const c = catalog({
      itemTypes: [{
        id: 't', label: 'T',
        fields: [
          { key: 'points', kind: 'number' as const, role: 'points' as const, filterable: true }, // role → not vocabulary
          { key: 'sprint', kind: 'ref' as const, target: 'sprint' as const, filterable: true }, // ref → not vocabulary
          { key: 'notes', kind: 'string' as const }, // not filterable
        ],
      }],
    });
    expect(catalogItemFacets(c)).toEqual([]);
  });

  it('enum options = declared ∩ observed, in declared order with declared labels', () => {
    const [def] = catalogItemFacets(cat);
    const [g] = buildFacetGroups([def], items, new Map());
    expect(g.options).toEqual([
      { value: 'high', label: 'High' },
      { value: 'critical', label: 'Critical' },
    ]);
  });

  it('an active selection excludes items without the field', () => {
    const [def] = catalogItemFacets(cat);
    const groups = buildFacetGroups([def], items, selections([['attr:severity', ['high']]]));
    expect(applyFacets(items, groups).map((i) => i.id)).toEqual(['a']);
  });

  it('two types sharing a key resolve through the first declaring spec', () => {
    const other = { key: 'severity', label: 'Sev (task)', kind: 'enum' as const, filterable: true, options: [{ value: 'high', label: 'HIGH!' }] };
    const c = catalog({
      itemTypes: [
        { id: 'acme_bug', label: 'Bug', fields: [severitySpec] },
        { id: 'acme_task', label: 'Task', fields: [other] },
      ],
    });
    const defs = catalogItemFacets(c);
    expect(defs).toHaveLength(1);
    expect(defs[0].label).toBe('Severity');
    // Raw-value matching: items of both types match the same option.
    const mixed = [
      item({ id: 'a', itemType: { id: 'acme_bug', label: 'Bug' }, attributes: { severity: 'high' } }),
      item({ id: 'b', itemType: { id: 'acme_task', label: 'Task' }, attributes: { severity: 'high' } }),
    ];
    const groups = buildFacetGroups(defs, mixed, selections([['attr:severity', ['high']]]));
    expect(applyFacets(mixed, groups)).toHaveLength(2);
  });

  it('boolean fields facet as Yes/No over observed values', () => {
    const c = catalog({ itemTypes: [{ id: 't', label: 'T', fields: [{ key: 'regression', label: 'Regression', kind: 'boolean' as const, filterable: true }] }] });
    const its = [item({ id: 'a', attributes: { regression: true } }), item({ id: 'b', attributes: { regression: false } })];
    const [g] = buildFacetGroups(catalogItemFacets(c), its, new Map());
    expect(g.options).toEqual([
      { value: 'true', label: 'Yes' },
      { value: 'false', label: 'No' },
    ]);
    const groups = buildFacetGroups(catalogItemFacets(c), its, selections([['attr:regression', ['true']]]));
    expect(applyFacets(its, groups).map((i) => i.id)).toEqual(['a']);
  });

  it('string fields with facetGroup=prefix group before the cap', () => {
    const c = catalog({
      itemTypes: [{
        id: 't', label: 'T',
        fields: [{ key: 'fixVersion', label: 'Fix version', kind: 'string' as const, filterable: true, facetGroup: 'prefix' as const }],
      }],
    });
    // 26 dotted values over 2 lines — ungrouped this would blow the cap.
    const its = Array.from({ length: 26 }, (_, n) =>
      item({ id: `i${n}`, attributes: { fixVersion: `${n % 2 === 0 ? '264' : '265'}.${n}` } }),
    );
    const [g] = buildFacetGroups(catalogItemFacets(c), its, new Map());
    expect(g.options.map((o) => o.value)).toEqual(['264', '265']);
    const groups = buildFacetGroups(catalogItemFacets(c), its, selections([['attr:fixVersion', ['264']]]));
    expect(applyFacets(its, groups)).toHaveLength(13);
  });

  it('suppresses an ungrouped string facet past the cap', () => {
    const c = catalog({ itemTypes: [{ id: 't', label: 'T', fields: [{ key: 'label', kind: 'string' as const, filterable: true }] }] });
    const its = Array.from({ length: 13 }, (_, n) => item({ id: `i${n}`, attributes: { label: `v${n}` } }));
    const [g] = buildFacetGroups(catalogItemFacets(c), its, new Map());
    expect(g.options).toEqual([]);
    expect(g.visible).toBe(false);
  });
});

describe('catalogStreamFacets', () => {
  const trackSpec = {
    key: 'track', label: 'Track', kind: 'enum' as const, filterable: true,
    options: [
      { value: 'product', label: 'Product' },
      { value: 'platform', label: 'Platform' },
    ],
  };
  const cat = catalog({ workStreamFields: [trackSpec] });
  const streams = [
    stream({ id: 'w1', attributes: { track: 'product' } }),
    stream({ id: 'w2', attributes: { track: 'platform' } }),
    stream({ id: 'w3', attributes: {} }),
  ];

  it('derives stream facets from workStreamFields, with a "(none)" option', () => {
    const defs = catalogStreamFacets(cat);
    expect(defs).toHaveLength(1);
    const [g] = buildFacetGroups(defs, streams, new Map());
    expect(g.options).toEqual([
      { value: 'product', label: 'Product' },
      { value: 'platform', label: 'Platform' },
      { value: FACET_NONE, label: '(none)' },
    ]);
  });

  it('selecting "(none)" keeps only streams without the value', () => {
    const groups = buildFacetGroups(catalogStreamFacets(cat), streams, selections([['attr:track', [FACET_NONE]]]));
    expect(applyFacets(streams, groups).map((w) => w.id)).toEqual(['w3']);
  });

  it('offers no "(none)" when every stream carries a value', () => {
    const all = streams.slice(0, 2);
    const [g] = buildFacetGroups(catalogStreamFacets(cat), all, new Map());
    expect(g.options.some((o) => o.value === FACET_NONE)).toBe(false);
  });

  it('skips non-filterable stream fields', () => {
    const c = catalog({ workStreamFields: [{ key: 'owner', kind: 'string' as const }] });
    expect(catalogStreamFacets(c)).toEqual([]);
  });
});

// ── Visibility rule ────────────────────────────────────────────────────────

describe('facet visibility', () => {
  it('hides observed facets that cannot partition the view', () => {
    const items = [item({ id: 'a', itemType: { id: null, label: 'Bug' } }), item({ id: 'b', itemType: { id: null, label: 'Bug' } })];
    const [g] = buildFacetGroups([typeFacet()], items, new Map());
    expect(g.options).toHaveLength(1);
    expect(g.visible).toBe(false);
  });

  it('shows a single option when some entity misses it', () => {
    const items = [item({ id: 'a', itemType: { id: null, label: 'Bug' } }), item({ id: 'b', itemType: null })];
    const [g] = buildFacetGroups([typeFacet()], items, new Map());
    expect(g.visible).toBe(true);
  });

  it('FACET_NONE is a first-class selectable value, never grouped', () => {
    const def: FacetDef<WorkStream> = buildStreamFacet();
    expect(def.valueOf(stream({ build: null }))).toBe(FACET_NONE);
    expect(def.valueOf(stream({ build: '264.9' }))).toBe('264');
  });
});
