import { useReleaseView } from '../hooks/useReleaseView';
import { ReleaseView } from '../views/ReleaseView';
import { ReleaseTable } from '../views/ReleaseTable';
import { NotFound } from '../components/chrome';
import { useViewMode } from '../store/viewMode';

export function Release() {
  const vm = useReleaseView();
  const viewMode = useViewMode();
  const View = viewMode === 'table' ? ReleaseTable : ReleaseView;
  return vm ? <View {...vm} /> : <NotFound label="Release not found." />;
}
