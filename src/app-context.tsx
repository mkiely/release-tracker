// App context — the openModal / notify / onSync / onPush seams.
//
// Screens call these without knowing how a modal is mounted or a toast is timed,
// which is what lets a presenter stay a pure function of its props. The provider
// owns modal + toast state and renders the ModalHost and Toast.

import { createContext, useContext, useRef, useState, type ReactNode } from 'react';
import { getActions } from './store/store';
import type { PushFailure } from './store/actions';
import type { SharePayload } from './lib/shareRelease';
import type { MetricsSection } from './modals/MetricsModal';
import { Toast } from './components/primitives';
import { ModalHost } from './modals/ModalHost';
import { ShareImporter } from './components/ShareImporter';

export type ModalSpec =
  | { type: 'team'; teamId?: string }
  | { type: 'stream'; releaseId: string; wsId?: string }
  | { type: 'streamHealth'; releaseId: string; wsId: string }
  | { type: 'metrics'; releaseId: string; section?: MetricsSection }
  | { type: 'timeline'; releaseId: string }
  | { type: 'event'; releaseId: string; eventId?: string }
  | { type: 'codeFreeze'; releaseId: string }
  | { type: 'sprint'; releaseId: string; sprintId: string }
  | { type: 'item'; releaseId: string; presetStreamId?: string; presetSprintId?: string }
  | { type: 'connectorItem'; releaseId: string; presetStreamId?: string; presetSprintId?: string }
  | { type: 'itemDetail'; itemId: string }
  | { type: 'pushReview'; releaseId: string; onConfirm: () => void | Promise<void> }
  | {
      type: 'pushResult';
      releaseId: string;
      pushed: number;
      failures: PushFailure[];
      onOpenItem: (itemId: string) => void;
      onRetry: () => void;
    }
  | { type: 'confirm'; title: string; body: string; confirmLabel: string; onConfirm: () => void }
  | { type: 'loadShare'; payload: SharePayload; onConfirm: () => void };

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
    const { created, updated, unchanged, skipped } = outcome.result;
    notify(
      `Synced \xb7 ${created} new, ${updated} updated${unchanged ? `, ${unchanged} unchanged` : ''}${skipped ? `, ${skipped} skipped` : ''}`,
    );
  };

  /**
   * Push, and surface what actually happened.
   *
   * The failure path is a modal, not a toast: a push is not all-or-nothing, so the
   * interesting outcome is usually "some landed, these didn't", which needs item
   * names, field-level detail and somewhere to click. The toast stays for the clean
   * case, where there is nothing to act on.
   */
  const onPush = async (releaseId: string) => {
    const outcome = await getActions().pushRelease(releaseId);
    const showResult = (pushed: number, failures: PushFailure[]) =>
      setModal({
        type: 'pushResult',
        releaseId,
        pushed,
        failures,
        onOpenItem: (itemId) => setModal({ type: 'itemDetail', itemId }),
        onRetry: () => {
          setModal(null);
          void onPush(releaseId);
        },
      });

    if (!outcome.ok) {
      // Every path from here closes or replaces the review modal — it stays open
      // across the request on purpose and cannot dismiss itself.
      if (outcome.reason === 'nothing-to-push') {
        setModal(null);
        return;
      }
      if (outcome.reason === 'no-connector') {
        setModal(null);
        notify('This release isn’t connected to an external system');
        return;
      }
      // Attributed failures get the modal; an unattributable one (transport, a
      // whole-request rejection) has no item to point at, so it stays a toast.
      if (outcome.failures && outcome.failures.length > 0) {
        showResult(0, outcome.failures);
        return;
      }
      setModal(null);
      notify(`Push failed: ${outcome.message}`);
      return;
    }

    const { pushed, failures } = outcome.result;
    if (failures.length > 0) {
      showResult(pushed, failures);
      return;
    }
    setModal(null);
    notify(`Pushed \xb7 ${pushed} change${pushed !== 1 ? 's' : ''}`);
  };

  return (
    <Ctx.Provider value={{ openModal: setModal, notify, onSync, onPush }}>
      <ShareImporter />
      {children}
      <ModalHost modal={modal} onClose={() => setModal(null)} />
      {toast && <Toast>{toast}</Toast>}
    </Ctx.Provider>
  );
}
