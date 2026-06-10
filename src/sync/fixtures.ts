// Fixture data standing in for the local sync service while it doesn't exist yet.
// These are exactly the shapes the real service will return, so the app code that
// consumes them (SyncClient → applySync) is the code we keep.
//
// `FIXTURE_CONNECTORS` mirrors `GET /connectors`; `fixtureMappedRelease()` mirrors
// `POST /releases/{id}/sync` for the Jira connector with representative sample data.

import type { ConnectorMeta, CreateItemInput } from './client';
import type { ContractStatus, ConnectorItemType, MappedItem, MappedRelease, StatusDef } from './schema';
import type { ReleaseConnector } from '../types';
import { attributeFields, itemTypeFor } from '../lib/connectorFields';

// The fixture backend's status vocabulary: its native workflow states, each
// mapped onto a canonical category. Two states share Under Review to exercise
// the many-to-one mapping the categories exist for.
const JIRA_STATUSES: StatusDef[] = [
  { id: 'backlog', label: 'Backlog', category: 'Not Started' },
  { id: 'dev', label: 'In Dev', category: 'In Progress' },
  { id: 'review', label: 'In Review', category: 'Under Review' },
  { id: 'qa', label: 'In QA', category: 'Under Review' },
  { id: 'blocked', label: 'Blocked', category: 'Blocked' },
  { id: 'done', label: 'Done', category: 'Complete' },
];

/** The native state a category maps back to (first match) — used when the app
 *  supplies a canonical status (e.g. item creation) and the fixture needs a
 *  native id, the way a real service would pick its default workflow state. */
function nativeForCategory(status: ContractStatus): { id: string; label: string } | null {
  const def = JIRA_STATUSES.find((s) => s.category === status);
  return def ? { id: def.id, label: def.label } : null;
}

// The Jira fixture's item-type catalog, declared as DATA (kind/role/target +
// access). Each field is listed once; `creatable` shows it on the create form,
// `writeable` makes it pushable. Story/Task/Bug keep points + sprint writeable to
// match current push behavior; identity fields are create-once (writeable:false).
const JIRA_ITEM_TYPES: ConnectorItemType[] = [
  {
    id: 'jira_story',
    label: 'Story',
    fields: [
      { key: 'subject', label: 'Summary', kind: 'string', role: 'subject', required: true, creatable: true, writeable: false },
      { key: 'description', label: 'Description', kind: 'string', role: 'description', multiline: true, creatable: true, writeable: false },
      { key: 'workStream', label: 'Epic', kind: 'ref', target: 'workStream', required: true, creatable: true, writeable: false },
      { key: 'sprint', label: 'Sprint', kind: 'ref', target: 'sprint', creatable: true, writeable: true },
      { key: 'assignee', label: 'Assignee', kind: 'ref', target: 'member', creatable: true, writeable: false },
      { key: 'points', label: 'Story points', kind: 'number', role: 'points', creatable: true, writeable: true },
      { key: 'status', label: 'Status', kind: 'enum', enumRef: 'status', writeable: true },
    ],
  },
  {
    id: 'jira_task',
    label: 'Task',
    fields: [
      { key: 'subject', label: 'Summary', kind: 'string', role: 'subject', required: true, creatable: true, writeable: false },
      { key: 'workStream', label: 'Epic', kind: 'ref', target: 'workStream', creatable: true, writeable: false },
      { key: 'sprint', label: 'Sprint', kind: 'ref', target: 'sprint', creatable: true, writeable: true },
      { key: 'points', label: 'Story points', kind: 'number', role: 'points', creatable: true, writeable: true },
      { key: 'status', label: 'Status', kind: 'enum', enumRef: 'status', writeable: true },
    ],
  },
  {
    id: 'jira_bug',
    label: 'Bug',
    fields: [
      { key: 'subject', label: 'Summary', kind: 'string', role: 'subject', required: true, creatable: true, writeable: false },
      { key: 'description', label: 'Steps to reproduce', kind: 'string', role: 'description', multiline: true, creatable: true, writeable: false },
      { key: 'workStream', label: 'Epic', kind: 'ref', target: 'workStream', required: true, creatable: true, writeable: false },
      { key: 'sprint', label: 'Sprint', kind: 'ref', target: 'sprint', creatable: true, writeable: true },
      { key: 'assignee', label: 'Assignee', kind: 'ref', target: 'member', creatable: true, writeable: false },
      { key: 'points', label: 'Story points', kind: 'number', role: 'points', creatable: true, writeable: true },
      { key: 'status', label: 'Status', kind: 'enum', enumRef: 'status', writeable: true },
      {
        key: 'severity',
        label: 'Severity',
        kind: 'enum',
        required: true,
        creatable: true,
        writeable: true,
        options: [
          { value: 'low', label: 'Low' },
          { value: 'medium', label: 'Medium' },
          { value: 'high', label: 'High' },
          { value: 'critical', label: 'Critical' },
        ],
      },
    ],
  },
];

