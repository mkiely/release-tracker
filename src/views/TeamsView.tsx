import { WORKDAYS } from '../types';
import type { TeamsViewProps } from '../hooks/useTeamsView';
import { TopBar } from '../components/chrome';
import { Icon } from '../components/Icon';
import { IconButton, PButton, PField, PInput } from '../components/primitives';

export function TeamsView({
  teams,
  onBack,
  onNewTeam,
  onEditTeam,
  onDeleteTeam,
  onUpdateVelocity,
  onToggleNonContributing,
}: TeamsViewProps) {
  return (
    <div className="wf screen">
      <TopBar
        left={<IconButton icon={Icon.chevLeft} title="Back" onClick={onBack} />}
        title="Teams"
        sub={<span>{teams.length} teams · velocity drives default sprint capacity</span>}
        right={
          <PButton sm icon={Icon.plus} onClick={onNewTeam}>
            New team
          </PButton>
        }
      />
      <div style={{ flex: 1, overflow: 'auto', padding: '22px 26px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16 }}>
          {teams.map((t) => (
            <div key={t.id} className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 15 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 'var(--rt-fw-heading)', fontSize: 'var(--rt-fs-lg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {t.name}
                  </div>
                  <div style={{ fontSize: 'var(--rt-fs-sm)', color: 'var(--rt-t3)', marginTop: 3 }}>
                    {t.members.length} members
                    {t.members.some((m) => m.nonContributing) && (
                      <span style={{ marginLeft: 6 }}>
                        · {t.members.filter((m) => m.nonContributing).length} not counted
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: '0 0 auto' }}>
                  {t.externalId ? (
                    <span className="tag" style={{ fontSize: 'var(--rt-fs-micro)', color: 'var(--rt-t3)' }}>
                      synced
                    </span>
                  ) : (
                    <IconButton icon={Icon.edit} title="Edit team" onClick={() => onEditTeam(t.id)} />
                  )}
                  <IconButton
                    icon={Icon.trash}
                    title="Delete team"
                    onClick={() => onDeleteTeam(t)}
                    style={{ color: 'var(--rt-t3)' }}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
                <PField label="Velocity">
                  <PInput
                    type="number"
                    min="0"
                    value={t.velocity}
                    onChange={(e) => onUpdateVelocity(t.id, Number(e.target.value) || 0)}
                    style={{ width: 112 }}
                  />
                </PField>
                <div style={{ flex: 1, paddingBottom: 13 }}>
                  <div style={{ fontSize: 'var(--rt-fs-xs)', color: 'var(--rt-t3)' }}>Full capacity</div>
                  <div style={{ fontSize: 'var(--rt-fs-base)', fontWeight: 'var(--rt-fw-semibold)', color: 'var(--rt-t2)' }}>
                    {t.members.filter((m) => !m.nonContributing).length * WORKDAYS} person-days / sprint
                  </div>
                </div>
              </div>
              <hr className="divider" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {t.members.map((m) => (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <span className="avatar" style={{ opacity: m.nonContributing ? 0.4 : 1 }}>
                      {m.name
                        .split(' ')
                        .map((p) => p[0])
                        .slice(0, 2)
                        .join('')}
                    </span>
                    <span
                      style={{
                        fontSize: 'var(--rt-fs-base)',
                        fontWeight: 'var(--rt-fw-medium)',
                        whiteSpace: 'nowrap',
                        color: m.nonContributing ? 'var(--rt-t3)' : undefined,
                      }}
                    >
                      {m.name}
                    </span>
                    {m.nonContributing && (
                      <span className="tag" style={{ fontSize: 'var(--rt-fs-micro)', color: 'var(--rt-t3)' }}>
                        no capacity
                      </span>
                    )}
                    <div style={{ marginLeft: 'auto' }}>
                      <IconButton
                        icon={m.nonContributing ? Icon.member : Icon.memberOff}
                        title={m.nonContributing ? 'Include in capacity' : 'Exclude from capacity'}
                        onClick={() => onToggleNonContributing(t.id, m.id)}
                        style={{ color: 'var(--rt-t3)' }}
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
