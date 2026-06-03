// Home / Releases — new-release form + grid of release cards.
// Ported from HomeScreen in proto-app.jsx.

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { todayISO, fmtShort } from '../lib/dates';
import { DEFAULT_SPRINT_COUNT } from '../types';
import { selItemsFor, selTeam, useStore } from '../store/store';
import { getActions } from '../store/store';
import { connectorLabel, syncClient, type ConnectorMeta } from '../sync/client';
import { useApp } from '../app-context';
import { Brand, TopBar } from '../components/chrome';
import { Icon } from '../components/Icon';
import { Meter } from '../components/badges';
import { IconButton, PButton, PField, PInput, PSelect } from '../components/primitives';
import { WF } from '../components/tokens';
import type { Release } from '../types';

export function Home() {
  const st = useStore();
  const navigate = useNavigate();
  const { openModal } = useApp();
  const [name, setName] = useState('');
  const [start, setStart] = useState(todayISO());
  const [teamId, setTeamId] = useState(st.teams[0] ? st.teams[0].id : '');

  // Connector catalog is advertised by the sync service (fixtures today).
  const [connectors, setConnectors] = useState<ConnectorMeta[]>([]);
  const [connType, setConnType] = useState(''); // '' = Local (no sync)
  const [config, setConfig] = useState<Record<string, string>>({});
  const [sprintCount, setSprintCount] = useState(DEFAULT_SPRINT_COUNT);
  useEffect(() => {
    let alive = true;
    syncClient
      .listConnectors()
      .then((cs) => alive && setConnectors(cs))
      .catch(() => alive && setConnectors([])); // service unreachable → Local-only
    return () => {
      alive = false;
    };
  }, []);
  const meta = connectors.find((c) => c.type === connType);
  const configComplete = !meta || meta.configFields.every((f) => !f.required || config[f.key]?.trim());

  const canCreate = !!name.trim() && !!start && !!teamId && configComplete;
  const create = () => {
    const connector = meta ? { type: connType, config } : null;
    const r = getActions().createRelease({ name: name.trim(), startISO: start, teamId, connector, sprintCount: connector ? undefined : sprintCount });
    navigate(`/releases/${r.id}`);
  };

  const loadDemoData = () => {
    getActions().reset();
  };

  const card = (r: Release) => {
    const team = selTeam(st, r.teamId);
    const items = selItemsFor(st, r.id);
    const done = items.length ? items.filter((i) => i.status === 'Complete').length / items.length : 0;
    return (
      <div
        key={r.id}
        className="wf-card pt-link"
        onClick={() => navigate(`/releases/${r.id}`)}
        style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12, cursor: 'pointer', transition: 'border-color .12s, box-shadow .12s' }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = WF.lineStrong;
          e.currentTarget.style.boxShadow = '0 2px 0 ' + WF.line;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = WF.line;
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 16, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: '1 1 auto', minWidth: 0 }}>
            {r.name}
          </div>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: WF.t2, flex: '0 0 auto' }}>{Math.round(done * 100)}%</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: WF.t3, fontSize: 13, whiteSpace: 'nowrap' }}>
          {Icon.users}
          <span>{team ? team.name : '—'}</span>
          {r.connector && (
            <span className="wf-tag" style={{ marginLeft: 'auto', flex: '0 0 auto' }}>
              {connectorLabel(r.connector.type)}
            </span>
          )}
        </div>
        <Meter v={done} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: WF.t3 }}>
          <span>{r.workStreams.length} streams</span>
          <span>{items.length} items</span>
          <span>{fmtShort(r.startISO)}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="wf wf-screen pt-root">
      <TopBar
        left={<Brand />}
        title={null}
        right={
          <div style={{ display: 'flex', gap: 8 }}>
            {import.meta.env.DEV && (
              <PButton variant="subtle" sm onClick={loadDemoData}>
                Load demo data
              </PButton>
            )}
            <PButton variant="subtle" sm icon={Icon.users} onClick={() => navigate('/teams')}>
              Teams
            </PButton>
          </div>
        }
      />
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 28px', gap: 40 }}>
        <div style={{ width: 440, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 26, fontWeight: 750, letterSpacing: '-0.02em' }}>New release</div>
            <div style={{ fontSize: 14.5, color: WF.t3, marginTop: 5 }}>Start tracking a release cycle.</div>
          </div>
          <div className="wf-card" style={{ width: '100%', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <PField label="Release name">
              <PInput
                value={name}
                placeholder="e.g. Orion 2.0"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && canCreate) create();
                }}
              />
            </PField>
            <PField label="Start date">
              <PInput type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </PField>
            {!meta && (
              <PField label="Number of sprints" hint="2-week sprints; default is 8">
                <PInput
                  type="number"
                  value={sprintCount}
                  min={1}
                  max={26}
                  step={1}
                  onChange={(e) => setSprintCount(Math.max(1, Math.min(26, parseInt(e.target.value, 10) || DEFAULT_SPRINT_COUNT)))}
                />
              </PField>
            )}
            <PField label="Team">
              <div style={{ display: 'flex', gap: 9 }}>
                <PSelect value={teamId} onChange={(e) => setTeamId(e.target.value)} style={{ flex: 1 }}>
                  {st.teams.length === 0 && <option value="">No teams yet</option>}
                  {st.teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </PSelect>
                <IconButton icon={Icon.plus} title="New team" onClick={() => openModal({ type: 'team' })} style={{ minHeight: 46, width: 46 }} />
              </div>
            </PField>
            {connectors.length > 0 && (
              <PField label="Connector" hint="pull work from an external system">
                <PSelect value={connType} onChange={(e) => setConnType(e.target.value)}>
                  <option value="">Local (no sync)</option>
                  {connectors.map((c) => (
                    <option key={c.type} value={c.type}>
                      {c.label}
                    </option>
                  ))}
                </PSelect>
              </PField>
            )}
            {meta && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '14px 14px 2px', borderLeft: `2px solid ${WF.line}`, marginLeft: 2 }}>
                {meta.configFields.map((f) => (
                  <PField key={f.key} label={f.label} hint={f.required ? undefined : 'optional'}>
                    <PInput
                      value={config[f.key] ?? ''}
                      placeholder={f.hint}
                      onChange={(e) => setConfig((c) => ({ ...c, [f.key]: e.target.value }))}
                    />
                  </PField>
                ))}
              </div>
            )}
            <PButton onClick={create} disabled={!canCreate} style={{ justifyContent: 'center', marginTop: 4 }}>
              Create release
            </PButton>
          </div>
        </div>
        <div style={{ width: '100%', maxWidth: 920 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <span className="wf-tag">Your releases · {st.releases.length}</span>
          </div>
          {st.releases.length === 0 ? (
            <div className="wf-card wf-dash" style={{ padding: 30, textAlign: 'center', color: WF.t3, fontSize: 14 }}>
              No releases yet — create one above.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>{st.releases.map(card)}</div>
          )}
        </div>
      </div>
    </div>
  );
}
