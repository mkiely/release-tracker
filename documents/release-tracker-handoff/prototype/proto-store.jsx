// proto-store.jsx — localStorage-backed data store for the clickable prototype
// Schema (all entities live here; "Sync" pushes this to a configured backend adapter):
//   teams:    [{ id, name, velocity, members: [{ id, name }] }]
//   releases: [{ id, name, startISO, teamId,
//                workStreams: [{ id, name }],
//                events:      [{ id, label, dateISO }],
//                sprints:     [{ n, name, startISO, endISO, daysOff }] }]
//   items:    [{ id, releaseId, workStreamId, sprintN, key, subject, description, status, points }]
//   meta:     { lastSyncISO }
const SCHEMA_VERSION = 1;
const LS_KEY = 'release-tracker:v1';
const STATUSES = ['Not Started', 'Active', 'Blocked', 'Complete'];
const WORKDAYS = 10;            // working days per 2-week sprint
const SPRINT_LEN_DAYS = 14;
const SPRINT_COUNT = 8;

// ---- date utils -----------------------------------------------------------
const PMON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dOf = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (iso, n) => { const d = dOf(iso); d.setDate(d.getDate() + n); return isoOf(d); };
const fmtShort = (iso) => { const d = dOf(iso); return `${PMON[d.getMonth()]} ${d.getDate()}`; };
const fmtLong = (iso) => { const d = dOf(iso); return `${PMON[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`; };
const todayISO = () => isoOf(new Date());
const between = (iso, a, b) => { const t = dOf(iso).getTime(); return t >= dOf(a).getTime() && t <= dOf(b).getTime(); };

let _seq = 1;
const uid = (p) => `${p}_${Date.now().toString(36)}_${(_seq++).toString(36)}`;

// build 8 contiguous sprints from a release start date
const buildSprints = (startISO, overrides = {}) => {
  const arr = [];
  for (let i = 0; i < SPRINT_COUNT; i++) {
    const n = i + 1;
    const s = addDays(startISO, i * SPRINT_LEN_DAYS);
    const e = addDays(s, SPRINT_LEN_DAYS - 1);
    arr.push({ n, name: `Sprint ${n}`, startISO: s, endISO: e, daysOff: overrides[n] || 0 });
  }
  return arr;
};

// ---- seed -----------------------------------------------------------------
// curated subjects per work stream so generated items read believably
const SUBJECTS = {
  'Checkout API': ['Tokenize card vault', 'Idempotent charge endpoint', '3-D Secure handshake', 'Refund + partial refund flow', 'Webhook retry queue', 'Multi-currency rounding', 'Dispute evidence upload', 'Settlement reconciliation job', 'PCI scope audit hooks', 'Rate-limit per merchant', 'Apple / Google Pay adapter', 'Saved payment methods UI', 'Decline reason taxonomy'],
  'Search Revamp': ['Typeahead suggestions', 'Relevance ranking model', 'Faceted filter sidebar', 'Synonym dictionary', 'Search analytics events', 'Index backfill job', 'Zero-result fallbacks'],
  'Mobile Onboarding': ['Welcome carousel', 'Phone verification', 'Permission priming screens', 'Profile setup flow', 'Push opt-in prompt', 'Resume-where-left-off'],
  'Billing Migration': ['Dual-write ledger', 'Invoice template port', 'Proration engine', 'Legacy data backfill', 'Cutover runbook', 'Reconciliation report'],
  'Notifications': ['Email digest scheduler', 'In-app inbox', 'Preference center', 'Delivery status tracking', 'Template localization'],
  'Admin Console': ['Role + permission editor', 'Audit log viewer', 'Bulk user import', 'Feature-flag toggles', 'Usage dashboards', 'Org settings page'],
};

// item-count matrix per sprint per stream: [Complete, Active, Blocked, NotStarted]
const M = (c, a, b, n) => [['Complete', c], ['Active', a], ['Blocked', b], ['Not Started', n]];
const ATLAS_MATRIX = {
  1: { 'Checkout API': M(4,1,0,0), 'Search Revamp': M(2,1,0,0), 'Mobile Onboarding': M(1,1,0,0) },
  2: { 'Checkout API': M(2,2,0,0), 'Search Revamp': M(1,2,1,0), 'Billing Migration': M(0,2,0,1) },
  3: { 'Checkout API': M(1,2,1,1), 'Billing Migration': M(0,1,1,2), 'Notifications': M(0,1,0,1) },
  4: { 'Search Revamp': M(0,2,0,2), 'Mobile Onboarding': M(0,1,1,2), 'Notifications': M(0,1,0,2) },
  5: { 'Checkout API': M(0,1,0,3), 'Admin Console': M(0,1,0,2), 'Billing Migration': M(0,0,1,2) },
  6: { 'Admin Console': M(0,0,0,4), 'Notifications': M(0,0,0,2) },
  7: { 'Mobile Onboarding': M(0,0,0,3), 'Search Revamp': M(0,0,0,2), 'Admin Console': M(0,0,0,1) },
  8: { 'Checkout API': M(0,0,0,2), 'Notifications': M(0,0,0,3) },
};
const PT_POOL = [2, 3, 5, 1, 8, 3, 2, 5];

