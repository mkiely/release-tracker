// Detects a `#share=` link on app load and offers to import the release it
// encodes. On confirm, recreates the connector release (config + events + days
// off) and navigates to it; the user then syncs to fetch work items/streams.
//
// Rendered once inside AppProvider. The `#share=` value is always stripped from
// the URL after handling so a reload doesn't re-prompt or re-import.

import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getActions } from '../store/store';
import { useApp } from '../app-context';
import { SHARE_PARAM, decodeSharePayload } from '../lib/shareRelease';

/** Remove the `#share=` value from the address bar without a navigation. Other
 *  hash params are preserved; an emptied hash is dropped entirely rather than
 *  left as a bare `#`. */
function stripShareParam() {
  const url = new URL(window.location.href);
  const params = new URLSearchParams(url.hash.replace(/^#/, ''));
  params.delete(SHARE_PARAM);
  const rest = params.toString();
  window.history.replaceState(null, '', url.pathname + url.search + (rest ? `#${rest}` : ''));
}

export function ShareImporter() {
  const { openModal, notify } = useApp();
  const navigate = useNavigate();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return; // guard StrictMode's double-invoke
    handled.current = true;

    const encoded = new URLSearchParams(window.location.hash.replace(/^#/, '')).get(SHARE_PARAM);
    if (!encoded) return;
    stripShareParam();

    // Decoding is async (see lib/urlCodec), so the import prompt opens a tick after
    // mount rather than during it. Nothing is rendered by this component, so there's
    // no intermediate state to guard — the modal simply appears when it resolves.
    void (async () => {
      const payload = await decodeSharePayload(encoded);
      if (!payload) {
        notify('That share link is invalid or corrupted');
        return;
      }

      openModal({
        type: 'loadShare',
        payload,
        onConfirm: () => {
          const r = getActions().importSharedRelease(payload);
          navigate(`/releases/${r.id}`);
          notify('Release loaded — click Sync to fetch its data');
        },
      });
    })();
  }, [openModal, notify, navigate]);

  return null;
}
