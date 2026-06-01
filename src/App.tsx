// App root — routes map the prototype's `route` object to real URLs:
//   /                          → Home / Releases
//   /teams                     → Teams
//   /releases/:id              → Release Overview (release plan view)
//   /releases/:id/sprints/:n   → Sprint view
//   /releases/:id/streams/:wsId→ Work Stream view
// The browser URL persists routing across reloads.

import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppProvider } from './app-context';
import { Home } from './routes/Home';
import { Teams } from './routes/Teams';
import { Release } from './routes/Release';
import { Sprint } from './routes/Sprint';
import { WorkStream } from './routes/WorkStream';

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/teams" element={<Teams />} />
          <Route path="/releases/:id" element={<Release />} />
          <Route path="/releases/:id/sprints/:n" element={<Sprint />} />
          <Route path="/releases/:id/streams/:wsId" element={<WorkStream />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppProvider>
    </BrowserRouter>
  );
}
