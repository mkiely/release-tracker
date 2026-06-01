// Home / Releases — new-release form + grid of release cards.
// Ported from HomeScreen in proto-app.jsx.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { todayISO, fmtShort } from '../lib/dates';
import { selItemsFor, selTeam, useStore } from '../store/store';
import { getActions } from '../store/store';
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
  const canCreate = !!name.trim() && !!start && !!teamId;
  const create = () => {
    const r = getActions().createRelease({ name: name.trim(), startISO: start, teamId });
    navigate(`/releases/${r.id}`);
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
          <PButton variant="subtle" sm icon={Icon.users} onClick={() => navigate('/teams')}>
            Teams
          </PButton>
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
                placeholder="e.g. Atlas 4.0"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && canCreate) create();
                }}
              />
            </PField>
            <PField label="Start date">
              <PInput type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </PField>
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
