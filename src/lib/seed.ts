// Seed data — ported from proto-store.jsx seed(). Builds a primary demo
// release plus two lighter releases so the home list feels real.

import { SCHEMA_VERSION, SPRINT_LEN_DAYS, type AppState, type ItemType, type Release, type Sprint, type Status, type WorkItem, type WorkStream } from '../types';
import { addDays, buildSprints, todayISO, uid } from './dates';

// curated subjects per work stream so generated items read believably
const SUBJECTS: Record<string, string[]> = {
  'Checkout API': ['Tokenize card vault', 'Idempotent charge endpoint', '3-D Secure handshake', 'Refund + partial refund flow', 'Webhook retry queue', 'Multi-currency rounding', 'Dispute evidence upload', 'Settlement reconciliation job', 'PCI scope audit hooks', 'Rate-limit per merchant', 'Apple / Google Pay adapter', 'Saved payment methods UI', 'Decline reason taxonomy'],
  'Search Revamp': ['Typeahead suggestions', 'Relevance ranking model', 'Faceted filter sidebar', 'Synonym dictionary', 'Search analytics events', 'Index backfill job', 'Zero-result fallbacks'],
  'Mobile Onboarding': ['Welcome carousel', 'Phone verification', 'Permission priming screens', 'Profile setup flow', 'Push opt-in prompt', 'Resume-where-left-off'],
  'Billing Migration': ['Dual-write ledger', 'Invoice template port', 'Proration engine', 'Legacy data backfill', 'Cutover runbook', 'Reconciliation report'],
  Notifications: ['Email digest scheduler', 'In-app inbox', 'Preference center', 'Delivery status tracking', 'Template localization'],
  'Admin Console': ['Role + permission editor', 'Audit log viewer', 'Bulk user import', 'Feature-flag toggles', 'Usage dashboards', 'Org settings page'],
};

const CONNECTOR_SUBJECTS: Record<string, string[]> = {
  'Data Ingestion': ['Schema registry setup', 'Kafka topic configuration', 'Dead letter queue handler', 'Backfill pipeline', 'Data validation rules', 'Throughput benchmarks', 'Connector health checks', 'Event deduplication logic', 'Streaming metrics dashboard', 'Lag monitoring alerts'],
  'API Gateway': ['Route configuration', 'Auth middleware', 'Rate limiting policies', 'Request transformation', 'Response caching layer', 'OpenAPI spec generation', 'Circuit breaker logic', 'Retry & timeout tuning', 'API versioning strategy', 'Traffic routing rules'],
  'Auth & SSO': ['OIDC provider integration', 'JWT validation service', 'Token refresh flow', 'SAML assertion handler', 'Group membership sync', 'MFA enforcement rules', 'Session expiry handling', 'Permission scopes audit', 'SSO error recovery'],
  'Reporting & Analytics': ['Dashboard framework setup', 'KPI metric definitions', 'Data export pipeline', 'Report scheduling system', 'Drill-down filter logic', 'Chart component library', 'Cohort analysis queries', 'Retention funnel model', 'Usage trend aggregation'],
  'Webhooks': ['Webhook registry service', 'Event fan-out dispatcher', 'Signature verification', 'Delivery retry policy', 'Subscriber management UI', 'Payload schema versioning', 'Test event simulator', 'Delivery log viewer'],
  'SDK & Developer Tools': ['Client SDK scaffolding', 'Code sample library', 'Interactive API explorer', 'Sandbox environment', 'SDK versioning toolchain', 'Error code documentation', 'Integration test harness', 'Developer portal pages', 'Changelog automation'],
};

