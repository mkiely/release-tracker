// Seed data — ported from proto-store.jsx seed(). Builds a primary demo
// release plus two lighter releases so the home list feels real.

import { SCHEMA_VERSION, type AppState, type Release, type Status, type WorkItem } from '../types';
import { buildSprints, uid } from './dates';

// curated subjects per work stream so generated items read believably
const SUBJECTS: Record<string, string[]> = {
  'Checkout API': ['Tokenize card vault', 'Idempotent charge endpoint', '3-D Secure handshake', 'Refund + partial refund flow', 'Webhook retry queue', 'Multi-currency rounding', 'Dispute evidence upload', 'Settlement reconciliation job', 'PCI scope audit hooks', 'Rate-limit per merchant', 'Apple / Google Pay adapter', 'Saved payment methods UI', 'Decline reason taxonomy'],
  'Search Revamp': ['Typeahead suggestions', 'Relevance ranking model', 'Faceted filter sidebar', 'Synonym dictionary', 'Search analytics events', 'Index backfill job', 'Zero-result fallbacks'],
  'Mobile Onboarding': ['Welcome carousel', 'Phone verification', 'Permission priming screens', 'Profile setup flow', 'Push opt-in prompt', 'Resume-where-left-off'],
  'Billing Migration': ['Dual-write ledger', 'Invoice template port', 'Proration engine', 'Legacy data backfill', 'Cutover runbook', 'Reconciliation report'],
  Notifications: ['Email digest scheduler', 'In-app inbox', 'Preference center', 'Delivery status tracking', 'Template localization'],
  'Admin Console': ['Role + permission editor', 'Audit log viewer', 'Bulk user import', 'Feature-flag toggles', 'Usage dashboards', 'Org settings page'],
};

// item-count matrix per sprint per stream: [Complete, Active, Blocked, NotStarted]
const M = (c: number, a: number, b: number, n: number): [Status, number][] => [
  ['Complete', c], ['Active', a], ['Blocked', b], ['Not Started', n],
];
const RELEASE_MATRIX: Record<number, Record<string, [Status, number][]>> = {
  1: { 'Checkout API': M(4, 1, 0, 0), 'Search Revamp': M(2, 1, 0, 0), 'Mobile Onboarding': M(1, 1, 0, 0) },
  2: { 'Checkout API': M(2, 2, 0, 0), 'Search Revamp': M(1, 2, 1, 0), 'Billing Migration': M(0, 2, 0, 1) },
  3: { 'Checkout API': M(1, 2, 1, 1), 'Billing Migration': M(0, 1, 1, 2), Notifications: M(0, 1, 0, 1) },
  4: { 'Search Revamp': M(0, 2, 0, 2), 'Mobile Onboarding': M(0, 1, 1, 2), Notifications: M(0, 1, 0, 2) },
  5: { 'Checkout API': M(0, 1, 0, 3), 'Admin Console': M(0, 1, 0, 2), 'Billing Migration': M(0, 0, 1, 2) },
  6: { 'Admin Console': M(0, 0, 0, 4), Notifications: M(0, 0, 0, 2) },
  7: { 'Mobile Onboarding': M(0, 0, 0, 3), 'Search Revamp': M(0, 0, 0, 2), 'Admin Console': M(0, 0, 0, 1) },
  8: { 'Checkout API': M(0, 0, 0, 2), Notifications: M(0, 0, 0, 3) },
};
const PT_POOL = [2, 3, 5, 1, 8, 3, 2, 5];

