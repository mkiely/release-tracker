import { describe, expect, it } from 'vitest';
import { allWriteableLocalFields, conceptWriteable, itemTypeFor, writeableLocalFields } from './connectorFields';
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