// item-count matrix per sprint per stream: [Complete, UnderReview, InProgress, Blocked, NotStarted]
const M = (c: number, r: number, a: number, b: number, n: number): [Status, number][] => [
  ['Complete', c], ['Under Review', r], ['In Progress', a], ['Blocked', b], ['Not Started', n],
];
const RELEASE_MATRIX: Record<number, Record<string, [Status, number][]>> = {
  1: { 'Checkout API': M(4, 1, 0, 0, 0), 'Search Revamp': M(2, 1, 0, 0, 0), 'Mobile Onboarding': M(1, 0, 1, 0, 0) },
  2: { 'Checkout API': M(2, 1, 1, 0, 0), 'Search Revamp': M(1, 0, 1, 1, 0), 'Billing Migration': M(0, 1, 1, 0, 1) },
  3: { 'Checkout API': M(1, 1, 1, 1, 0), 'Billing Migration': M(0, 0, 1, 1, 2), Notifications: M(0, 0, 1, 0, 1) },
  4: { 'Search Revamp': M(0, 1, 1, 0, 2), 'Mobile Onboarding': M(0, 0, 1, 1, 2), Notifications: M(0, 1, 0, 0, 2) },
  5: { 'Checkout API': M(0, 0, 1, 0, 3), 'Admin Console': M(0, 0, 1, 0, 2), 'Billing Migration': M(0, 0, 0, 1, 2) },
  6: { 'Admin Console': M(0, 0, 0, 0, 4), Notifications: M(0, 0, 0, 0, 2) },
  7: { 'Mobile Onboarding': M(0, 0, 0, 0, 3), 'Search Revamp': M(0, 0, 0, 0, 2), 'Admin Console': M(0, 0, 0, 0, 1) },
  8: { 'Checkout API': M(0, 0, 0, 0, 2), Notifications: M(0, 0, 0, 0, 3) },
};
// Connector release (Nexus 1.0): 6 streams × 8 sprints, ~100 items. Sprints have
// variable names and lengths to show connector-style scheduling.
const CONNECTOR_MATRIX: Record<number, Record<string, [Status, number][]>> = {
  1: { 'Data Ingestion': M(3,0,0,0,0), 'API Gateway': M(2,0,0,0,0), 'Auth & SSO': M(2,0,0,0,0), 'Reporting & Analytics': M(1,0,0,0,0), 'Webhooks': M(1,0,0,0,0), 'SDK & Developer Tools': M(2,0,0,0,0) },
  2: { 'Data Ingestion': M(3,0,0,0,0), 'API Gateway': M(3,0,0,0,0), 'Auth & SSO': M(2,0,0,0,0), 'Reporting & Analytics': M(2,0,0,0,0), 'Webhooks': M(2,0,0,0,0), 'SDK & Developer Tools': M(2,0,0,0,0) },
  3: { 'Data Ingestion': M(2,0,0,0,0), 'API Gateway': M(2,0,0,0,0), 'Auth & SSO': M(3,0,0,0,0), 'Reporting & Analytics': M(2,0,0,0,0), 'Webhooks': M(2,0,0,0,0), 'SDK & Developer Tools': M(1,0,0,0,0) },
  4: { 'Data Ingestion': M(2,0,0,0,0), 'API Gateway': M(2,0,0,0,0), 'Auth & SSO': M(2,0,0,0,0), 'Reporting & Analytics': M(2,0,0,0,0), 'Webhooks': M(1,0,0,0,0), 'SDK & Developer Tools': M(2,0,0,0,0) },
  5: { 'Data Ingestion': M(1,0,0,0,0), 'API Gateway': M(2,0,0,0,0), 'Auth & SSO': M(1,0,0,0,0), 'Reporting & Analytics': M(2,0,0,0,0), 'Webhooks': M(2,0,0,0,0), 'SDK & Developer Tools': M(2,0,0,0,0) },
  6: { 'Data Ingestion': M(0,1,1,1,1), 'API Gateway': M(0,1,1,0,2), 'Auth & SSO': M(0,0,1,1,1), 'Reporting & Analytics': M(0,1,1,0,1), 'Webhooks': M(0,0,1,0,2), 'SDK & Developer Tools': M(0,1,0,1,1) },
  7: { 'Data Ingestion': M(0,0,0,0,2), 'API Gateway': M(0,0,0,0,3), 'Auth & SSO': M(0,0,0,0,2), 'Reporting & Analytics': M(0,0,0,0,2), 'Webhooks': M(0,0,0,0,2), 'SDK & Developer Tools': M(0,0,0,0,2) },
  8: { 'Data Ingestion': M(0,0,0,0,1), 'API Gateway': M(0,0,0,0,2), 'Auth & SSO': M(0,0,0,0,2), 'Reporting & Analytics': M(0,0,0,0,1), 'Webhooks': M(0,0,0,0,1), 'SDK & Developer Tools': M(0,0,0,0,2) },
};

