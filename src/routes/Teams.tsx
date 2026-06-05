// Teams — grid of team cards with inline-editable velocity + member list.
// Ported from TeamsScreen in proto-app.jsx.

import { useNavigate } from 'react-router-dom';
import { WORKDAYS } from '../types';
import { getActions, useStore } from '../store/store';
import { useApp } from '../app-context';
import { TopBar } from '../components/chrome';
import { Icon } from '../components/Icon';
import { IconButton, PButton, PField, PInput } from '../components/primitives';
import { WF } from '../components/tokens';

export function Teams() {
  const st = useStore();
  const navigate = useNavigate();
  const { openModal } = useApp();

  const toggleNonContributing = (teamId: string, memberId: string) => {
    const t = st.teams.find((x) => x.id === teamId);
    if (!t) return;
    getActions().updateTeam(teamId, {
      members: t.members.map((m) => m.id === memberId ? { ...m, nonContributing: !m.nonContributing } : m),
    });
  };

  const confirmDeleteTeam = (t: { id: string; name: string }) => {
    openModal({
      type: 'confirm',
      title: 'Delete team',
      body: `Delete "${t.name}"? This cannot be undone.`,
      confirmLabel: 'Delete team',
      onConfirm: () => getActions().deleteTeam(t.id),
    });
  };
  return (
    <div className="wf screen">
      <TopBar
        left={<IconButton icon={Icon.chevLeft} title="Back" onClick={() => navigate('/')} />}
        title="Teams"
        sub={<span>{st.teams.length} teams · velocity drives default sprint capacity</span>}
        right={
          <PButton sm icon={Icon.plus} onClick={() => openModal({ type: 'team' })}>
            New team
          </PButton>
        }
      />
      <div style={{ flex: 1, overflow: 'auto', padding: '22px 26px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16 }}>
          {st.teams.map((t) => (
            <div key={t.id} className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 15 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 750, fontSize: 16, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</div>
                  <div style={{ fontSize: 12, color: WF.t3, marginTop: 3 }}>
                    {t.members.length} members
                    {t.members.some((m) => m.nonContributing) && (
                      <span style={{ marginLeft: 6 }}>· {t.members.filter((m) => m.nonContributing).length} not counted</span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: '0 0 auto' }}>
                  {t.externalId ? (
                    <span className="tag" style={{ fontSize: 10.5, color: WF.t3 }}>synced</span>
                  ) : (
                    <IconButton
                      icon={Icon.edit}
                      title="Edit team"
                      onClick={() => openModal({ type: 'team', teamId: t.id })}
                    />
                  )}
                  <IconButton
                    icon={Icon.trash}
                    title="Delete team"
                    onClick={() => confirmDeleteTeam(t)}
                    style={{ color: WF.t3 }}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
                <PField label="Velocity">
                  <PInput
                    type="number"
                    min="0"
                    value={t.velocity}
                    onChange={(e) => getActions().updateTeam(t.id, { velocity: Number(e.target.value) || 0 })}
                    style={{ width: 112 }}
                  />
                </PField>
                <div style={{ flex: 1, paddingBottom: 13 }}>
                  <div style={{ fontSize: 11.5, color: WF.t3 }}>Full capacity</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: WF.t2 }}>{t.members.filter((m) => !m.nonContributing).length * WORKDAYS} person-days / sprint</div>
                </div>
              </div>
              <hr className="divider" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {t.members.map((m) => (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <span className="avatar" style={{ opacity: m.nonContributing ? 0.4 : 1 }}>
                      {m.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}
                    </span>
                    <span style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: 'nowrap', color: m.nonContributing ? WF.t3 : undefined }}>
                      {m.name}
                    </span>
                    {m.nonContributing && (
                      <span className="tag" style={{ fontSize: 10.5, color: WF.t3 }}>no capacity</span>
                    )}
                    <div style={{ marginLeft: 'auto' }}>
                      <IconButton
                        icon={m.nonContributing ? Icon.member : Icon.memberOff}
                        title={m.nonContributing ? 'Include in capacity' : 'Exclude from capacity'}
                        onClick={() => toggleNonContributing(t.id, m.id)}
                        style={{ color: WF.t3 }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