export const FIXTURE_CONNECTORS: ConnectorMeta[] = [
  {
    type: 'jira',
    label: 'Jira',
    configFields: [
      { key: 'projectKey', label: 'Project key', required: true, hint: 'e.g. PROJ' },
      { key: 'boardId', label: 'Board ID', required: true, hint: 'numeric; sprints come from this board' },
      { key: 'fixVersion', label: 'Fix version', required: true, hint: 'e.g. 4.0' },
      { key: 'siteUrl', label: 'Site URL', required: true, hint: 'e.g. your-org.atlassian.net' },
      { key: 'storyPointsField', label: 'Story-points field id', required: false, hint: 'defaults to customfield_10016' },
    ],
    itemTypes: JIRA_ITEM_TYPES,
    statuses: JIRA_STATUSES,
  },
];

// Monotonic counter so each fixture-created item gets a unique externalId/key.
let createSeq = 0;

/**
 * Stand-in for `POST /releases/{id}/items`: synthesizes the MappedItem the real
 * service would return after creating the item in the backend (key + externalId
 * assigned, fields normalized), so the app can reconcile it as a synced item.
 */
export function fixtureCreatedItem(connector: ReleaseConnector, req: CreateItemInput): MappedItem {
  const n = 900 + createSeq++;
  const prefix = (connector.config.projectKey || 'NEW').toUpperCase();
  const fields = (req.fields ?? {}) as Record<string, unknown>;
  const itype = itemTypeFor(req.type, JIRA_ITEM_TYPES);
  const typeLabel = itype?.label ?? 'Task';
  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  // Echo catalog-declared vocabulary values back as attributes (what the real
  // service does at its boundary): declared keys only, scalars only.
  const attributes: Record<string, string | number | boolean | null> = {};
  for (const f of attributeFields(itype)) {
    const v = fields[f.key];
    if (v == null || v === '') continue;
    attributes[f.key] = typeof v === 'number' || typeof v === 'boolean' ? v : String(v);
  }
  return {
    externalId: `EXT-${n}`,
    extWorkStreamId: req.extWorkStreamId ?? null,
    extSprintId: req.extSprintId ?? null,
    extAssigneeId: req.extAssigneeId ?? null,
    attributes,
    fields: {
      key: `${prefix}-${n}`,
      subject: String(fields.subject ?? 'Untitled item'),
      description: String(fields.description ?? ''),
      status: ((fields.status as ContractStatus) ?? 'Not Started'),
      statusNative: nativeForCategory((fields.status as ContractStatus) ?? 'Not Started'),
      points: num(fields.points),
      itemType: { id: req.type, label: typeLabel },
    },
  };
}

