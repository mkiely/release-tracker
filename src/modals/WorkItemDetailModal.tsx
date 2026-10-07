// Part of the app's modal set. Reads what it needs from the store and commits
// through getActions(), so callers supply only ids and an onClose.

import { useState } from 'react';
import { LOCAL_ITEM_TYPES, STATUSES, type AttrValue, type Status } from '../types';
import { fmtDateTime } from '../lib/dates';
import { getActions, selItem, selRelease, selTeam, useStore } from '../store/store';
import { attributeFields, conceptWriteable, fieldLabel, itemTypeFor, recomputeDirty, writeableAttributeFields, writeableLocalFields, type CanonicalView, type EditConcept } from '../lib/connectorFields';
import { displayValue, FieldControl } from '../components/fields/registry';
import { useConnectorMeta } from '../hooks/useConnectorMeta';
import { DirtyDot } from '../components/DirtyDot';
import { RichTextEditor } from '../components/RichTextEditor';
import { copyRich, linkClipboard } from '../lib/copyLink';
import { useApp } from '../app-context';
import { Icon } from '../components/Icon';
import { Modal, ModalSplit, PButton, PField, PInput, PMetaLine, PointSeg, PSelect, PTextarea } from '../components/primitives';
import { Callout, MetaChip } from '../components/ui/Callout';
import { GoneModal } from './parts';
import modalStyles from './modals.module.css';
import styles from './WorkItemDetailModal.module.css';

