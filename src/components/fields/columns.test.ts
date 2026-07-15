import { describe, expect, it } from 'vitest';
import { attributeColumns, streamAttributeColumns } from './columns';
import type { ReleaseCatalog, WorkItem, WorkStream } from '../../types';

const item = (over: Partial<WorkItem>): WorkItem => ({
  id: 'it_1', releaseId: 'rel_1', workStreamId: 'ws_1', sprintId: null,
  key: 'X-1', subject: 'S', description: '', status: 'Not Started', points: 0,
  externalId: 'X-1', assignedMemberId: null, build: null, externalUrl: null, dirtyFields: [],
  itemType: null, ...over,
});

const catalog: ReleaseCatalog = {
  statuses: [],
  workStreamFields: [
    { key: 'track', label: 'Track', kind: 'enum', options: [{ value: 'product', label: 'Product' }] },
    { key: 'owner', kind: 'string' },
    { key: 'epicRef', kind: 'ref', target: 'workStream' }, // ref — never a column
  ],
  itemTypes: [
    {
      id: 'bug',
      label: 'Bug',
      fields: [
        { key: 'subject', kind: 'string', role: 'subject' },              // canonical — never a column
        { key: 'sprint', kind: 'ref', target: 'sprint' },                 // ref — never a column
        { key: 'severity', label: 'Severity', kind: 'enum', options: [{ value: 'high', label: 'High' }] },
        { key: 'regression', label: 'Regression', kind: 'boolean' },
      ],
    },
    {
      id: 'incident',
      label: 'Incident',
      fields: [
        // Same key, different option vocabulary — cells must resolve per type.
        { key: 'severity', label: 'Sev (ops)', kind: 'enum', options: [{ value: 'high', label: 'P1' }] },
        { key: 'rootCause', label: 'Root cause', kind: 'string' },
      ],
    },
  ],
};

describe('attributeColumns', () => {
  it('projects the union of vocabulary fields in first-seen order, skipping canonical fields', () => {
    expect(attributeColumns(catalog).map((c) => [c.key, c.label])).toEqual([
      ['severity', 'Severity'],
      ['regression', 'Regression'],
      ['rootCause', 'Root cause'],
    ]);
  });

  it('returns no columns without a catalog (local releases)', () => {
    expect(attributeColumns(null)).toEqual([]);
    expect(attributeColumns(undefined)).toEqual([]);
  });

  it('formats cells through the spec of the item own type (per-type enum labels)', () => {
    const [severity] = attributeColumns(catalog);
    const bug = item({ itemType: { id: 'bug', label: 'Bug' }, attributes: { severity: 'high' } });
    const incident = item({ itemType: { id: 'incident', label: 'Incident' }, attributes: { severity: 'high' } });
    expect(severity.cell(bug)).toBe('High');
    expect(severity.cell(incident)).toBe('P1');
  });

  it("renders '' for types that don't declare the field and an em dash for declared-but-unset", () => {
    const cols = attributeColumns(catalog);
    const rootCause = cols.find((c) => c.key === 'rootCause')!;
    const bug = item({ itemType: { id: 'bug', label: 'Bug' }, attributes: {} });
    const incident = item({ itemType: { id: 'incident', label: 'Incident' }, attributes: {} });
    const untyped = item({ itemType: null });
    expect(rootCause.cell(bug)).toBe('');       // bug doesn't declare rootCause
    expect(rootCause.cell(incident)).toBe('—'); // declared, unset
    expect(rootCause.cell(untyped)).toBe('');   // no type to resolve through
  });
});

describe('streamAttributeColumns', () => {
  const stream = (attributes: WorkStream['attributes']): WorkStream => ({
    id: 'ws_1', name: 'API', externalId: null, engineersRequired: null,
    planningMuted: false, build: null, externalUrl: null, attributes,
  });

  it('projects vocabulary stream fields flat, skipping non-attribute shapes', () => {
    expect(streamAttributeColumns(catalog).map((c) => [c.key, c.label])).toEqual([
      ['track', 'Track'],
      ['owner', 'owner'], // label falls back to key
    ]);
  });

  it('returns no columns without a catalog (local releases)', () => {
    expect(streamAttributeColumns(null)).toEqual([]);
    expect(streamAttributeColumns(undefined)).toEqual([]);
  });

  it('formats cells through the declaring spec, em dash when unset', () => {
    const [track] = streamAttributeColumns(catalog);
    expect(track.cell(stream({ track: 'product' }))).toBe('Product');
    expect(track.cell(stream({}))).toBe('—');
    expect(track.cell(stream(undefined))).toBe('—');
  });
});
