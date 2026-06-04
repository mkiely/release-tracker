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
    <div className="wf wf-screen pt-root">
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
            <div key={t.id} className="wf-card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 15 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 750, fontSize: 16, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</div>
                  <div style={{ fontSize: 12, color: WF.t3, marginTop: 3 }}>{t.members.length} members</div>
                </div>
                <div style={{ display: 'flex', gap: 4, flex: '0 0 auto' }}>
                  <IconButton
                    icon={Icon.edit}
                    title="Edit team"
                    onClick={() => openModal({ type: 'team', teamId: t.id })}
                  />
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
                  <div style={{ fontSize: 13, fontWeight: 600, color: WF.t2 }}>{t.members.length * WORKDAYS} person-days / sprint</div>
                </div>
              </div>
              <hr className="wf-divider" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {t.members.map((m) => (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <span className="wf-avatar">{m.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}</span>
                    <span style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: 'nowrap' }}>{m.name}</span>
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
