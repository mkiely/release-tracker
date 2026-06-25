import { useBacklogView } from '../hooks/useBacklogView';
import { BacklogView } from '../views/BacklogView';
import { NotFound } from '../components/chrome';

export function Backlog() {
  const vm = useBacklogView();
  return vm ? <BacklogView {...vm} /> : <NotFound label="Release not found." />;
}