export function seed(): AppState {
  const teams = [
    { id: 'team_core', name: 'Platform Core', velocity: 40, externalId: null, members: ['Ada L.', 'Marco P.', 'Wei C.', 'Devi R.', 'Tom B.'].map((n) => ({ id: uid('m'), name: n, externalId: null })) },
    { id: 'team_growth', name: 'Growth', velocity: 24, externalId: null, members: ['Jen K.', 'Sam O.', 'Priya N.'].map((n) => ({ id: uid('m'), name: n, externalId: null })) },
    { id: 'team_pay', name: 'Payments', velocity: 32, externalId: null, members: ['Lou H.', 'Bea S.', 'Ravi M.', 'Nina D.'].map((n) => ({ id: uid('m'), name: n, externalId: null })) },
  ];

  const streamNames = ['Checkout API', 'Search Revamp', 'Mobile Onboarding', 'Billing Migration', 'Notifications', 'Admin Console'];
  const demoStreams = streamNames.map((n) => ({ id: uid('ws'), name: n, externalId: null }));
  const demoStart = '2026-04-13';
  const demo: Release = {
    id: 'rel_demo', name: 'Orion 2.0', startISO: demoStart, teamId: 'team_core',
    workStreams: demoStreams,
    events: [
      { id: uid('ev'), label: 'Kickoff', dateISO: '2026-04-13', externalId: null },
      { id: uid('ev'), label: 'Design review', dateISO: '2026-05-15', externalId: null },
      { id: uid('ev'), label: 'Code freeze', dateISO: '2026-06-05', externalId: null },
      { id: uid('ev'), label: 'Demo', dateISO: '2026-06-19', externalId: null },
      { id: uid('ev'), label: 'Beta cut', dateISO: '2026-07-03', externalId: null },
      { id: uid('ev'), label: 'GA', dateISO: '2026-08-01', externalId: null },
    ],
    sprints: buildSprints(demoStart, { 3: 5, 5: 10, 7: 5 }),
    externalId: null,
    connector: null,
    sync: null,
  };

  // generate work items for the demo release from the matrix
  const items: WorkItem[] = [];
  const wsId = (name: string) => demoStreams.find((w) => w.name === name)!.id;
  const subjIdx: Record<string, number> = {};
  let keyN = 100;
  let ptI = 0;
  Object.entries(RELEASE_MATRIX).forEach(([sprintN, byStream]) => {
    Object.entries(byStream).forEach(([streamName, counts]) => {
      counts.forEach(([status, k]) => {
        for (let i = 0; i < k; i++) {
          const pool = SUBJECTS[streamName];
          subjIdx[streamName] = subjIdx[streamName] || 0;
          const subject = pool[subjIdx[streamName] % pool.length];
          subjIdx[streamName]++;
          items.push({
            id: uid('it'), releaseId: 'rel_demo', workStreamId: wsId(streamName), sprintN: Number(sprintN),
            key: `ORN-${keyN++}`, subject, description: '', status, points: PT_POOL[ptI++ % PT_POOL.length], externalId: null,
          });
        }
      });
    });
  });

  // two lighter releases so the home list feels real
  const co: Release = {
    id: 'rel_co', name: 'Q3 Checkout', startISO: '2026-05-19', teamId: 'team_pay',
    workStreams: [{ id: uid('ws'), name: 'Payment Sheet', externalId: null }, { id: uid('ws'), name: 'Fraud Rules', externalId: null }],
    events: [{ id: uid('ev'), label: 'Code freeze', dateISO: '2026-06-30', externalId: null }],
    sprints: buildSprints('2026-05-19', { 4: 4 }),
    externalId: null,
    connector: null,
    sync: null,
  };
  const ob: Release = {
    id: 'rel_ob', name: 'Onboarding Refresh', startISO: '2026-04-28', teamId: 'team_growth',
    workStreams: [{ id: uid('ws'), name: 'Activation Flow', externalId: null }],
    events: [{ id: uid('ev'), label: 'GA', dateISO: '2026-06-15', externalId: null }],
    sprints: buildSprints('2026-04-28', {}),
    externalId: null,
    connector: null,
    sync: null,
  };
  // a few items for the lighter releases
  ([
    ['rel_co', co.workStreams[0].id, 1, 'Active'],
    ['rel_co', co.workStreams[0].id, 1, 'Complete'],
    ['rel_co', co.workStreams[1].id, 2, 'Active'],
    ['rel_co', co.workStreams[1].id, 2, 'Not Started'],
    ['rel_ob', ob.workStreams[0].id, 1, 'Complete'],
    ['rel_ob', ob.workStreams[0].id, 2, 'Active'],
  ] as [string, string, number, Status][]).forEach(([rid, wid, sn, stt], i) =>
    items.push({
      id: uid('it'), releaseId: rid, workStreamId: wid, sprintN: sn,
      key: `${rid === 'rel_co' ? 'CO' : 'OB'}-${10 + i}`, subject: 'Work item ' + (i + 1),
      description: '', status: stt, points: PT_POOL[i % PT_POOL.length], externalId: null,
    }),
  );

  return { version: SCHEMA_VERSION, teams, releases: [demo, co, ob], items, meta: { lastSyncISO: null } };
}
