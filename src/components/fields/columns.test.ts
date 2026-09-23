import { describe, expect, it } from 'vitest';
import {
  applyColumnPrefs,
  attributeColumns,
  DEFAULT_COLUMN_PREFS,
  fitSpecs,
  itemColumns,
  moveColumn,
  resizableWidths,
  setColumnVisible,
  streamAttributeColumns,
  type ColumnPrefs,
  type ItemCellCtx,
} from './columns';
import { aStream, anItem } from '../../test/factories';
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
        { key: 'token', label: 'Deploy token', kind: 'string', sensitive: true },
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
      ['attr:repro', 'Repro steps'],
      ['attr:rootCause', 'Root cause'],
    ]);
  });

  it('returns no columns without a catalog (local releases)', () => {
    expect(attributeColumns(null)).toEqual([]);
    expect(attributeColumns(undefined)).toEqual([]);
  });

  it('never projects a sensitive field into a column', () => {
    // The detail masks it; a table cell would show the secret to the room, and
    // carry it into shares and exports. Not a default the picker can override.
    expect(attributeColumns(catalog).map((c) => c.key)).not.toContain('attr:token');
  });

  it('offers detailOnly fields as columns that start hidden', () => {
    // Contract 0.18.0 suppressed these outright; with a user column picker the
    // hint reads as a default instead of a prohibition.
    const repro = attributeColumns(catalog).find((c) => c.key === 'attr:repro');
    expect(repro?.defaultHidden).toBe(true);
  });

  it('leaves a shared key visible when any declaring type wants it columnar', () => {
    // 'regression' is detailOnly on Incident but plain on Bug.
    const regression = attributeColumns(catalog).find((c) => c.key === 'attr:regression');
    expect(regression?.defaultHidden).toBe(false);
  });

  it('renders a shared key for every declaring type, detailOnly or not', () => {
    // Suppression used to be per spec, so a type marking the key detailOnly got a
    // blank cell in a column another type declared. Now detailOnly only decides
    // whether the column *starts* hidden — once shown, it shows every value it has.
    const regression = attributeColumns(catalog).find((c) => c.key === 'attr:regression')!;
    const bug = item({ itemType: { id: 'bug', label: 'Bug' }, attributes: { regression: true } });
    const incident = item({ itemType: { id: 'incident', label: 'Incident' }, attributes: { regression: true } });
    expect(regression.value!(bug, cellCtx)).toBe('Yes');
    expect(regression.value!(incident, cellCtx)).toBe('Yes');
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
      'key', 'type', 'pts', 'assignee', 'status', 'build', 'created', 'updated',
      'attr:severity', 'attr:regression', 'attr:repro', 'attr:rootCause',
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
      'key', 'type', 'pts', 'assignee', 'status', 'build', 'created', 'updated', 'title',
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

describe('column preferences — hiding and ordering', () => {
  const cols = () => itemColumns(catalog, { members: [] });
  const keys = (prefs: ColumnPrefs) => applyColumnPrefs(cols(), prefs).map((c) => c.key);
  const col = (key: string) => cols().find((c) => c.key === key)!;

  it('shows everything but the default-hidden columns when nothing is set', () => {
    expect(keys(DEFAULT_COLUMN_PREFS)).toEqual([
      'key', 'type', 'pts', 'assignee', 'status', 'build',
      'attr:severity', 'attr:regression', 'attr:rootCause', 'title',
    ]);
    // Created / Last modified are built-ins that start hidden.
    expect(keys(DEFAULT_COLUMN_PREFS)).not.toContain('created');
  });

  it('hides a column the user turned off', () => {
    const prefs = setColumnVisible(DEFAULT_COLUMN_PREFS, col('build'), false);
    expect(keys(prefs)).not.toContain('build');
  });

  it('shows a default-hidden column once the user turns it on', () => {
    const prefs = setColumnVisible(DEFAULT_COLUMN_PREFS, col('attr:repro'), true);
    expect(keys(prefs)).toContain('attr:repro');
  });

  it('refuses to hide a locked column', () => {
    const prefs = setColumnVisible(DEFAULT_COLUMN_PREFS, col('key'), false);
    expect(prefs).toBe(DEFAULT_COLUMN_PREFS);
    expect(keys(prefs)).toContain('key');
  });

  it('applies a saved order', () => {
    const prefs: ColumnPrefs = { visibility: {}, order: ['title', 'key', 'status'] };
    expect(keys(prefs).slice(0, 3)).toEqual(['title', 'key', 'status']);
  });

  it('keeps columns the saved order predates, after the ones it names', () => {
    // A connector adding a field must not silently disappear from every table.
    const prefs: ColumnPrefs = { visibility: {}, order: ['title', 'key'] };
    const result = keys(prefs);
    expect(result.slice(0, 2)).toEqual(['title', 'key']);
    expect(result).toContain('attr:severity');
  });

  it('moves a column to where the drop target sits', () => {
    const prefs = moveColumn(DEFAULT_COLUMN_PREFS, cols(), 'title', 'type');
    expect(keys(prefs).slice(0, 3)).toEqual(['key', 'title', 'type']);
  });

  it('records the full order on a move, hidden columns included', () => {
    // So a column hidden and shown again returns to its place, not the end.
    const prefs = moveColumn(DEFAULT_COLUMN_PREFS, cols(), 'title', 'type');
    expect(prefs.order).toContain('attr:repro');
  });

  it('flexes exactly the last column, whichever it ends up being', () => {
    const moved = applyColumnPrefs(cols(), moveColumn(DEFAULT_COLUMN_PREFS, cols(), 'title', 'type'));
    // Title dragged inwards stops stretching…
    expect(moved.find((c) => c.key === 'title')!.width.flex).toBe(false);
    // …and whatever now sits last takes the slack instead of leaving dead space.
    expect(moved[moved.length - 1].width.flex).toBe(true);
  });

  it('leaves the natural order flexing on Title', () => {
    const shown = applyColumnPrefs(cols(), DEFAULT_COLUMN_PREFS);
    expect(shown[shown.length - 1].key).toBe('title');
    expect(shown[shown.length - 1].width.flex).toBe(true);
  });

  it('is a no-op when a column is dropped on itself', () => {
    expect(moveColumn(DEFAULT_COLUMN_PREFS, cols(), 'title', 'title')).toBe(DEFAULT_COLUMN_PREFS);
  });

  it('survives an order naming a column this table does not have', () => {
    const prefs: ColumnPrefs = { visibility: {}, order: ['sprint', 'title', 'key'] };
    expect(keys(prefs).slice(0, 2)).toEqual(['title', 'key']);
  });
});

describe('vocabulary column widths', () => {
  it('gives each field its own resize variable', () => {
    // One shared '--rt-col-attr' meant twenty connector fields resized as a block.
    const vars = attributeColumns(catalog).map((c) => c.width.var);
    expect(vars).toEqual(['attr-severity', 'attr-regression', 'attr-repro', 'attr-rootCause']);
  });

  it('keeps them individually resizable at the shared default width', () => {
    for (const c of attributeColumns(catalog)) {
      expect(c.width).toMatchObject({ base: 104, min: 50, resizable: true });
    }
  });
});

describe('timestamp columns', () => {
  const col = (key: string) => itemColumns(null, { members: [] }).find((c) => c.key === key)!;

  it('starts hidden — useful for auditing staleness, noise otherwise', () => {
    expect(col('created').defaultHidden).toBe(true);
    expect(col('updated').defaultHidden).toBe(true);
  });

  it('renders an instant for humans and an em dash when unknown', () => {
    const at = new Date(2026, 3, 13, 14, 3).toISOString();
    expect(col('created').value!(item({ createdISO: at }), cellCtx)).toBe('Apr 13, 2026, 14:03');
    expect(col('created').value!(item({ createdISO: null }), cellCtx)).toBe('—');
  });

  it('sorts chronologically, not by the rendered text', () => {
    expect(col('updated').sort!.kind).toBe('date');
    const march = item({ updatedISO: '2026-03-14T09:00:00Z' });
    expect(col('updated').sort!.valueOf(march, {} as never)).toBe('2026-03-14T09:00:00Z');
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
    expect(defaults).toEqual({ type: 100, pts: 40, build: 120, created: 140, updated: 140, sprint: 130, workstream: 130 });
    expect(mins).toEqual({ type: 50, pts: 30, build: 50, created: 60, updated: 60, sprint: 60, workstream: 60 });
  });

  it('leaves vocabulary columns out — their variables are per field, not shared', () => {
    expect(Object.keys(resizableWidths().defaults)).not.toContain('attr');
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
  const stream = (attributes: WorkStream['attributes']): WorkStream => aStream({ id: 'ws_1', attributes });

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