// Nexus sprint shape: variable lengths (10, 14, 14, 14, 14, 21, 14, 14 days) to show
// the connector-style scheduling model. Dates are computed relative to today (see seed()).
const NEXUS_SPRINT_DEFS: { name: string; len: number; daysOff: number; externalId: string }[] = [
  { name: 'Kickoff', len: 10, daysOff: 0, externalId: 'JSPR-2241' },
  { name: 'Foundation', len: 14, daysOff: 0, externalId: 'JSPR-2242' },
  { name: 'Core Build', len: 14, daysOff: 2, externalId: 'JSPR-2243' },
  { name: 'Integration Prep', len: 14, daysOff: 0, externalId: 'JSPR-2244' },
  { name: 'Integration & Testing', len: 14, daysOff: 0, externalId: 'JSPR-2245' },
  { name: 'Load Testing & Hardening', len: 21, daysOff: 0, externalId: 'JSPR-2246' },
  { name: 'Pre-release Stabilization', len: 14, daysOff: 2, externalId: 'JSPR-2247' },
  { name: 'GA Readiness', len: 14, daysOff: 0, externalId: 'JSPR-2248' },
];

const PT_POOL = [2, 3, 5, 1, 8, 3, 2, 5];
const NEXUS_TYPE_POOL: ItemType[] = [
  { id: 'acme_story', label: 'Story' },
  { id: 'acme_story', label: 'Story' },
  { id: 'acme_story', label: 'Story' },
  { id: 'acme_task', label: 'Task' },
  { id: 'acme_bug', label: 'Bug' },
];

