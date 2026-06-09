import { describe, expect, it } from 'vitest';
import { allWriteableLocalFields, attributeFields, conceptWriteable, isAttributeField, itemTypeFor, writeableAttributeFields, writeableLocalFields } from './connectorFields';
import type { ConnectorItemType } from '../sync/schema';

const story: ConnectorItemType = {
  id: 'jira_story',
  label: 'Story',
  fields: [
    { key: 'subject', kind: 'string', role: 'subject', creatable: true, writeable: false },
    { key: 'sprint', kind: 'ref', target: 'sprint', creatable: true, writeable: true },
    { key: 'points', kind: 'number', role: 'points', creatable: true, writeable: true },
  ],
};
const readonlyType: ConnectorItemType = {
  id: 'jira_ro',
  label: 'RO',
  fields: [{ key: 'subject', kind: 'string', role: 'subject', creatable: true, writeable: false }],
};

describe('itemTypeFor', () => {
  it('resolves by id; undefined for null/unknown/no catalog', () => {
    expect(itemTypeFor('jira_story', [story])?.label).toBe('Story');
    expect(itemTypeFor('nope', [story])).toBeUndefined();
    expect(itemTypeFor(null, [story])).toBeUndefined();
    expect(itemTypeFor('jira_story', undefined)).toBeUndefined();
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
    id: 'jira_bug',
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
