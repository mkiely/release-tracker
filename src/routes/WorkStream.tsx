import { useWorkStreamView } from '../hooks/useWorkStreamView';
import { WorkStreamView } from '../views/WorkStreamView';
import { WorkStreamTable } from '../views/WorkStreamTable';
import { NotFound } from '../components/chrome';
import { useViewMode } from '../store/viewMode';

export function WorkStream() {
  const vm = useWorkStreamView();
  const viewMode = useViewMode();
  const View = viewMode === 'table' ? WorkStreamTable : WorkStreamView;
  return vm ? <View {...vm} /> : <NotFound label="Work stream not found." />;
}