export function seed(): AppState {
  const mkMember = (n: string, nonContributing = false) => ({ id: uid('m'), name: n, externalId: null, nonContributing });
  const teams = [
    {
      id: 'team_core', name: 'Platform Core', velocity: 40, externalId: null,
      members: ['Ada L.', 'Marco P.', 'Wei C.', 'Devi R.', 'Tom B.'].map((n) => mkMember(n)),
    },
    {
      id: 'team_integrations', name: 'Platform Integrations', velocity: 32, externalId: 'ACME-TEAM-NXS',
      members: [
        mkMember('Cass L.'),
        mkMember('Jin S.'),
        mkMember('Obi T.'),
        mkMember('Meg R.'),
        // EM and PM pulled in from Acme — excluded from capacity calculations
        mkMember('Yara F.', true),  // Engineering Manager
        mkMember('Dev A.', true),   // Product Manager
      ],
    },
  ];

  const streamNames = ['Checkout API', 'Search Revamp', 'Mobile Onboarding', 'Billing Migration', 'Notifications', 'Admin Console'];
  // engineersRequired drives the capacity-fit forecast; values chosen to give a mix
  // of on-track / at-risk and to over-subscribe the team (Σ > contributing members).
  const demoEngineers: Record<string, number> = {
    'Checkout API': 3, 'Search Revamp': 2, 'Mobile Onboarding': 2,
    'Billing Migration': 2, 'Notifications': 1, 'Admin Console': 2,
  };
  const demoStreams = streamNames.map((n) => ({ id: uid('ws'), name: n, externalId: null, engineersRequired: demoEngineers[n] ?? null, planningMuted: false, build: null, externalUrl: null }));
  // Anchor the release to today so the demo always shows a mix of past, active, and
  // future sprints. Sprint 4 (the one with mixed in-progress/not-started work in
  // RELEASE_MATRIX) is the "active" sprint — land today on its 8th day (of 14).
  const today = todayISO();
  const demoStart = addDays(today, -(3 * 14 + 7));
  const demo: Release = {
    id: 'rel_demo', name: 'Orion 2.0', startISO: demoStart, teamId: 'team_core',
    workStreams: demoStreams,
    events: [
      { id: uid('ev'), label: 'Kickoff', dateISO: addDays(demoStart, 0), externalId: null },
      { id: uid('ev'), label: 'Design review', dateISO: addDays(demoStart, 32), externalId: null },
      { id: uid('ev'), label: 'Code freeze', dateISO: addDays(demoStart, 53), externalId: null },
      { id: uid('ev'), label: 'Demo', dateISO: addDays(demoStart, 67), externalId: null },
      { id: uid('ev'), label: 'Beta cut', dateISO: addDays(demoStart, 81), externalId: null },
      { id: uid('ev'), label: 'GA', dateISO: addDays(demoStart, 110), externalId: null },
    ],
    sprints: buildSprints(demoStart, { 3: 5, 5: 10, 7: 5 }),
    externalId: null,
    connector: null,
    sync: null,
    sprintLengthDays: SPRINT_LEN_DAYS,
  };

  // generate work items for the demo release from the matrix
  const items: WorkItem[] = [];
  const wsId = (name: string) => demoStreams.find((w) => w.name === name)!.id;
  const coreMembers = teams[0].members; // assign round-robin from the core team
  const subjIdx: Record<string, number> = {};
  let keyN = 100;
  let ptI = 0;
  let memberIdx = 0;
  Object.entries(RELEASE_MATRIX).forEach(([sprintN, byStream]) => {
    const sprintId = demo.sprints[Number(sprintN) - 1].id; // matrix key is 1-based position
    Object.entries(byStream).forEach(([streamName, counts]) => {
      counts.forEach(([status, k]) => {
        for (let i = 0; i < k; i++) {
          const pool = SUBJECTS[streamName];
          subjIdx[streamName] = subjIdx[streamName] || 0;
          const subject = pool[subjIdx[streamName] % pool.length];
          subjIdx[streamName]++;
          items.push({
            id: uid('it'), releaseId: 'rel_demo', workStreamId: wsId(streamName), sprintId,
            key: `ORN-${keyN++}`, subject, description: '', status, points: PT_POOL[ptI++ % PT_POOL.length], externalId: null,
            assignedMemberId: coreMembers[memberIdx++ % coreMembers.length].id,
            build: null, externalUrl: null, dirtyFields: [], itemType: null,
          });
        }
      });
    });
  });

  // Patch items from Orion 1.5 carried into active + upcoming sprints
  const orionPatches: { stream: string; sprintIdx: number; subject: string; status: Status; pts: number }[] = [
    { stream: 'Checkout API',     sprintIdx: 3, subject: 'Fix decimal rounding on EUR refunds',      status: 'In Progress',  pts: 3 },
    { stream: 'Checkout API',     sprintIdx: 3, subject: 'Patch idempotency key collision on retry', status: 'Not Started',  pts: 2 },
    { stream: 'Billing Migration',sprintIdx: 3, subject: 'Backport proration fix for annual plans',  status: 'Under Review', pts: 5 },
    { stream: 'Notifications',    sprintIdx: 4, subject: 'Fix email digest double-send on timezone boundary', status: 'Not Started', pts: 2 },
    { stream: 'Checkout API',     sprintIdx: 4, subject: 'Hotfix: Apple Pay session expiry handling', status: 'Not Started', pts: 3 },
  ];
  orionPatches.forEach(({ stream, sprintIdx, subject, status, pts }) => {
    items.push({
      id: uid('it'), releaseId: 'rel_demo', workStreamId: wsId(stream),
      sprintId: demo.sprints[sprintIdx].id,
      key: `ORN-${keyN++}`, subject, description: '', status,
      points: pts, externalId: null,
      assignedMemberId: coreMembers[memberIdx++ % coreMembers.length].id,
      build: 'Orion 1.5', externalUrl: null, dirtyFields: [], itemType: null,
    });
  });

  // Unassigned items — no work stream, to exercise workStreamId: null
  items.push(
    {
      id: uid('it'), releaseId: 'rel_demo', workStreamId: null,
      sprintId: demo.sprints[2].id,
      key: `ORN-${keyN++}`, subject: 'Define third-party cookie deprecation plan',
      description: 'Cross-cutting concern; stream TBD once owner is identified.',
      status: 'Not Started', points: 3, externalId: null,
      assignedMemberId: null, build: null, externalUrl: null, dirtyFields: [], itemType: null,
    },
    {
      id: uid('it'), releaseId: 'rel_demo', workStreamId: null,
      sprintId: demo.sprints[3].id,
      key: `ORN-${keyN++}`, subject: 'Security audit findings — triage and assign',
      description: 'Raw findings from pentest; stream assignment pending review.',
      status: 'In Progress', points: 5, externalId: null,
      assignedMemberId: coreMembers[0].id, build: null, externalUrl: null, dirtyFields: [], itemType: null,
    },
    {
      id: uid('it'), releaseId: 'rel_demo', workStreamId: null,
      sprintId: null,
      key: `ORN-${keyN++}`, subject: 'Migrate internal tooling to new auth provider',
      description: 'Backlog item; not yet assigned to a stream or sprint.',
      status: 'Not Started', points: 2, externalId: null,
      assignedMemberId: null, build: null, externalUrl: null, dirtyFields: [], itemType: null,
    },
  );

  // HTML-description item — exercises the .prose renderer in WorkItemDetailModal
  items.push({
    id: uid('it'), releaseId: 'rel_demo', workStreamId: wsId('Checkout API'),
    sprintId: demo.sprints[3].id,
    key: `ORN-${keyN++}`, subject: 'SSO login via identity provider',
    description: `<h3>Overview</h3>
<p>Implement SSO login via an external identity provider (IdP) using OIDC. Users authenticate through the IdP and receive a session cookie valid for <code>8h</code> of inactivity.</p>
<h3>Acceptance criteria</h3>
<ul>
  <li>Users can <strong>log in</strong> via SSO from the login page</li>
  <li>Session expires after <code>8h</code> of inactivity and <code>24h</code> absolute</li>
  <li>Failed attempts are logged with <em>reason code</em> and timestamp</li>
  <li>Logout clears the session cookie and redirects to the IdP logout endpoint</li>
  <li>Deep-link redirect preserved through the auth flow (<code>?next=</code> param)</li>
  <li>Works in Safari — no third-party cookie dependency</li>
</ul>
<h3>Technical notes</h3>
<p>Coordinate with Auth &amp; SSO stream — they own the OIDC provider config and the <code>/.well-known/openid-configuration</code> endpoint. Our side is limited to:</p>
<ol>
  <li>Initiating the auth redirect with <code>state</code> + <code>nonce</code></li>
  <li>Handling the callback, validating the <code>id_token</code> (signature, <code>aud</code>, expiry)</li>
  <li>Minting the session cookie via <code>SessionService.create()</code></li>
</ol>
<blockquote>See <a href="#">Confluence spec</a> for the full provider matrix and edge cases (e.g. IdP-initiated login, just-in-time provisioning).</blockquote>
<h3>Out of scope</h3>
<ul>
  <li>MFA enforcement — handled by the IdP, not this ticket</li>
  <li>Group/role sync — separate ticket, depends on this one</li>
  <li>Admin impersonation flow</li>
</ul>
<h3>Test plan</h3>
<table>
  <thead><tr><th>Scenario</th><th>Expected</th></tr></thead>
  <tbody>
    <tr><td>Happy path SSO login</td><td>Session cookie set, redirect to <code>?next</code> or home</td></tr>
    <tr><td>Invalid <code>id_token</code> signature</td><td>401 + reason logged</td></tr>
    <tr><td>Expired token in callback</td><td>Error page, no session created</td></tr>
    <tr><td>Session idle &gt; 8h</td><td>Redirected to login on next request</td></tr>
    <tr><td>Logout</td><td>Cookie cleared, IdP logout called</td></tr>
  </tbody>
</table>`,
    descriptionFormat: 'html',
    status: 'Not Started', points: 5, externalId: 'EXT-SSO-001',
    assignedMemberId: coreMembers[1].id, build: null, externalUrl: null, dirtyFields: [], itemType: null,
  });

  // Connector release: Nexus 1.0 — Acme-linked, 6 streams, custom sprint names.
  // Sprint lengths deliberately vary: 10, 14, 14, 14, 14, 21, 14, 14 days to show the
  // connector-style scheduling model. Anchored to today (like Orion above) so sprint 6
  // "Load Testing & Hardening" — the sprint with mixed in-progress work in
  // CONNECTOR_MATRIX — is the active sprint, landing today on its 11th day (of 21).
  const nexusStart = addDays(today, -(10 + 14 + 14 + 14 + 14 + 10));
  const nexusStreamNames = ['Data Ingestion', 'API Gateway', 'Auth & SSO', 'Reporting & Analytics', 'Webhooks', 'SDK & Developer Tools'];
  const nexusEngineers = [2, 3, 2, 2, 1, 1]; // app-owned enrichment; survives connector sync
  // Acme-style deep link to an issue/epic, as a real connector would construct it.
  const nexusSite = 'acme.atlassian.net';
  const acmeUrl = (extId: string) => `https://${nexusSite}/browse/${extId}`;
  const nexusStreams: WorkStream[] = nexusStreamNames.map((n, i) => ({
    id: uid('ws'), name: n, externalId: `EPIC-NXS-${i + 1}`, engineersRequired: nexusEngineers[i] ?? null, planningMuted: false, build: null,
    externalUrl: acmeUrl(`EPIC-NXS-${i + 1}`),
  }));
  // A carried-in stream: an epic from the prior build whose items overlap this
  // release's sprint window. build !== null marks it off-build; the "on-build only"
  // lens hides it. Exercises the build-filter feature in the demo data.
  const nexusCarriedStream: WorkStream = {
    id: uid('ws'), name: 'Beta 2 Carryover', externalId: 'EPIC-NXS-B2', engineersRequired: null, planningMuted: false, build: 'Nexus Beta 2',
    externalUrl: acmeUrl('EPIC-NXS-B2'),
  };
  nexusStreams.push(nexusCarriedStream);
  let nexusCursor = nexusStart;
  const nexusSprints: Sprint[] = NEXUS_SPRINT_DEFS.map((def) => {
    const startISO = nexusCursor;
    const endISO = addDays(startISO, def.len - 1);
    nexusCursor = addDays(endISO, 1);
    // plannedVelocity left null; load() stamps started sprints on first run.
    return { id: uid('sp'), name: def.name, startISO, endISO, daysOff: def.daysOff, externalId: def.externalId, plannedVelocity: null };
  });
  const nexus: Release = {
    id: 'rel_nexus', name: 'Nexus 1.0', startISO: nexusStart, teamId: 'team_integrations',
    workStreams: nexusStreams,
    events: [
      { id: uid('ev'), label: 'Kick',               dateISO: addDays(nexusStart, 0),   externalId: 'NXS-EV-1' },
      { id: uid('ev'), label: 'Alpha',              dateISO: addDays(nexusStart, 37),  externalId: 'NXS-EV-2' },
      { id: uid('ev'), label: 'Integration lock',   dateISO: addDays(nexusStart, 65),  externalId: 'NXS-EV-3' },
      { id: uid('ev'), label: 'Load test complete', dateISO: addDays(nexusStart, 86),  externalId: 'NXS-EV-4' },
      { id: uid('ev'), label: 'Code freeze',        dateISO: addDays(nexusStart, 96),  externalId: 'NXS-EV-5' },
      { id: uid('ev'), label: 'RC cut',             dateISO: addDays(nexusStart, 104), externalId: 'NXS-EV-6' },
      { id: uid('ev'), label: 'GA',                 dateISO: addDays(nexusStart, 114), externalId: 'NXS-EV-7' },
    ],
    sprints: nexusSprints,
    externalId: 'NEXUS',
    connector: { type: 'acme', config: { projectKey: 'NXS', boardId: '88', fixVersion: '1.0', siteUrl: 'acme.atlassian.net' } },
    sync: { lastISO: `${addDays(today, -1)}T09:30:00.000Z`, state: 'ok', message: null },
    // Connector sprints vary in length (see nexusSprints); this is nominal only.
    sprintLengthDays: SPRINT_LEN_DAYS,
  };
  const nxsWsId = (name: string) => nexusStreams.find((w) => w.name === name)!.id;
  const nxsMembers = teams[1].members;
  const nxsSubjIdx: Record<string, number> = {};
  let nxsKeyN = 101;
  let nxsPtI = 0;
  let nxsMemberIdx = 0;
  let nxsTypeI = 0;
  Object.entries(CONNECTOR_MATRIX).forEach(([sprintPos, byStream]) => {
    const sprintId = nexusSprints[Number(sprintPos) - 1].id;
    Object.entries(byStream).forEach(([streamName, counts]) => {
      counts.forEach(([status, k]) => {
        for (let i = 0; i < k; i++) {
          const pool = CONNECTOR_SUBJECTS[streamName];
          nxsSubjIdx[streamName] = nxsSubjIdx[streamName] ?? 0;
          const subject = pool[nxsSubjIdx[streamName]++ % pool.length];
          items.push({
            id: uid('it'), releaseId: 'rel_nexus', workStreamId: nxsWsId(streamName), sprintId,
            key: `NXS-${nxsKeyN}`, subject, description: '', status,
            points: PT_POOL[nxsPtI++ % PT_POOL.length],
            externalId: `NXS-${nxsKeyN}`,
            externalUrl: acmeUrl(`NXS-${nxsKeyN++}`),
            assignedMemberId: nxsMembers[nxsMemberIdx++ % nxsMembers.length].id,
            build: null, dirtyFields: [],
            itemType: NEXUS_TYPE_POOL[nxsTypeI++ % NEXUS_TYPE_POOL.length],
          });
        }
      });
    });
  });

  // Patch items from Nexus Beta 2 carried into the active sprint (sprint 6)
  const nexusPatches: { stream: string; subject: string; status: Status; pts: number }[] = [
    { stream: 'Auth & SSO',          subject: 'Backport JWT clock-skew tolerance fix',        status: 'Under Review', pts: 2 },
    { stream: 'API Gateway',         subject: 'Patch circuit-breaker false-positive on 429',  status: 'In Progress',  pts: 3 },
    { stream: 'Data Ingestion',      subject: 'Fix dedup window off-by-one under high lag',    status: 'Not Started', pts: 5 },
    { stream: 'Webhooks',            subject: 'Retry storm fix from Beta 2 load test',         status: 'Not Started', pts: 3 },
  ];
  const nexusActiveSprint = nexusSprints[5]; // sprint 6 — Load Testing & Hardening
  nexusPatches.forEach(({ stream, subject, status, pts }) => {
    items.push({
      id: uid('it'), releaseId: 'rel_nexus', workStreamId: nxsWsId(stream),
      sprintId: nexusActiveSprint.id,
      key: `NXS-${nxsKeyN}`, subject, description: '', status,
      points: pts, externalId: `NXS-${nxsKeyN}`, externalUrl: acmeUrl(`NXS-${nxsKeyN++}`),
      assignedMemberId: nxsMembers[nxsMemberIdx++ % nxsMembers.length].id,
      build: 'Nexus Beta 2', dirtyFields: [],
      itemType: { id: 'acme_bug', label: 'Bug' },
    });
  });

  // Items in the carried-in "Beta 2 Carryover" stream — overlap this release's
  // window but belong to the prior build. The on-build lens hides the whole stream.
  const carriedItems: { subject: string; sprintIdx: number; status: Status; pts: number }[] = [
    { subject: 'Migrate legacy session store off Redis 5', sprintIdx: 5, status: 'In Progress', pts: 5 },
    { subject: 'Decommission Beta 2 feature flags',         sprintIdx: 6, status: 'Not Started', pts: 3 },
  ];
  carriedItems.forEach(({ subject, sprintIdx, status, pts }) => {
    items.push({
      id: uid('it'), releaseId: 'rel_nexus', workStreamId: nexusCarriedStream.id,
      sprintId: nexusSprints[sprintIdx].id,
      key: `NXS-${nxsKeyN}`, subject, description: '', status,
      points: pts, externalId: `NXS-${nxsKeyN}`, externalUrl: acmeUrl(`NXS-${nxsKeyN++}`),
      assignedMemberId: nxsMembers[nxsMemberIdx++ % nxsMembers.length].id,
      build: 'Nexus Beta 2', dirtyFields: [],
      itemType: { id: 'acme_task', label: 'Task' },
    });
  });

  // Attach the synced baseline to connector-sourced items so pending-push previews
  // and reverts have a value to diverge from. Local items have no baseline.
  const itemsWithBaseline = items.map((it) => ({
    ...it,
    syncedValues: it.externalId != null ? { points: it.points, sprintId: it.sprintId } : null,
  }));

  return { version: SCHEMA_VERSION, teams, releases: [demo, nexus], items: itemsWithBaseline, meta: { lastSyncISO: null } };
}
