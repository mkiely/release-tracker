import { describe, expect, it } from 'vitest';
import {
  allWriteableLocalFields,
  attributeFields,
  capabilitySummary,
  conceptWriteable,
  fieldLabel,
  isAttributeField,
  itemTypeFor,
  missingCapabilities,
  recomputeDirty,
  writeableAttributeFields,
  writeableLocalFields,
  type CanonicalView,
} from './connectorFields';
import type { ConnectorItemType } from '../sync/schema';
import type { WorkItem } from '../types';
import { anItem } from '../test/factories';

const story: ConnectorItemType = {
  id: 'acme_story',
  label: 'Story',
  fields: [
    { key: 'subject', kind: 'string', role: 'subject', creatable: true, writeable: false },
    { key: 'sprint', kind: 'ref', target: 'sprint', creatable: true, writeable: true },
    { key: 'points', kind: 'number', role: 'points', creatable: true, writeable: true },
  ],
};
const readonlyType: ConnectorItemType = {
  id: 'acme_ro',
  label: 'RO',
  fields: [{ key: 'subject', kind: 'string', role: 'subject', creatable: true, writeable: false }],
};

describe('itemTypeFor', () => {
  it('resolves by id; undefined for null/unknown/no catalog', () => {
    expect(itemTypeFor('acme_story', [story])?.label).toBe('Story');
    expect(itemTypeFor('nope', [story])).toBeUndefined();
    expect(itemTypeFor(null, [story])).toBeUndefined();
    expect(itemTypeFor('acme_story', undefined)).toBeUndefined();
  });
});

describe('writeableLocalFields', () => {
  it('derives {points,sprint} from a type via role/target', () => {
    expect([...writeableLocalFields(story)].sort()).toEqual(['points', 'sprint']);
  });
  it('returns empty for a type with no writeable fields', () => {
    expect(writeableLocalFields(readonlyType).size).toBe(0);
  });
  it('falls back to legacy points+sprint for an unknown type', () => {
    expect([...writeableLocalFields(undefined)].sort()).toEqual(['points', 'sprint']);
  });
  it('includes every canonical field a connector marks writeable (description, subject, assignee, workStream)', () => {
    const rich: ConnectorItemType = {
      id: 'rich',
      label: 'Rich',
      fields: [
        { key: 'summary', kind: 'string', role: 'subject', writeable: true },
        { key: 'body', kind: 'string', role: 'description', writeable: true },
        { key: 'epic', kind: 'ref', target: 'workStream', writeable: true },
        { key: 'assignee', kind: 'ref', target: 'member', writeable: true },
      ],
    };
    expect([...writeableLocalFields(rich)].sort()).toEqual(['assignee', 'description', 'subject', 'workStream']);
    expect(conceptWriteable(rich, 'description')).toBe(true);
    expect(conceptWriteable(rich, 'assignee')).toBe(true);
  });
});

describe('allWriteableLocalFields', () => {
  it('unions across types; legacy fallback when none/undefined', () => {
    expect([...allWriteableLocalFields([story, readonlyType])].sort()).toEqual(['points', 'sprint']);
    expect([...allWriteableLocalFields([readonlyType])]).toEqual([]);
    expect([...allWriteableLocalFields(undefined)].sort()).toEqual(['points', 'sprint']);
  });
});

describe('conceptWriteable', () => {
  it('reflects per-type access', () => {
    expect(conceptWriteable(story, 'points')).toBe(true);
    expect(conceptWriteable(story, 'sprint')).toBe(true);
    expect(conceptWriteable(story, 'subject')).toBe(false); // create-once
    expect(conceptWriteable(story, 'workStream')).toBe(false);
  });
  it('falls back to points+sprint for an unknown type', () => {
    expect(conceptWriteable(undefined, 'points')).toBe(true);
    expect(conceptWriteable(undefined, 'sprint')).toBe(true);
    expect(conceptWriteable(undefined, 'subject')).toBe(false);
  });
});

describe('isAttributeField / attributeFields', () => {
  const bug: ConnectorItemType = {
    id: 'acme_bug',
    label: 'Bug',
    fields: [
      { key: 'subject', kind: 'string', role: 'subject', creatable: true },
      { key: 'sprint', kind: 'ref', target: 'sprint', creatable: true, writeable: true },
      { key: 'status', kind: 'enum', enumRef: 'status', writeable: true },
      { key: 'severity', kind: 'enum', creatable: true, options: [{ value: 'low', label: 'Low' }] },
      { key: 'regression', kind: 'boolean', creatable: true },
      { key: 'foundIn', kind: 'string', creatable: true },
    ],
  };

  it('vocabulary = no role, not a ref, not an app-canonical enum', () => {
    const keys = bug.fields.map((f) => [f.key, isAttributeField(f)]);
    expect(Object.fromEntries(keys)).toEqual({
      subject: false, sprint: false, status: false,
      severity: true, regression: true, foundIn: true,
    });
  });

  it('attributeFields keeps catalog order and handles missing type', () => {
    expect(attributeFields(bug).map((f) => f.key)).toEqual(['severity', 'regression', 'foundIn']);
    expect(attributeFields(undefined)).toEqual([]);
  });
});

