// Part of the app's modal set. Reads what it needs from the store and commits
// through getActions(), so callers supply only ids and an onClose.

import { useState } from 'react';
import { type AttrValue } from '../types';
import { getActions, selItemsFor, selRelease, useStore } from '../store/store';
import { buildPushPreview, type PushItemPreview } from '../sync/push';
import { htmlToText } from '../lib/htmlNormalize';
import { displayValue } from '../components/fields/registry';
import { useConnectorMeta } from '../hooks/useConnectorMeta';
import { Icon } from '../components/Icon';
import { Modal, PButton } from '../components/primitives';
import { statusVars } from '../components/statusVars';
import { GoneModal } from './parts';

// Summarizes the pending push: per item, which writeable fields are changing
// (synced → local) before anything is sent. Writeability is derived per item from
// the connector's itemTypes catalog. Each row can be removed, which reverts that
// item's dirty fields back to its synced value.

export function PushReviewModal({
  releaseId,
  onConfirm,
  onClose,
}: {
  releaseId: string;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}) {
  const r = useStore((s) => selRelease(s, releaseId));
  const items = useStore((s) => selItemsFor(s, releaseId));
  const meta = useConnectorMeta(r?.connector?.type);
  const [busy, setBusy] = useState(false);

  if (!r) {
    return (
      <GoneModal title="Push changes" icon={Icon.sync} noun="release" onClose={onClose} />
    );
  }

  const sprintName = (id: string | null): string =>
    id == null ? 'No sprint' : (r.sprints.find((s) => s.id === id)?.name ?? 'Unknown sprint');
  const streamName = (id: string | null): string =>
    id == null ? 'No stream' : (r.workStreams.find((w) => w.id === id)?.name ?? 'Unknown stream');
  const statusVocab = meta?.statuses?.length ? meta.statuses : (r.catalog?.statuses ?? []);
  const valueText = (d: PushItemPreview['diffs'][number], v: AttrValue): string => {
    if (d.field === 'sprint') return sprintName(v as string | null);
    if (d.field === 'status') return statusVocab.find((sd) => sd.id === v)?.label ?? (v == null ? '—' : String(v));
    // Descriptions are long rich-text HTML; show a plain-text projection (clipped
    // at render). The point of the row is to flag that description is included,
    // not to render the whole document.
    if (d.field === 'description') return htmlToText(v == null ? '' : String(v)) || '—';
    if (d.spec) return displayValue(d.spec, v); // vocabulary: enum labels, Yes/No, em-dash
    return v == null ? '—' : String(v);
  };

  const previews = buildPushPreview(items, meta?.itemTypes);
  // Queued creates (pendingCreate) ride the same push. They have no old→new diff — the
  // whole item is new — so they render as their own row kind above the edits.
  const creates = items.filter((i) => i.pendingCreate);
  const total = previews.length + creates.length;

  // Deliberately does NOT close itself. The push's outcome decides what should be
  // on screen next — a toast over nothing, or the result modal listing what failed
  // — and only the provider that runs the push knows which. This used to `await
  // onConfirm(); onClose();`, which tore down the result modal the handler had just
  // opened, so a failed push looked like a silent no-op. Staying open until told
  // otherwise also keeps `busy` meaningful while the request is in flight.
  const doPush = async () => {
    if (busy || total === 0) return;
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  const arrow = (
    <span style={{ color: 'var(--rt-t3)', fontWeight: 'var(--rt-fw-semibold)' }} aria-label="changes to">→</span>
  );

  return (
    <Modal
      title="Push changes"
      icon={Icon.sync}
      onClose={onClose}
      width={560}
      footer={
        <>
          <PButton variant="subtle" onClick={onClose}>
            Cancel
          </PButton>
          <PButton onClick={doPush} disabled={busy || total === 0}>
            {busy ? 'Pushing…' : total > 0 ? `Push ${total} change${total !== 1 ? 's' : ''}` : 'Nothing to push'}
          </PButton>
        </>
      }
    >
      {total === 0 ? (
        <span style={{ color: 'var(--rt-t2)', fontSize: 'var(--rt-fs-md)', lineHeight: 'var(--rt-lh-normal)' }}>
          No pending changes to push — everything is in sync with the external system.
        </span>
      ) : (
        <>
          <div style={{ marginBottom: 12, fontSize: 'var(--rt-fs-sm)', color: 'var(--rt-t3)', lineHeight: 'var(--rt-lh-normal)' }}>
            {total} item{total !== 1 ? 's' : ''} will be written back to{' '}
            <strong style={{ color: 'var(--rt-t2)', fontWeight: 'var(--rt-fw-semibold)' }}>{r.name}</strong>
            {creates.length > 0 && (
              <> — including <strong style={{ color: 'var(--rt-t2)', fontWeight: 'var(--rt-fw-semibold)' }}>{creates.length} new item{creates.length !== 1 ? 's' : ''}</strong> to create</>
            )}
            . Review each change, or remove one to drop it from the push.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '52vh', overflowY: 'auto' }}>
            {creates.map((c) => (
              <div
                key={c.id}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                  padding: '10px 12px',
                  border: '1.5px solid var(--rt-line)', borderRadius: 9, background: 'var(--rt-paper)',
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span
                      style={{
                        fontSize: 'var(--rt-fs-xs)', fontWeight: 'var(--rt-fw-semibold)',
                        color: statusVars('In Progress').text, background: statusVars('In Progress').soft,
                        padding: '2px 6px', borderRadius: 5, flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.04em',
                      }}
                    >
                      New
                    </span>
                    {c.itemType && (
                      <span style={{ fontSize: 'var(--rt-fs-xs)', color: 'var(--rt-t3)', flexShrink: 0 }}>{c.itemType.label}</span>
                    )}
                    <span
                      title={c.subject}
                      style={{ fontSize: 'var(--rt-fs-sm)', color: 'var(--rt-t1)', fontWeight: 'var(--rt-fw-semibold)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {c.subject}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 14px', fontSize: 'var(--rt-fs-sm)', color: 'var(--rt-t2)' }}>
                    <span><span className="t3">Stream</span> {streamName(c.workStreamId)}</span>
                    <span><span className="t3">Sprint</span> {sprintName(c.sprintId)}</span>
                    {c.points != null && <span><span className="t3">Points</span> {c.points}</span>}
                  </div>
                </div>
                <PButton
                  variant="subtle"
                  sm
                  onClick={() => getActions().discardPendingCreate(c.id)}
                  disabled={busy}
                  title="Remove this queued item from the push"
                  style={{ flexShrink: 0 }}
                >
                  Remove
                </PButton>
              </div>
            ))}
            {previews.map((p) => (
              <div
                key={p.itemId}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                  padding: '10px 12px',
                  border: '1.5px solid var(--rt-line)', borderRadius: 9, background: 'var(--rt-paper)',
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span
                      className="mono"
                      style={{ fontSize: 'var(--rt-fs-xs)', color: 'var(--rt-t3)', background: 'var(--rt-fill)', padding: '2px 6px', borderRadius: 5, flexShrink: 0 }}
                    >
                      {p.key}
                    </span>
                    <span
                      title={p.subject}
                      style={{ fontSize: 'var(--rt-fs-sm)', color: 'var(--rt-t2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {p.subject}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {p.diffs.map((d) => {
                      // Long free-text values (description) clip to one ellipsized
                      // line so a row stays a single line; the full text is on the
                      // title tooltip.
                      const clip = d.field === 'description';
                      const clipStyle = clip
                        ? { maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block', verticalAlign: 'middle' as const }
                        : undefined;
                      const fromText = valueText(d, d.from);
                      const toText = valueText(d, d.to);
                      return (
                        <div key={d.field} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--rt-fs-sm)' }}>
                          <span style={{ color: 'var(--rt-t3)', minWidth: 52, flexShrink: 0 }}>{d.label}</span>
                          <span title={clip ? fromText : undefined} style={{ color: 'var(--rt-t3)', textDecoration: 'line-through', ...clipStyle }}>{fromText}</span>
                          {arrow}
                          <span title={clip ? toText : undefined} style={{ color: 'var(--rt-t1)', fontWeight: 'var(--rt-fw-semibold)', ...clipStyle }}>{toText}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <PButton
                  variant="subtle"
                  sm
                  onClick={() => getActions().revertItem(p.itemId)}
                  disabled={busy}
                  title="Revert this item to its synced value"
                  style={{ flexShrink: 0 }}
                >
                  Remove
                </PButton>
              </div>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}
