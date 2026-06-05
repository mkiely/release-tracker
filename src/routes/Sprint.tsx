import { useSprintView } from '../hooks/useSprintView';
import { SprintView } from '../views/SprintView';
import { SprintTable } from '../views/SprintTable';
import { NotFound } from '../components/chrome';
import { useViewMode } from '../store/viewMode';

export function Sprint() {
  const vm = useSprintView();
  const viewMode = useViewMode();
  const View = viewMode === 'table' ? SprintTable : SprintView;
  return vm ? <View {...vm} /> : <NotFound label="Sprint not found." />;
}
