import { describe, expect, it } from 'vitest';
import { attributeColumns, fitSpecs, itemColumns, resizableWidths, streamAttributeColumns, type ItemCellCtx } from './columns';
import { anItem } from '../../test/factories';
import type { ReleaseCatalog, WorkItem, WorkStream } from '../../types';

const cellCtx: ItemCellCtx = { members: [] };

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
      ['attr:severity', 'Severity'],
      ['attr:regression', 'Regression'],
      ['attr:rootCause', 'Root cause'],
    ]);
  });

  it('returns no columns without a catalog (local releases)', () => {
    expect(attributeColumns(null)).toEqual([]);
    expect(attributeColumns(undefined)).toEqual([]);
  });

  it('omits detailOnly fields — they belong to the item detail, not the table', () => {
    expect(attributeColumns(catalog).map((c) => c.key)).not.toContain('attr:repro');
  });

  it('keeps a shared key columnar when another type declares it, blanking the suppressed type', () => {
    const regression = attributeColumns(catalog).find((c) => c.key === 'attr:regression')!;
    const bug = item({ itemType: { id: 'bug', label: 'Bug' }, attributes: { regression: true } });
    const incident = item({ itemType: { id: 'incident', label: 'Incident' }, attributes: { regression: true } });
    expect(regression.value!(bug, cellCtx)).toBe('Yes');
    expect(regression.value!(incident, cellCtx)).toBe('');
  });

  it('formats cells through the spec of the item own type (per-type enum labels)', () => {
    const [severity] = attributeColumns(catalog);
    const bug = item({ itemType: { id: 'bug', label: 'Bug' }, attributes: { severity: 'high' } });
    const incident = item({ itemType: { id: 'incident', label: 'Incident' }, attributes: { severity: 'high' } });
    expect(severity.value!(bug, cellCtx)).toBe('High');
    expect(severity.value!(incident, cellCtx)).toBe('P1');
  });

  it("renders '' for types that don't declare the field and an em dash for declared-but-unset", () => {
    const cols = attributeColumns(catalog);
    const rootCause = cols.find((c) => c.key === 'attr:rootCause')!;
    const bug = item({ itemType: { id: 'bug', label: 'Bug' }, attributes: {} });
    const incident = item({ itemType: { id: 'incident', label: 'Incident' }, attributes: {} });
    const untyped = item({ itemType: null });
    expect(rootCause.value!(bug, cellCtx)).toBe('');       // bug doesn't declare rootCause
    expect(rootCause.value!(incident, cellCtx)).toBe('—'); // declared, unset
    expect(rootCause.value!(untyped, cellCtx)).toBe('');   // no type to resolve through
  });
});

describe('itemColumns', () => {
  const ctx = (over: Partial<ItemCellCtx> = {}): ItemCellCtx => ({ members: [], ...over });
  const ids = (c: ItemCellCtx) => itemColumns(catalog, c).map((col) => col.key);

  it('orders built-ins, then the catalog columns, then position and title', () => {
    expect(ids(ctx({ sprintName: () => 'Sprint 1', workStream: () => ({ id: null, name: 'None' }) }))).toEqual([
      'key', 'type', 'pts', 'assignee', 'status', 'build',
      'attr:severity', 'attr:regression', 'attr:rootCause',
      'sprint', 'workstream', 'title',
    ]);
  });

  it('drops Sprint and Work Stream when the view supplies no accessor for them', () => {
    // A table already banded by sprint would only repeat its band heading.
    expect(ids(ctx())).not.toContain('sprint');
    expect(ids(ctx())).not.toContain('workstream');
  });

  it('keeps a column the moment its accessor appears', () => {
    expect(ids(ctx({ sprintName: () => 'Sprint 1' }))).toContain('sprint');
  });

  it('yields only built-ins and title for a local release (no catalog)', () => {
    expect(itemColumns(null, ctx()).map((c) => c.key)).toEqual([
      'key', 'type', 'pts', 'assignee', 'status', 'build', 'title',
    ]);
  });

  it('gives every column a sort spec, so no header is dead', () => {
    expect(itemColumns(catalog, ctx()).every((c) => c.sort !== undefined)).toBe(true);
  });

  it('renders each column through exactly one of cell or value', () => {
    for (const c of itemColumns(catalog, ctx())) {
      expect(Boolean(c.cell) !== Boolean(c.value)).toBe(true);
    }
  });
});

