import { describe, expect, it } from 'vitest';
import { applyCreatedItem } from './applySync';
import { connectorCreateTypes } from './client';
import { FIXTURE_CONNECTORS, fixtureCreatedItem } from './fixtures';
import { SCHEMA_VERSION, type AppState, type Release, type Team } from '../types';
import type { ConnectorMeta } from './client';
import type { MappedItem } from './schema';

const acme = FIXTURE_CONNECTORS[0];

describe('connectorCreateTypes', () => {
  it('returns the advertised creatable item types', () => {
    expect(connectorCreateTypes(acme).map((t) => t.id)).toContain('acme_story');
  });
  it('is empty when meta is missing or declares no creatable capability', () => {
    expect(connectorCreateTypes(undefined)).toEqual([]);
    expect(connectorCreateTypes({ type: 'x', label: 'X', configFields: [] } as ConnectorMeta)).toEqual([]);
  });
});

describe('fixtureCreatedItem', () => {
  it('synthesizes a normalized MappedItem with key/externalId and passed refs', () => {
    const m = fixtureCreatedItem(
      { type: 'acme', config: { projectKey: 'abc' } },
      { type: 'acme_story', extWorkStreamId: 'EPIC-A', extSprintId: 'JSPR-1', extAssigneeId: 'U1', fields: { subject: 'New thing', points: 5 } },
    );
    expect(m.externalId).toMatch(/^EXT-/);
    expect(m.fields.key).toMatch(/^ABC-/);
    expect(m.fields.subject).toBe('New thing');
    expect(m.fields.points).toBe(5);
    expect(m.fields.status).toBe('Not Started');
    expect(m.fields.itemType).toMatchObject({ id: 'acme_story', label: 'Story' });
    expect(m).toMatchObject({ extWorkStreamId: 'EPIC-A', extSprintId: 'JSPR-1', extAssigneeId: 'U1' });
  });

  it('stamps descriptionFormat from the item type’s description field', () => {
    // acme_story declares its description as format: 'html'
    const story = fixtureCreatedItem(
      { type: 'acme', config: { projectKey: 'abc' } },
      { type: 'acme_story', extWorkStreamId: 'EPIC-A', extSprintId: null, extAssigneeId: null, fields: { subject: 'S', description: '<p>hi</p>' } },
    );
    expect(story.fields.descriptionFormat).toBe('html');
    // acme_bug's description has no format → defaults to text
    const bug = fixtureCreatedItem(
      { type: 'acme', config: { projectKey: 'abc' } },
      { type: 'acme_bug', extWorkStreamId: 'EPIC-A', extSprintId: null, extAssigneeId: null, fields: { subject: 'B', description: 'plain' } },
    );
    expect(bug.fields.descriptionFormat).toBe('text');
  });

  it('echoes catalog-declared vocabulary values back as attributes', () => {
    const m = fixtureCreatedItem(
      { type: 'acme', config: { projectKey: 'abc' } },
      { type: 'acme_bug', extWorkStreamId: 'EPIC-A', extSprintId: null, extAssigneeId: null, fields: { subject: 'Crash', severity: 'critical' } },
    );
    expect(m.attributes).toEqual({ severity: 'critical' });
    // Canonical fields never leak into the bag.
    expect(m.attributes).not.toHaveProperty('subject');
  });
});

// State with one connector release whose stream/sprint/member already carry external ids.
const team = (): Team => ({
  id: 'team1', name: 'Plat', velocity: 30, externalId: 'T1',
  members: [{ id: 'm1', name: 'Ada', externalId: 'U1', nonContributing: false }],
});
const release = (): Release => ({
  id: 'rel1', name: 'Orion', startISO: '2026-04-13', teamId: 'team1',
  workStreams: [{ id: 'ws1', name: 'Checkout', externalId: 'EPIC-A', engineersRequired: null, build: null, externalUrl: null, planningMuted: false }],
  events: [],
  sprints: [{ id: 'sp1', name: 'Sprint 1', startISO: '2026-04-13', endISO: '2026-04-26', daysOff: 0, externalId: 'JSPR-1', plannedVelocity: null }],
  codeFreezeISO: null,
  externalId: null, connector: { type: 'acme', config: {} }, sync: null, sprintLengthDays: 14,
});
const state = (): AppState => ({
  version: SCHEMA_VERSION, teams: [team()], releases: [release()], items: [], meta: { lastSyncISO: null },
});
const createdItem = (over: Partial<MappedItem> = {}): MappedItem => ({
  externalId: 'EXT-900', extWorkStreamId: 'EPIC-A', extSprintId: 'JSPR-1', extAssigneeId: 'U1',
  fields: { key: 'ABC-900', subject: 'Fresh', description: '', status: 'Not Started', points: 3, itemType: { id: 'acme_story', label: 'Story' } },
  ...over,
});

describe('applyCreatedItem', () => {
  it('reconciles a created item, resolving refs to local ids as a synced item', () => {
    const { next, item } = applyCreatedItem(state(), 'rel1', createdItem(), ['points', 'sprint']);
    expect(item).not.toBeNull();
    expect(item).toMatchObject({
      releaseId: 'rel1', externalId: 'EXT-900', key: 'ABC-900',
      workStreamId: 'ws1', sprintId: 'sp1', assignedMemberId: 'm1',
      points: 3, status: 'Not Started', dirtyFields: [],
      syncedValues: { points: 3, sprint: 'sp1' },
    });
    expect(next.items).toHaveLength(1);
  });

  it('stores the created item attributes for read-only display', () => {
    const { item } = applyCreatedItem(state(), 'rel1', createdItem({ attributes: { severity: 'high' } }), []);
    expect(item?.attributes).toEqual({ severity: 'high' });
  });

  it('places an item with an unmapped sprint into the backlog', () => {
    const { item } = applyCreatedItem(state(), 'rel1', createdItem({ extSprintId: 'JSPR-NOPE' }), []);
    expect(item?.sprintId).toBeNull();
  });

  it('skips (returns null + warning) when the work stream cannot be resolved', () => {
    const { next, item, warning } = applyCreatedItem(state(), 'rel1', createdItem({ extWorkStreamId: 'EPIC-X' }), []);
    expect(item).toBeNull();
    expect(warning).toMatch(/unresolved work stream/);
    expect(next.items).toHaveLength(0);
  });
});