// External sprint dates are intentionally near the typical demo release start; the engine
// links them onto the fixed grid by chronological order regardless of exact dates.
export function fixtureMappedRelease(): MappedRelease {
  return {
    team: {
      externalId: 'JIRA-TEAM-PLAT',
      fields: { name: 'Platform Core' },
      members: [
        { externalId: 'JIRA-USR-ADA', fields: { name: 'Ada L.' } },
        { externalId: 'JIRA-USR-MARCO', fields: { name: 'Marco P.' } },
        { externalId: 'JIRA-USR-WEI', fields: { name: 'Wei C.' } },
        { externalId: 'JIRA-USR-DEVI', fields: { name: 'Devi R.' } },
        { externalId: 'JIRA-USR-TOM', fields: { name: 'Tom B.' } },
        // EM pulled in by Jira; flagged as non-contributing so they don't dilute capacity
        { externalId: 'JIRA-USR-PETE', fields: { name: 'Pete O.', nonContributing: true } },
      ],
    },
    workStreams: [
      { externalId: 'EPIC-CHK', fields: { name: 'Checkout API' } },
      { externalId: 'EPIC-SRCH', fields: { name: 'Search Revamp' } },
      { externalId: 'EPIC-BILL', fields: { name: 'Billing Migration' } },
    ],
    sprints: [
      { externalId: 'JSPR-101', fields: { name: 'Sprint 1', startISO: '2026-04-13', endISO: '2026-04-26' } },
      { externalId: 'JSPR-102', fields: { name: 'Sprint 2', startISO: '2026-04-27', endISO: '2026-05-10' } },
      { externalId: 'JSPR-103', fields: { name: 'Sprint 3', startISO: '2026-05-11', endISO: '2026-05-24' } },
    ],
    items: [
      { externalId: 'EXT-101', extWorkStreamId: 'EPIC-CHK', extSprintId: 'JSPR-101', extAssigneeId: 'JIRA-USR-ADA', fields: { key: 'EXT-101', subject: 'Tokenize card vault', description: 'PCI-scoped vault for card tokens.', status: 'Complete', statusNative: { id: 'done', label: 'Done' }, points: 5, itemType: { id: 'jira_story', label: 'Story' } } },
      { externalId: 'EXT-102', extWorkStreamId: 'EPIC-CHK', extSprintId: 'JSPR-101', extAssigneeId: 'JIRA-USR-MARCO', fields: { key: 'EXT-102', subject: 'Idempotent charge endpoint', description: '', status: 'In Progress', statusNative: { id: 'dev', label: 'In Dev' }, points: 3, itemType: { id: 'jira_story', label: 'Story' } } },
      { externalId: 'EXT-103', extWorkStreamId: 'EPIC-CHK', extSprintId: 'JSPR-102', extAssigneeId: 'JIRA-USR-WEI', fields: { key: 'EXT-103', subject: '3-D Secure handshake', description: '', status: 'Under Review', statusNative: { id: 'qa', label: 'In QA' }, points: 8, itemType: { id: 'jira_story', label: 'Story' } } },
      { externalId: 'EXT-110', extWorkStreamId: 'EPIC-SRCH', extSprintId: 'JSPR-101', extAssigneeId: 'JIRA-USR-DEVI', fields: { key: 'EXT-110', subject: 'Typeahead suggestions', description: '', status: 'Complete', statusNative: { id: 'done', label: 'Done' }, points: 3, itemType: { id: 'jira_story', label: 'Story' } } },
      { externalId: 'EXT-111', extWorkStreamId: 'EPIC-SRCH', extSprintId: 'JSPR-102', extAssigneeId: 'JIRA-USR-TOM', fields: { key: 'EXT-111', subject: 'Relevance ranking model', description: '', status: 'Blocked', statusNative: { id: 'blocked', label: 'Blocked' }, points: 5, itemType: { id: 'jira_task', label: 'Task' } } },
      // A Bug with a vocabulary field — exercises the attribute round-trip + read-only display.
      { externalId: 'EXT-112', extWorkStreamId: 'EPIC-SRCH', extSprintId: 'JSPR-103', extAssigneeId: 'JIRA-USR-DEVI', attributes: { severity: 'high' }, fields: { key: 'EXT-112', subject: 'Stale results after reindex', description: 'Cache not invalidated on reindex completion.', status: 'Not Started', statusNative: { id: 'backlog', label: 'Backlog' }, points: 2, itemType: { id: 'jira_bug', label: 'Bug' } } },
      { externalId: 'EXT-120', extWorkStreamId: 'EPIC-BILL', extSprintId: 'JSPR-102', extAssigneeId: 'JIRA-USR-ADA', fields: { key: 'EXT-120', subject: 'Dual-write ledger', description: '', status: 'In Progress', statusNative: { id: 'dev', label: 'In Dev' }, points: 8, itemType: { id: 'jira_story', label: 'Story' } } },
      { externalId: 'EXT-121', extWorkStreamId: 'EPIC-BILL', extSprintId: 'JSPR-103', extAssigneeId: 'JIRA-USR-MARCO', fields: { key: 'EXT-121', subject: 'Proration engine', description: '', status: 'Not Started', statusNative: { id: 'backlog', label: 'Backlog' }, points: 5, itemType: { id: 'jira_story', label: 'Story' } } },
      // Unscheduled (no external sprint) → lands in the backlog.
      { externalId: 'EXT-122', extWorkStreamId: 'EPIC-BILL', extSprintId: null, extAssigneeId: null, fields: { key: 'EXT-122', subject: 'Legacy data backfill', description: '', status: 'Not Started', statusNative: { id: 'backlog', label: 'Backlog' }, points: 3, itemType: { id: 'jira_task', label: 'Task' } } },
    ],
  };
}
