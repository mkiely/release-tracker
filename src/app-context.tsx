// App context — preserves the prototype's openModal / notify / onSync seams so
// screen code stays close to proto-app.jsx. The provider owns modal + toast
// state and renders the ModalHost and Toast.

import { createContext, useContext, useRef, useState, type ReactNode } from 'react';
import { getActions } from './store/store';
import { Toast } from './components/primitives';
import { ModalHost } from './modals/ModalHost';

export type ModalSpec =
  | { type: 'team'; teamId?: string }
  | { type: 'stream'; releaseId: string }
  | { type: 'event'; releaseId: string }
  | { type: 'sprint'; releaseId: string; sprintId: string }
  | { type: 'item'; releaseId: string; presetStreamId?: string; presetSprintId?: string }
  | { type: 'itemDetail'; itemId: string };

interface AppCtx {
  openModal: (m: ModalSpec) => void;
  notify: (msg: string) => void;
  onSync: (releaseId: string) => Promise<void>;
  onPush: (releaseId: string) => Promise<void>;
}

const Ctx = createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used within AppProvider');
  return v;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [modal, setModal] = useState<ModalSpec | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2400);
  };

  const onSync = async (releaseId: string) => {
    const outcome = await getActions().syncRelease(releaseId);
    if (!outcome.ok) {
      notify(
        outcome.reason === 'no-connector'
          ? 'This release isn’t connected to an external system'
          : `Sync failed: ${outcome.message}`,
      );
      return;
    }
    const { created, updated, skipped } = outcome.result;
    notify(`Synced \xb7 ${created} new, ${updated} updated${skipped ? `, ${skipped} skipped` : ''}`);
  };

  const onPush = async (releaseId: string) => {
    const outcome = await getActions().pushRelease(releaseId);
    if (!outcome.ok) {
      if (outcome.reason === 'nothing-to-push') return; // button already hides itself
      notify(
        outcome.reason === 'no-connector'
          ? 'This release isn’t connected to an external system'
          : `Push failed: ${outcome.message}`,
      );
      return;
    }
    notify(`Pushed \xb7 ${outcome.result.pushed} change${outcome.result.pushed !== 1 ? 's' : ''}`);
  };

  return (
    <Ctx.Provider value={{ openModal: setModal, notify, onSync, onPush }}>
      {children}
      <ModalHost modal={modal} onClose={() => setModal(null)} />
      {toast && <Toast>{toast}</Toast>}
    </Ctx.Provider>
  );
}
