import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/base.css';
import App from './App';
import { createBackupController, installBackup } from './store/backup';
import { HttpBackupClient } from './store/backupClient';
import { serviceBaseUrl } from './sync/client';

// The durable backup runs beside the app, never ahead of it: localStorage stays the
// boot source, so rendering doesn't wait on work-truck being up.
installBackup(
  createBackupController({
    client: new HttpBackupClient(serviceBaseUrl()),
    reload: () => window.location.reload(),
  }),
).start();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