describe('fitSpecs', () => {
  const items = [
    item({ key: 'ORN-1042', status: 'In Progress' }),
    item({ key: 'ORN-9', status: 'Blocked', dirtyFields: ['points'] }),
  ];

  it('emits a spec per fit-to-content column, keyed by its CSS variable', () => {
    expect(fitSpecs(itemColumns(null, { members: [] }), items).map((f) => f.cssVar))
      .toEqual(['--rt-col-key', '--rt-col-status']);
  });

  it('measures the values actually in the column, header included', () => {
    const [key] = fitSpecs(itemColumns(null, { members: [] }), items);
    expect(key.values).toEqual(['ORN-1042', 'ORN-9', 'Key']);
  });

  it('reserves room for the dirty marker only when an item has one', () => {
    const cols = itemColumns(null, { members: [] });
    const dirty = fitSpecs(cols, items)[0].chrome;
    const clean = fitSpecs(cols, [item({ key: 'ORN-1' })])[0].chrome;
    expect(dirty).toBeGreaterThan(clean);
  });
});

describe('resizableWidths', () => {
  it('derives defaults and floors from the column definitions themselves', () => {
    const { defaults, mins } = resizableWidths();
    expect(defaults).toEqual({ type: 100, pts: 40, build: 120, sprint: 130, workstream: 130, attr: 104 });
    expect(mins).toEqual({ type: 50, pts: 30, build: 50, sprint: 60, workstream: 60, attr: 50 });
  });

  it('omits columns that are not user-resizable', () => {
    // Key and Status are measured, not dragged; Assignee and Title are fixed.
    const { defaults } = resizableWidths();
    expect(Object.keys(defaults)).not.toContain('key');
    expect(Object.keys(defaults)).not.toContain('status');
  });
});

describe('attributeColumns — sort specs', () => {
  // The column carries how it sorts, so the table never sorts by rendered text.
  const dated: ReleaseCatalog = {
    statuses: [],
    workStreamFields: [],
    itemTypes: [{
      id: 'bug',
      label: 'Bug',
      fields: [
        { key: 'due', label: 'Due', kind: 'date' },
        { key: 'rank', label: 'Rank', kind: 'number' },
        { key: 'owner', label: 'Owner', kind: 'string' },
        { key: 'regression', label: 'Regression', kind: 'boolean' },
      ],
    }],
  };

  it('derives the comparator from the field kind', () => {
    const kinds = Object.fromEntries(attributeColumns(dated).map((c) => [c.key, c.sort!.kind]));
    expect(kinds).toEqual({ 'attr:due': 'date', 'attr:rank': 'number', 'attr:owner': 'text', 'attr:regression': 'text' });
  });

  it('sorts enums by catalog option order, unioned across declaring types', () => {
    const [severity] = attributeColumns(catalog);
    expect(severity.sort!.kind).toBe('order');
    expect(severity.sort!.order).toEqual({ high: 0 });
  });

  it('reads the stored value, not the formatted cell', () => {
    const [severity] = attributeColumns(catalog);
    const bug = item({ itemType: { id: 'bug', label: 'Bug' }, attributes: { severity: 'high' } });
    expect(severity.value!(bug, cellCtx)).toBe('High');            // display
    expect(severity.sort!.valueOf(bug, {} as never)).toBe('high'); // data
  });

  it('reads null for an item with no value, so blanks-last applies', () => {
    const [severity] = attributeColumns(catalog);
    expect(severity.sort!.valueOf(item({ attributes: {} }), {} as never)).toBeNull();
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