function seed() {
  const teams = [
    { id: 'team_core', name: 'Platform Core', velocity: 40, members: ['Ada L.', 'Marco P.', 'Wei C.', 'Devi R.', 'Tom B.'].map((n) => ({ id: uid('m'), name: n })) },
    { id: 'team_growth', name: 'Growth', velocity: 24, members: ['Jen K.', 'Sam O.', 'Priya N.'].map((n) => ({ id: uid('m'), name: n })) },
    { id: 'team_pay', name: 'Payments', velocity: 32, members: ['Lou H.', 'Bea S.', 'Ravi M.', 'Nina D.'].map((n) => ({ id: uid('m'), name: n })) },
  ];

  const streamNames = ['Checkout API', 'Search Revamp', 'Mobile Onboarding', 'Billing Migration', 'Notifications', 'Admin Console'];
  const atlasStreams = streamNames.map((n) => ({ id: uid('ws'), name: n }));
  const atlasStart = '2026-04-13';
  const atlas = {
    id: 'rel_atlas', name: 'Atlas 4.0', startISO: atlasStart, teamId: 'team_core',
    workStreams: atlasStreams,
    events: [
      { id: uid('ev'), label: 'Kickoff', dateISO: '2026-04-13' },
      { id: uid('ev'), label: 'Design review', dateISO: '2026-05-15' },
      { id: uid('ev'), label: 'Code freeze', dateISO: '2026-06-05' },
      { id: uid('ev'), label: 'Demo', dateISO: '2026-06-19' },
      { id: uid('ev'), label: 'Beta cut', dateISO: '2026-07-03' },
      { id: uid('ev'), label: 'GA', dateISO: '2026-08-01' },
    ],
    sprints: buildSprints(atlasStart, { 3: 5, 5: 10, 7: 5 }),
  };

  // generate work items for Atlas from the matrix
  const items = [];
  const wsId = (name) => atlasStreams.find((w) => w.name === name).id;
  const subjIdx = {}; let keyN = 100; let ptI = 0;
  Object.entries(ATLAS_MATRIX).forEach(([sprintN, byStream]) => {
    Object.entries(byStream).forEach(([streamName, counts]) => {
      counts.forEach(([status, k]) => {
        for (let i = 0; i < k; i++) {
          const pool = SUBJECTS[streamName]; subjIdx[streamName] = (subjIdx[streamName] || 0);
          const subject = pool[subjIdx[streamName] % pool.length]; subjIdx[streamName]++;
          items.push({ id: uid('it'), releaseId: 'rel_atlas', workStreamId: wsId(streamName), sprintN: Number(sprintN),
            key: `ATL-${keyN++}`, subject, description: '', status, points: PT_POOL[ptI++ % PT_POOL.length] });
        }
      });
    });
  });

  // two lighter releases so the home list feels real
  const co = { id: 'rel_co', name: 'Q3 Checkout', startISO: '2026-05-19', teamId: 'team_pay',
    workStreams: [{ id: uid('ws'), name: 'Payment Sheet' }, { id: uid('ws'), name: 'Fraud Rules' }],
    events: [{ id: uid('ev'), label: 'Code freeze', dateISO: '2026-06-30' }],
    sprints: buildSprints('2026-05-19', { 4: 4 }) };
  const ob = { id: 'rel_ob', name: 'Onboarding Refresh', startISO: '2026-04-28', teamId: 'team_growth',
    workStreams: [{ id: uid('ws'), name: 'Activation Flow' }],
    events: [{ id: uid('ev'), label: 'GA', dateISO: '2026-06-15' }],
    sprints: buildSprints('2026-04-28', {}) };
  // a few items for the lighter releases
  [['rel_co', co.workStreams[0].id, 1, 'Active'], ['rel_co', co.workStreams[0].id, 1, 'Complete'], ['rel_co', co.workStreams[1].id, 2, 'Active'],
   ['rel_co', co.workStreams[1].id, 2, 'Not Started'], ['rel_ob', ob.workStreams[0].id, 1, 'Complete'], ['rel_ob', ob.workStreams[0].id, 2, 'Active']]
    .forEach(([rid, wid, sn, st], i) => items.push({ id: uid('it'), releaseId: rid, workStreamId: wid, sprintN: sn, key: `${rid === 'rel_co' ? 'CO' : 'OB'}-${10 + i}`, subject: 'Work item ' + (i + 1), description: '', status: st, points: PT_POOL[i % PT_POOL.length] }));

  return { version: SCHEMA_VERSION, teams, releases: [atlas, co, ob], items, meta: { lastSyncISO: null } };
}

