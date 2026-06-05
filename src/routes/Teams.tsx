import { useTeamsView } from '../hooks/useTeamsView';
import { TeamsView } from '../views/TeamsView';

export function Teams() {
  return <TeamsView {...useTeamsView()} />;
}
