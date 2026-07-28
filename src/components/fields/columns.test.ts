import { describe, expect, it } from 'vitest';
import { attributeColumns, streamAttributeColumns } from './columns';
import { anItem } from '../../test/factories';
import type { ReleaseCatalog, WorkItem, WorkStream } from '../../types';

const item = (over: Partial<WorkItem>): WorkItem =>
  anItem({ id: 'it_1', key: 'X-1', externalId: 'X-1', sprintId: null, points: 0, ...over });

const catalog: ReleaseCatalog = {
  statuses: [],
  workStreamFields: [
    { key: 'track', label: 'Track', kind: 'enum', options: [{ value: 'product', label: 'Product' }] },
    { key: 'owner', kind: 'string' },
    { key: 'epicRef', kind: 'ref', target: 'workStream' }, // ref — never a column
    { key: 'charter', label: 'Charter', kind: 'string', detailOnly: true },
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
        { key: 'repro', label: 'Repro steps', kind: 'string', detailOnly: true },
      ],
    },
    {
      id: 'incident',
      label: 'Incident',
      fields: [
        // Same key, different option vocabulary — cells must resolve per type.
        { key: 'severity', label: 'Sev (ops)', kind: 'enum', options: [{ value: 'high', label: 'P1' }] },
        { key: 'rootCause', label: 'Root cause', kind: 'string' },
        // Shared key, suppressed only here — the column survives, this type's cells go blank.
        { key: 'regression', label: 'Regression', kind: 'boolean', detailOnly: true },
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

  it('omits detailOnly fields — they belong to the item detail, not the table', () => {
    expect(attributeColumns(catalog).map((c) => c.key)).not.toContain('repro');
  });

  it('keeps a shared key columnar when another type declares it, blanking the suppressed type', () => {
    const regression = attributeColumns(catalog).find((c) => c.key === 'regression')!;
    const bug = item({ itemType: { id: 'bug', label: 'Bug' }, attributes: { regression: true } });
    const incident = item({ itemType: { id: 'incident', label: 'Incident' }, attributes: { regression: true } });
    expect(regression.cell(bug)).toBe('Yes');
    expect(regression.cell(incident)).toBe('');
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
    planningState: 'open', build: null, externalUrl: null, attributes,
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

  it('omits detailOnly stream fields', () => {
    expect(streamAttributeColumns(catalog).map((c) => c.key)).not.toContain('charter');
  });

  it('formats cells through the declaring spec, em dash when unset', () => {
    const [track] = streamAttributeColumns(catalog);
    expect(track.cell(stream({ track: 'product' }))).toBe('Product');
    expect(track.cell(stream({}))).toBe('—');
    expect(track.cell(stream(undefined))).toBe('—');
  });
});
