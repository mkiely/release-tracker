import { useReleaseView, type ReleaseViewProps } from '../hooks/useReleaseView';
import { ReleaseView } from '../views/ReleaseView';
import { ReleaseTable } from '../views/ReleaseTable';
import { ReleaseStreamView } from '../views/ReleaseStreamView';
import { ReleaseStreamTable } from '../views/ReleaseStreamTable';
import { NotFound } from '../components/chrome';
import { useViewMode } from '../store/viewMode';
import { useAxisMode } from '../store/axisMode';

// (axis, density) → presenter. Density (cards/table) is a global setting; axis
// (sprint/stream) is the on-screen lens. All four share ReleaseChrome.
const PRESENTERS: Record<string, (props: ReleaseViewProps) => JSX.Element> = {
  'sprint:cards': ReleaseView,
  'sprint:table': ReleaseTable,
  'stream:cards': ReleaseStreamView,
  'stream:table': ReleaseStreamTable,
};

export function Release() {
  const vm = useReleaseView();
  const viewMode = useViewMode();
  const axisMode = useAxisMode();
  const View = PRESENTERS[`${axisMode}:${viewMode}`] ?? ReleaseView;
  return vm ? <View {...vm} /> : <NotFound label="Release not found." />;
}
