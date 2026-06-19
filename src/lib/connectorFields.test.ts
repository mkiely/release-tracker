import { describe, expect, it } from 'vitest';
import { allWriteableLocalFields, attributeFields, capabilitySummary, conceptWriteable, isAttributeField, itemTypeFor, missingCapabilities, writeableAttributeFields, writeableLocalFields } from './connectorFields';
import type { ConnectorItemType } from '../sync/schema';

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