export function WorkItemDetailModal({ itemId, onClose }: { itemId: string; onClose: () => void }) {
  const it = useStore((s) => selItem(s, itemId));
  const r = useStore((s) => (it ? selRelease(s, it.releaseId) : undefined));
  const team = useStore((s) => (r ? selTeam(s, r.teamId) : undefined));
  const meta = useConnectorMeta(r?.connector?.type);
  const { notify, openModal } = useApp();

  const [subject, setSubject] = useState(it ? it.subject : '');
  const [desc, setDesc] = useState(it ? it.description : '');
  const [wsId, setWsId] = useState<string | null>(it ? it.workStreamId : null);
  const [sprintId, setSprintId] = useState<string | null>(it?.sprintId ?? null);
  const [status, setStatus] = useState<Status>(it ? it.status : 'Not Started');
  const [statusNativeId, setStatusNativeId] = useState<string>(it?.statusNative?.id ?? '');
  const [points, setPoints] = useState<number | null>(it ? it.points : null);
  const [assignedMemberId, setAssignedMemberId] = useState<string | null>(it?.assignedMemberId ?? null);
  const [typeLabel, setTypeLabel] = useState<string>(it?.itemType?.label ?? '');
  const [attrs, setAttrs] = useState<Record<string, AttrValue>>(it?.attributes ?? {});

  if (!it || !r) {
    return (
      <GoneModal title="Work item" icon={Icon.item} noun="item" onClose={onClose} />
    );
  }

  const synced = !!it.externalId;
  const connectorRelease = !!r.connector;
  // Lock state derives from the connector's itemTypes catalog: a synced field is
  // editable only where its type marks it writeable. Unknown/local items fall back —
  // local (never-synced) items are fully editable; unknown synced types allow
  // points + sprint (see conceptWriteable). One declared source, no hand-coded rules.
  // Live meta when the service is reachable; the release's sync-time catalog
  // snapshot otherwise, so synced items stay interpretable offline.
  const itype = itemTypeFor(it.itemType?.id, meta?.itemTypes ?? r.catalog?.itemTypes);
  // The connector's status vocabulary (native workflow states). Empty = the
  // backend uses the canonical five directly.
  const statusVocab = meta?.statuses?.length ? meta.statuses : (r.catalog?.statuses ?? []);
  const vocabStatus = synced && statusVocab.length > 0;
  const canWrite = (c: EditConcept) => !synced || conceptWriteable(itype, c);
  const isDirty = it.dirtyFields.length > 0;
  // Connector vocabulary (e.g. a Bug's severity): declared by the catalog, stored
  // in it.attributes. Writeable fields edit + push back; the rest render read-only.
  const attrFields = synced ? attributeFields(itype) : [];
  const writeableLocal = writeableLocalFields(itype);
  const editableAttrKeys = new Set(writeableAttributeFields(itype).map((f) => f.key));
  const attrEditable = (key: string) => editableAttrKeys.has(key);

  // Resolve the chosen status: in vocabulary mode the select carries a native id
  // whose category becomes the canonical status; otherwise the canonical select
  // value is used directly.
  const chosenDef = vocabStatus ? statusVocab.find((sd) => sd.id === statusNativeId) : undefined;
  const nextStatus: Status = chosenDef ? chosenDef.category : status;
  const nextStatusNative = chosenDef ? { id: chosenDef.id, label: chosenDef.label } : (it.statusNative ?? null);

  const save = () => {
    let nextDirty = [...it.dirtyFields];
    const nextAttrs = { ...it.attributes };
    if (synced) {
      // Accumulate dirty flags for any writeable canonical field whose value
      // changed — derived from the registry, so every connector-writeable field
      // (description, subject, assignee, … not just points/sprint/status) is
      // tracked and will be pushed.
      const nextView: CanonicalView = {
        points,
        sprintId,
        workStreamId: wsId,
        assignedMemberId,
        status: nextStatus,
        statusNative: nextStatusNative,
        subject: subject.trim() || it.subject,
        description: desc,
      };
      for (const f of attrFields) {
        if (attrEditable(f.key)) nextAttrs[f.key] = attrs[f.key] ?? null;
      }
      nextDirty = recomputeDirty(it, nextView, writeableLocal, nextAttrs, editableAttrKeys);
    }
    getActions().updateItem(itemId, {
      subject: subject.trim() || it.subject,
      description: desc,
      workStreamId: wsId,
      sprintId,
      status: nextStatus,
      statusNative: nextStatusNative,
      points,
      assignedMemberId,
      attributes: nextAttrs,
      dirtyFields: nextDirty,
      ...(!connectorRelease && { itemType: typeLabel ? { id: null, label: typeLabel } : null }),
    });
    onClose();
  };

  // Copy a clickable link to the item's backend record, so a paste lands as a
  // live link in docs/chat and as readable text everywhere else.
  const copyLink = async () => {
    if (!it.externalUrl) return;
    const ok = await copyRich(linkClipboard(it.key, it.subject, it.externalUrl));
    notify(ok ? 'Link copied' : 'Copy failed');
  };

  // Drop the item locally. The escape hatch for an item the connector has stopped
  // returning (a narrowed pull query, a moved ticket): without it the only way out
  // is deleting the whole release. Deliberately worded as "forget", not "delete" —
  // nothing is sent anywhere, and saying "delete" next to a connector's name would
  // imply otherwise.
  const forgetBody = [
    `Remove ${it.key} — "${it.subject}" — from this release?`,
    synced
      ? `This only affects your local copy. Nothing is deleted in ${meta?.label ?? 'the external system'}, and the item will reappear if a future sync returns it.`
      : 'This item exists only here, so removing it is permanent.',
    isDirty ? 'Its unpushed local edits will be discarded.' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const forgetTitle = synced
    ? 'Remove this item from your local copy — nothing is deleted in the external system'
    : 'Remove this item permanently';
  const forget = () =>
    openModal({
      type: 'confirm',
      title: 'Forget work item',
      body: forgetBody,
      confirmLabel: 'Forget item',
      onConfirm: () => {
        getActions().forgetItem(it.id);
        notify(`${it.key} removed from this release`);
      },
    });

  // Connector context banner — rendered in the footer (left of the buttons) so it
  // doesn't eat vertical space the description can use.
  const bannerStyle = {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '5px 10px', fontSize: 'var(--rt-fs-xs)', color: 'var(--rt-t3)',
    background: 'var(--rt-fill)', border: '1.5px solid var(--rt-line)', borderRadius: 7,
    flex: '0 1 auto', minWidth: 0,
  } as const;
  // The writeable field names for the banner, derived from the catalog (legacy
  // fallback: points + sprint). Vocabulary keys show their catalog label.
  const writeableLabels = [...writeableLocal].map((key) =>
    key === 'points' ? 'Points' : key === 'sprint' ? 'Sprint' : key === 'status' ? 'Status' : (attrFields.find((f) => f.key === key)?.label ?? key),
  );
  const syncBanner = synced ? (
    <div style={bannerStyle}>
      {Icon.sync}
      <span>
        Synced — most fields refresh on sync. Writeable:{' '}
        <strong className={modalStyles.em}>{writeableLabels.join(', ')}</strong>.
      </span>
    </div>
  ) : connectorRelease ? (
    <div style={bannerStyle}>
      {Icon.sync}
      <span>Connector release — <strong className={modalStyles.em}>status</strong> editing is coming soon.</span>
    </div>
  ) : null;

  return (
    <Modal
      onClose={onClose}
      width="var(--rt-modal-w-work-item)"
      title={
        <span className={modalStyles.row}>
          <span className={`mono ${styles.keyBadge}`}>
            {it.key}
          </span>
          {it.itemType && (
            <MetaChip title="Item type (connector-assigned, read-only)">{it.itemType.label}</MetaChip>
          )}
          {it.build && (
            <MetaChip title={`Build: ${it.build}`}>
              <span className={`dot ${styles.buildMark}`} />
              {it.build}
            </MetaChip>
          )}
          {/* <span className={modalStyles.figure}>Work item</span> */}
          {isDirty && <DirtyDot size={7} />}
          {it.externalUrl && (
            <MetaChip
              accent
              href={it.externalUrl}
              title={`Open ${it.key} in ${meta?.label ?? 'the external system'} (new tab)`}
            >
              {Icon.external}
              Open in {meta?.label ?? 'external'}
            </MetaChip>
          )}
          {it.externalUrl && (
            <MetaChip
              accent
              onClick={copyLink}
              title={`Copy a link to ${it.key} (${it.key} ${it.subject})`}
              ariaLabel={`Copy a link to ${it.key}`}
            >
              {Icon.link}
              Copy link
            </MetaChip>
          )}
        </span>
      }
      footer={
        <>
          {/* Destructive, so it sits apart from Close/Save rather than beside them —
              the same placement the event and work-stream modals use. */}
          <PButton variant="danger" onClick={forget} title={forgetTitle} className={modalStyles.pushRight}>
            Forget
          </PButton>
          {syncBanner}
          <PButton variant="subtle" onClick={onClose}>
            Close
          </PButton>
          <PButton onClick={save}>Save changes</PButton>
        </>
      }
    >
      <ModalSplit
        main={
          <>
            {/* A failed push is a state the item is IN, not an event that happened —
                the edit is still queued and still the user's to resolve — so it sits
                at the top of the item it belongs to, not in a toast that has long
                since gone. Cleared automatically when a later push of this item
                succeeds. */}
            {it.lastPushError && (
              <Callout tone="warning">
                <strong>
                  {it.lastPushError.kind === 'create' ? 'Not created' : 'Not updated'} in{' '}
                  {meta?.label ?? 'the external system'}
                </strong>{' '}
                &mdash; {it.lastPushError.message}
                {it.lastPushError.fieldErrors.length > 0 && (
                  <ul className={styles.fieldErrors}>
                    {it.lastPushError.fieldErrors.map((fe, i) => (
                      <li key={`${fe.field}-${i}`} className={styles.fieldError}>
                        <strong>{fieldLabel(itype, fe.field)}</strong> &mdash; {fe.message}
                      </li>
                    ))}
                  </ul>
                )}
              </Callout>
            )}
            <PField label="Subject">
              <PInput value={subject} disabled={!canWrite('subject')} onChange={(e) => setSubject(e.target.value)} />
            </PField>
            <PField label="Description">
              {it.descriptionFormat === 'html' ? (
                <RichTextEditor value={desc} editable={canWrite('description')} onChange={setDesc} />
              ) : (
                <PTextarea
                  value={desc}
                  disabled={!canWrite('description')}
                  placeholder="No description yet — add detail, acceptance criteria, links…"
                  onChange={(e) => setDesc(e.target.value)}
                  // Taller than the create form's default: this is the field the
                  // two-column layout exists to serve, and the rail beside it is
                  // what pays for the height.
                  className={styles.editorPane}
                />
              )}
            </PField>
            {/* Timestamps are never edited here — on a synced item they belong to the
                backend, on a local one the app stamps them — so they read as a footnote,
                not as fields. Hidden entirely when neither is known (items predating the
                field; connectors that send no timestamps). */}
            {(it.createdBy || it.createdISO || it.updatedISO) && (
              <PMetaLine
                items={[
                  ...(it.createdBy ? [{ label: 'Created by', value: it.createdBy }] : []),
                  { label: 'Created', value: fmtDateTime(it.createdISO), title: it.createdISO ?? undefined },
                  { label: 'Last modified', value: fmtDateTime(it.updatedISO), title: it.updatedISO ?? undefined },
                ]}
              />
            )}
          </>
        }
        rail={
          <>
            <PField label="Work stream">
              <PSelect value={wsId ?? ''} disabled={!canWrite('workStream')} onChange={(e) => setWsId(e.target.value || null)}>
                <option value="">None (unassigned)</option>
                {r.workStreams.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </PSelect>
            </PField>
            <PField label="Sprint">
              <PSelect value={sprintId ?? ''} disabled={!canWrite('sprint')} onChange={(e) => setSprintId(e.target.value || null)}>
                <option value="">No sprint</option>
                {r.sprints.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </PSelect>
            </PField>
            <PField label="Assignee">
              <PSelect value={assignedMemberId ?? ''} disabled={!canWrite('assignee')} onChange={(e) => setAssignedMemberId(e.target.value || null)}>
                <option value="">Unassigned</option>
                {(team?.members ?? []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </PSelect>
            </PField>
            <PField label="Status">
              {vocabStatus ? (
                <PSelect value={statusNativeId} disabled={!canWrite('status')} onChange={(e) => setStatusNativeId(e.target.value)}>
                  {/* Pre-vocabulary item: show its bare category until a native state is chosen. */}
                  {!statusNativeId && <option value="">{it.status}</option>}
                  {statusVocab.map((sd) => (
                    <option key={sd.id} value={sd.id}>
                      {sd.label}
                    </option>
                  ))}
                </PSelect>
              ) : (
                <PSelect value={status} disabled={!canWrite('status')} onChange={(e) => setStatus(e.target.value as Status)}>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </PSelect>
              )}
            </PField>
            {!connectorRelease && (
              <PField label="Type">
                <PSelect value={typeLabel} onChange={(e) => setTypeLabel(e.target.value)}>
                  <option value="">None</option>
                  {LOCAL_ITEM_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </PSelect>
              </PField>
            )}
            <PField label="Points">
              <PointSeg value={points} onChange={setPoints} disabled={!canWrite('points')} />
            </PField>
            {attrFields.map((f) =>
              attrEditable(f.key) ? (
                <PField key={f.key} label={f.label ?? f.key}>
                  <FieldControl
                    field={f}
                    value={attrs[f.key] ?? null}
                    onChange={(v) => setAttrs((a) => ({ ...a, [f.key]: (v === '' ? null : v) as AttrValue }))}
                    ctx={{ workStreams: [], sprints: [], members: [] }}
                  />
                </PField>
              ) : (
                <PField key={f.key} label={f.label ?? f.key}>
                  <PInput value={displayValue(f, it.attributes?.[f.key])} disabled title="Connector field (read-only)" />
                </PField>
              ),
            )}
          </>
        }
      />
    </Modal>
  );
}