// ---- store singleton ------------------------------------------------------
const Store = (() => {
  let state = null;
  const subs = new Set();
  const load = () => {
    try { const raw = localStorage.getItem(LS_KEY); if (raw) { const p = JSON.parse(raw); if (p && p.version === SCHEMA_VERSION) return p; } } catch (e) {}
    return seed();
  };
  const persist = () => { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {} };
  const emit = () => subs.forEach((f) => f(state));
  const commit = () => { persist(); emit(); };

  state = load();
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {}

  return {
    get: () => state,
    subscribe: (fn) => { subs.add(fn); return () => subs.delete(fn); },
    reset: () => { state = seed(); commit(); },

    // selectors
    team: (id) => state.teams.find((t) => t.id === id),
    release: (id) => state.releases.find((r) => r.id === id),
    itemsFor: (releaseId) => state.items.filter((i) => i.releaseId === releaseId),
    itemsForStream: (releaseId, wsId) => state.items.filter((i) => i.releaseId === releaseId && i.workStreamId === wsId),

    // actions
    createTeam: ({ name, velocity, members }) => {
      const t = { id: uid('team'), name: name || 'Untitled team', velocity: Number(velocity) || 0,
        members: (members || []).filter((m) => m.trim()).map((m) => ({ id: uid('m'), name: m.trim() })) };
      state.teams.push(t); commit(); return t;
    },
    updateTeam: (id, patch) => { const t = Store.team(id); if (t) { Object.assign(t, patch); commit(); } },
    createRelease: ({ name, startISO, teamId }) => {
      const r = { id: uid('rel'), name: name || 'Untitled release', startISO: startISO || todayISO(), teamId,
        workStreams: [], events: [], sprints: buildSprints(startISO || todayISO(), {}) };
      state.releases.push(r); commit(); return r;
    },
    createWorkStream: (releaseId, name) => {
      const r = Store.release(releaseId); if (!r) return null;
      const ws = { id: uid('ws'), name: name || 'Untitled stream' }; r.workStreams.push(ws); commit(); return ws;
    },
    createEvent: (releaseId, { label, dateISO }) => {
      const r = Store.release(releaseId); if (!r) return null;
      const ev = { id: uid('ev'), label: label || 'Event', dateISO: dateISO || todayISO() }; r.events.push(ev); commit(); return ev;
    },
    updateSprint: (releaseId, n, patch) => {
      const r = Store.release(releaseId); if (!r) return;
      const sp = r.sprints.find((s) => s.n === n); if (sp) { Object.assign(sp, patch); commit(); }
    },
    createItem: (releaseId, { workStreamId, sprintN, subject, description, status, points }) => {
      const r = Store.release(releaseId); if (!r) return null;
      const prefix = (r.name.match(/[A-Za-z]/g) || ['I']).slice(0, 3).join('').toUpperCase();
      const it = { id: uid('it'), releaseId, workStreamId, sprintN: Number(sprintN), key: `${prefix}-${100 + state.items.filter((i) => i.releaseId === releaseId).length}`,
        subject: subject || 'Untitled item', description: description || '', status: status || 'Not Started', points: Number(points) || 0 };
      state.items.push(it); commit(); return it;
    },
    updateItem: (id, patch) => { const it = state.items.find((i) => i.id === id); if (it) { Object.assign(it, patch); commit(); } },
    sync: () => { state.meta.lastSyncISO = new Date().toISOString();
      window.dispatchEvent(new CustomEvent('release-tracker:sync', { detail: { snapshot: state } })); commit(); return state.meta.lastSyncISO; },
  };
})();

// ---- derived helpers ------------------------------------------------------
const fullCap = (team) => (team ? team.members.length * WORKDAYS : 0);
const capPct = (team, daysOff) => { const f = fullCap(team); return f > 0 ? Math.max(0, (f - daysOff) / f) : 0; };
const sprintVel = (team, daysOff) => Math.round((team ? team.velocity : 0) * capPct(team, daysOff));
const activeSprint = (release) => release.sprints.find((s) => between(todayISO(), s.startISO, s.endISO)) || null;
const eventsIn = (release, sp) => release.events.filter((e) => between(e.dateISO, sp.startISO, sp.endISO)).sort((a, b) => a.dateISO < b.dateISO ? -1 : 1);

// segments [{k,v}] of statuses for a set of items
const statusSegs = (items) => STATUSES.map((k) => ({ k, v: items.filter((i) => i.status === k).length })).filter((s) => s.v > 0);

// useStore hook
function useStore() {
  const [, force] = React.useReducer((x) => x + 1, 0);
  React.useEffect(() => Store.subscribe(() => force()), []);
  return Store.get();
}

Object.assign(window, { Store, useStore, STATUSES, WORKDAYS, SPRINT_COUNT, uid, todayISO,
  isoOf, dOf, addDays, fmtShort, fmtLong, between, buildSprints,
  fullCap, capPct, sprintVel, activeSprint, eventsIn, statusSegs });
