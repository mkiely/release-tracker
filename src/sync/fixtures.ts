// Fixture data standing in for the local sync service while it doesn't exist yet.
// These are exactly the shapes the real service will return, so the app code that
// consumes them (SyncClient → applySync) is the code we keep.
//
// `FIXTURE_CONNECTORS` mirrors `GET /connectors`; `fixtureMappedRelease()` mirrors
// `POST /releases/{id}/sync` for the Jira connector with representative sample data.

import type { ConnectorMeta } from './client';
import type { MappedRelease } from './schema';

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
    writeable: { item: ['points', 'sprint'] },
  },
];

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
      { externalId: 'EXT-101', extWorkStreamId: 'EPIC-CHK', extSprintId: 'JSPR-101', extAssigneeId: 'JIRA-USR-ADA', fields: { key: 'EXT-101', subject: 'Tokenize card vault', description: 'PCI-scoped vault for card tokens.', status: 'Complete', points: 5, itemType: { id: 'jira_story', label: 'Story' } } },
      { externalId: 'EXT-102', extWorkStreamId: 'EPIC-CHK', extSprintId: 'JSPR-101', extAssigneeId: 'JIRA-USR-MARCO', fields: { key: 'EXT-102', subject: 'Idempotent charge endpoint', description: '', status: 'Active', points: 3, itemType: { id: 'jira_story', label: 'Story' } } },
      { externalId: 'EXT-103', extWorkStreamId: 'EPIC-CHK', extSprintId: 'JSPR-102', extAssigneeId: 'JIRA-USR-WEI', fields: { key: 'EXT-103', subject: '3-D Secure handshake', description: '', status: 'Active', points: 8, itemType: { id: 'jira_story', label: 'Story' } } },
      { externalId: 'EXT-110', extWorkStreamId: 'EPIC-SRCH', extSprintId: 'JSPR-101', extAssigneeId: 'JIRA-USR-DEVI', fields: { key: 'EXT-110', subject: 'Typeahead suggestions', description: '', status: 'Complete', points: 3, itemType: { id: 'jira_story', label: 'Story' } } },
      { externalId: 'EXT-111', extWorkStreamId: 'EPIC-SRCH', extSprintId: 'JSPR-102', extAssigneeId: 'JIRA-USR-TOM', fields: { key: 'EXT-111', subject: 'Relevance ranking model', description: '', status: 'Blocked', points: 5, itemType: { id: 'jira_task', label: 'Task' } } },
      { externalId: 'EXT-120', extWorkStreamId: 'EPIC-BILL', extSprintId: 'JSPR-102', extAssigneeId: 'JIRA-USR-ADA', fields: { key: 'EXT-120', subject: 'Dual-write ledger', description: '', status: 'Active', points: 8, itemType: { id: 'jira_story', label: 'Story' } } },
      { externalId: 'EXT-121', extWorkStreamId: 'EPIC-BILL', extSprintId: 'JSPR-103', extAssigneeId: 'JIRA-USR-MARCO', fields: { key: 'EXT-121', subject: 'Proration engine', description: '', status: 'Not Started', points: 5, itemType: { id: 'jira_story', label: 'Story' } } },
      // Unscheduled (no external sprint) → lands in the backlog.
      { externalId: 'EXT-122', extWorkStreamId: 'EPIC-BILL', extSprintId: null, extAssigneeId: null, fields: { key: 'EXT-122', subject: 'Legacy data backfill', description: '', status: 'Not Started', points: 3, itemType: { id: 'jira_task', label: 'Task' } } },
    ],
  };
}
