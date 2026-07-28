import { useUnassignedView } from '../hooks/useItemListView';
import { ItemListView } from '../views/ItemListView';
import { NotFound } from '../components/AppChrome';

export function Unassigned() {
  const vm = useUnassignedView();
  return vm ? <ItemListView {...vm} /> : <NotFound label="Release not found." />;
}