describe('writeable vocabulary fields', () => {
  const bug: ConnectorItemType = {
    id: 'bug',
    label: 'Bug',
    fields: [
      { key: 'points', kind: 'number', role: 'points', writeable: true },
      { key: 'sprint', kind: 'ref', target: 'sprint', writeable: true },
      { key: 'severity', kind: 'enum', writeable: true, options: [{ value: 'low', label: 'Low' }] },
      { key: 'foundIn', kind: 'string', writeable: false },
      // Pathological: a vocabulary key shadowing a reserved local name — must be skipped.
      { key: 'points', kind: 'string', writeable: true },
    ],
  };

  it('writeableLocalFields includes writeable vocabulary keys, guarding reserved names', () => {
    expect(writeableLocalFields(bug)).toEqual(new Set(['points', 'sprint', 'severity']));
  });

  it('writeableAttributeFields returns the writeable attribute subset as specs', () => {
    expect(writeableAttributeFields(bug).map((f) => f.key)).toEqual(['severity']);
    expect(writeableAttributeFields(undefined)).toEqual([]);
  });
});

describe('capability handshake', () => {
  const fullCoverage: ConnectorItemType = {
    id: 'full',
    label: 'Full',
    fields: [
      { key: 'points', kind: 'number', role: 'points', writeable: true },
      { key: 'sprint', kind: 'ref', target: 'sprint', writeable: true },
      { key: 'assignee', kind: 'ref', target: 'member' },
      { key: 'status', kind: 'enum', enumRef: 'status', writeable: true },
    ],
  };
  const bare: ConnectorItemType = {
    id: 'bare',
    label: 'Bare',
    fields: [{ key: 'subject', kind: 'string', role: 'subject', creatable: true }],
  };

  it('reports nothing for full coverage and for an absent catalog (unknown ≠ degraded)', () => {
    expect(missingCapabilities([fullCoverage])).toEqual([]);
    expect(missingCapabilities(undefined)).toEqual([]);
    expect(missingCapabilities([])).toEqual([]);
  });

  it('reports every uncovered concept with a user-facing impact', () => {
    const missing = missingCapabilities([bare]);
    expect(missing.map((m) => m.concept)).toEqual(['points', 'sprint', 'assignee', 'status']);
    expect(missing[0].impact).toMatch(/capacity/);
  });

  it('coverage anywhere in the catalog counts (union across types)', () => {
    const pointsOnly: ConnectorItemType = {
      id: 'p', label: 'P', fields: [{ key: 'est', kind: 'number', role: 'points' }],
    };
    expect(missingCapabilities([bare, pointsOnly]).map((m) => m.concept)).toEqual(['sprint', 'assignee', 'status']);
  });

  it('capabilitySummary lists creatable types, pushable fields, and workflow states', () => {
    const meta = {
      itemTypes: [
        { ...fullCoverage, fields: [...fullCoverage.fields, { key: 'severity', label: 'Severity', kind: 'enum' as const, creatable: true, writeable: true, options: [{ value: 'low', label: 'Low' }] }] },
      ],
      statuses: [{ id: 'a' }, { id: 'b' }],
    };
    const s = capabilitySummary(meta)!;
    expect(s).toContain('creates Full');
    expect(s).toContain('pushes points, sprint, status, Severity');
    expect(s).toContain('2 workflow states');
    expect(capabilitySummary(undefined)).toBeNull();
    expect(capabilitySummary({ itemTypes: [] })).toBeNull();
  });
});

describe('status writeability', () => {
  const flow: ConnectorItemType = {
    id: 'flow',
    label: 'Flow',
    fields: [
      { key: 'state', kind: 'enum', enumRef: 'status', writeable: true },
      // Vocabulary key shadowing the reserved 'status' local name — stays read-only.
      { key: 'status', kind: 'string', writeable: true },
    ],
  };

  it("maps a writeable enumRef:'status' field to the 'status' local name", () => {
    expect(writeableLocalFields(flow).has('status')).toBe(true);
  });

  it('guards a vocabulary key shadowing the reserved status name', () => {
    expect(writeableAttributeFields(flow).map((f) => f.key)).toEqual([]);
  });

  it('legacy fallback (unknown type) still excludes status', () => {
    expect(writeableLocalFields(undefined).has('status')).toBe(false);
  });
});

