import { useHomeView } from '../hooks/useHomeView';
import { HomeView } from '../views/HomeView';

export function Home() {
  return <HomeView {...useHomeView()} />;
}
