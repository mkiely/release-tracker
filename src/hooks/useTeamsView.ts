import { useNavigate } from 'react-router-dom';
import { getActions, useStore } from '../store/store';
import { useApp } from '../app-context';
import type { Team } from '../types';

export interface TeamsViewProps {
  teams: Team[];
  onBack: () => void;
  onNewTeam: () => void;
  onEditTeam: (teamId: string) => void;
  onDeleteTeam: (t: { id: string; name: string }) => void;
  onUpdateVelocity: (teamId: string, velocity: number) => void;
  onToggleNonContributing: (teamId: string, memberId: string) => void;
}

export function useTeamsView(): TeamsViewProps {
  const st = useStore();
  const navigate = useNavigate();
  const { openModal } = useApp();

  return {
    teams: st.teams,
    onBack: () => navigate('/'),
    onNewTeam: () => openModal({ type: 'team' }),
    onEditTeam: (teamId) => openModal({ type: 'team', teamId }),
    onDeleteTeam: (t) =>
      openModal({
        type: 'confirm',
        title: 'Delete team',
        body: `Delete "${t.name}"? This cannot be undone.`,
        confirmLabel: 'Delete team',
        onConfirm: () => getActions().deleteTeam(t.id),
      }),
    onUpdateVelocity: (teamId, velocity) => getActions().updateTeam(teamId, { velocity }),
    onToggleNonContributing: (teamId, memberId) => {
      const t = st.teams.find((x) => x.id === teamId);
      if (!t) return;
      getActions().updateTeam(teamId, {
        members: t.members.map((m) =>
          m.id === memberId ? { ...m, nonContributing: !m.nonContributing } : m,
        ),
      });
    },
  };
}