// One resolver, because there were briefly two: the push-result modal read the
// catalog while the item modal read only attribute fields, so the same rejection
// said "Cycle" in one place and "sprint" in the other.
describe('fieldLabel', () => {
  const acmeStory: ConnectorItemType = {
    id: 'acme_story',
    label: 'Story',
    fields: [
      // Acme's own word for a sprint — the whole reason the catalog wins.
      { key: 'sprint', label: 'Cycle', kind: 'ref', target: 'sprint', writeable: true },
      { key: 'severity', label: 'Severity', kind: 'enum', options: [], writeable: true },
      { key: 'unlabelled', kind: 'string' },
    ],
  };

  it("prefers the connector's own label over the app's canonical one", () => {
    expect(fieldLabel(acmeStory, 'sprint')).toBe('Cycle');
  });

  it('uses a vocabulary label where the concept is only the connector’s', () => {
    expect(fieldLabel(acmeStory, 'severity')).toBe('Severity');
  });

  it('falls back to the canonical label when the catalog declares no label', () => {
    expect(fieldLabel(acmeStory, 'points')).toBe('Points');
    expect(fieldLabel(undefined, 'workStream')).toBe('Work stream');
  });

  it('falls back to the raw key rather than rendering nothing', () => {
    // A poor label is recoverable; a hidden error is not.
    expect(fieldLabel(acmeStory, 'unlabelled')).toBe('unlabelled');
    expect(fieldLabel(undefined, 'somethingNew')).toBe('somethingNew');
  });
});

// Dirt is divergence from the SYNCED BASELINE. Comparing against the item's current
// value — which the item modal used to do — can only ever add flags, so a field
// edited away and back stayed dirty forever and every push re-sent a change the
// backend already had.
describe('recomputeDirty', () => {
  const synced = (over: Partial<WorkItem> = {}): WorkItem =>
    anItem({
      id: 'it_1',
      externalId: 'EXT-1',
      sprintId: 'sp_1',
      points: 5,
      dirtyFields: [],
      syncedValues: { points: 5, sprint: 'sp_1' },
      ...over,
    });

  const view = (over: Partial<CanonicalView> = {}): CanonicalView => ({
    points: 5,
    sprintId: 'sp_1',
    workStreamId: null,
    assignedMemberId: null,
    status: 'Not Started',
    subject: 'S',
    description: '',
    ...over,
  });

  const writeable = new Set(['points', 'sprint']);

  it('marks a field dirty once it leaves the baseline', () => {
    const out = recomputeDirty(synced(), view({ sprintId: 'sp_2' }), writeable, {}, new Set());
    expect(out).toContain('sprint');
  });

  it('CLEARS a field edited back to its baseline', () => {
    // The bug: the item currently sits at sp_2 and is flagged; editing it back to
    // sp_1 must leave it clean, not merely "still dirty because it changed again".
    const item = synced({ sprintId: 'sp_2', dirtyFields: ['sprint'] });
    const out = recomputeDirty(item, view({ sprintId: 'sp_1' }), writeable, {}, new Set());
    expect(out).not.toContain('sprint');
  });

  it('leaves an untouched dirty field alone', () => {
    const item = synced({ points: 8, dirtyFields: ['points'] });
    const out = recomputeDirty(item, view({ points: 8 }), writeable, {}, new Set());
    expect(out).toEqual(['points']);
  });

  it('never touches a flag for a field outside the writeable set', () => {
    // Something that knew more than this call set it; it is not ours to clear.
    const item = synced({ dirtyFields: ['description'] });
    const out = recomputeDirty(item, view(), writeable, {}, new Set());
    expect(out).toContain('description');
  });

  it('tracks vocabulary fields against the baseline too', () => {
    const item = synced({
      attributes: { severity: 'critical' },
      syncedValues: { points: 5, sprint: 'sp_1', severity: 'low' },
      dirtyFields: ['severity'],
    });
    // Back to the synced value → clean.
    expect(recomputeDirty(item, view(), writeable, { severity: 'low' }, new Set(['severity']))).not.toContain('severity');
    // Away from it → dirty.
    expect(recomputeDirty(item, view(), writeable, { severity: 'high' }, new Set(['severity']))).toContain('severity');
  });

  it('falls back to the current value when the baseline lacks the field', () => {
    // A pre-registry item: declaring it clean would silently drop a real edit.
    const item = synced({ syncedValues: { points: 5 } });
    expect(recomputeDirty(item, view({ sprintId: 'sp_9' }), writeable, {}, new Set())).toContain('sprint');
  });

  it('reports nothing dirty when an unbaselined item is saved unchanged', () => {
    // No syncedValues at all (a never-synced item): every field falls back to
    // comparing against itself, so an unchanged save must stay clean.
    const local = anItem({ id: 'it_2', externalId: null, syncedValues: null, sprintId: 'sp_1', points: 5, dirtyFields: [] });
    expect(recomputeDirty(local, view({ sprintId: 'sp_1', points: 5 }), writeable, {}, new Set())).toEqual([]);
  });
});
