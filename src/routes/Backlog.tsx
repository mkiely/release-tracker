import { useBacklogView } from '../hooks/useItemListView';
import { ItemListView } from '../views/ItemListView';
import { NotFound } from '../components/AppChrome';

export function Backlog() {
  const vm = useBacklogView();
  return vm ? <ItemListView {...vm} /> : <NotFound label="Release not found." />;
}
