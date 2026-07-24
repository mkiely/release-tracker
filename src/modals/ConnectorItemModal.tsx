// Create a work item on a connector-backed release. The connector's itemTypes
// catalog describes each field as data (kind/role/target + access); the create
// form shows the `creatable` fields, rendered through the shared field registry
// (the single data→control map). On submit the ref selections are resolved to
// externalIds and the item is created through the sync service.

import { useMemo, useState } from 'react';
import type { AttrValue, Status } from '../types';
import type { ConnectorItemType, FieldSpec } from '../sync/schema';
import { connectorCreateTypes, connectorLabel } from '../sync/client';
import { validateFields, type FieldValues } from '../lib/createFields';
import { getActions, selRelease, selTeam, useStore } from '../store/store';
import { useApp } from '../app-context';
import { useConnectorMeta } from '../hooks/useConnectorMeta';
import { Icon } from '../components/Icon';
import { FieldControl } from '../components/fields/registry';
import { Modal, PButton, PField, PSelect } from '../components/primitives';

export function ConnectorItemModal({
  releaseId,
  presetStreamId,
  presetSprintId,
  onClose,
}: {
  releaseId: string;
  presetStreamId?: string;
  presetSprintId?: string;
  onClose: () => void;
}) {
  const r = useStore((s) => selRelease(s, releaseId));
  const team = useStore((s) => (r ? selTeam(s, r.teamId) : undefined));
  const meta = useConnectorMeta(r?.connector?.type);
  const { notify } = useApp();

  const types = connectorCreateTypes(meta);
  const [typeId, setTypeId] = useState<string>('');
  const selectedType: ConnectorItemType | undefined = types.find((t) => t.id === typeId) ?? types[0];

  // The creatable fields of the selected type, in declared order.
  const createFields = useMemo<FieldSpec[]>(
    () => (selectedType?.fields ?? []).filter((f) => f.creatable),
    [selectedType],
  );

  // Initial values for the create fields (re-derived when the type changes).
  const initialValues = useMemo<FieldValues>(() => {
    const v: FieldValues = {};
    if (!r) return v;
    for (const f of createFields) {
      if (f.kind === 'number' && f.role === 'points') v[f.key] = null;
      else if (f.kind === 'enum' && f.enumRef === 'status') v[f.key] = 'Not Started';
      else if (f.kind === 'ref' && f.target === 'workStream') v[f.key] = presetStreamId ?? (f.required ? (r.workStreams[0]?.id ?? '') : '');
      else if (f.kind === 'ref' && f.target === 'sprint') v[f.key] = presetSprintId ?? '';
      else v[f.key] = '';
    }
    return v;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedType?.id, r?.id]);

  const [values, setValues] = useState<FieldValues>(initialValues);
  const [valuesForType, setValuesForType] = useState(selectedType?.id);
  if (selectedType && valuesForType !== selectedType.id) {
    setValuesForType(selectedType.id);
    setValues(initialValues);
  }

  const [showErrors, setShowErrors] = useState(false);

  if (!r) {
    return (
      <Modal title="New work item" icon={Icon.item} onClose={onClose} width={520}>
        <span style={{ color: 'var(--rt-t3)' }}>This release no longer exists.</span>
      </Modal>
    );
  }

  if (!selectedType) {
    return (
      <Modal title="New work item" icon={Icon.item} onClose={onClose} width={520}>
        <span style={{ color: 'var(--rt-t3)' }}>
          {meta ? 'This connector does not support creating work items.' : 'Loading connector…'}
        </span>
      </Modal>
    );
  }

  const errors = validateFields(createFields, values);
  const isValid = Object.keys(errors).length === 0;
  const set = (key: string, v: FieldValues[string]) => setValues((prev) => ({ ...prev, [key]: v }));

  // The item isn't sent now — it's queued. Map the form's LOCAL selections + values
  // into a draft; external ids and the wire payload are derived at push time from the
  // (possibly edited) item, so this stays free of external-id resolution.
  const localId = (v: FieldValues[string]): string | null => (v == null || v === '' ? null : String(v));

  const submit = () => {
    if (!isValid) {
      setShowErrors(true);
      return;
    }

    let workStreamId: string | null = null;
    let sprintId: string | null = null;
    let assignedMemberId: string | null = null;
    let subject = '';
    let description = '';
    let points: number | null = null;
    let status: Status = 'Not Started';
    let descriptionFormat: 'text' | 'html' = 'text';
    const attributes: Record<string, AttrValue> = {};

    for (const f of createFields) {
      const v = values[f.key];
      if (f.kind === 'ref' && f.target === 'workStream') workStreamId = localId(v);
      else if (f.kind === 'ref' && f.target === 'sprint') sprintId = localId(v);
      else if (f.kind === 'ref' && f.target === 'member') assignedMemberId = localId(v);
      else if (f.role === 'subject') subject = v == null ? '' : String(v);
      else if (f.role === 'description') {
        description = v == null ? '' : String(v);
        descriptionFormat = f.format === 'html' ? 'html' : 'text';
      } else if (f.role === 'points') points = v == null || v === '' ? null : Number(v);
      else if (f.role === 'status' || f.enumRef === 'status') status = (v as Status) ?? 'Not Started';
      else if (v != null && v !== '') attributes[f.key] = v as AttrValue;
    }

    const item = getActions().createConnectorItem(releaseId, {
      itemType: { id: selectedType.id, label: selectedType.label },
      workStreamId,
      sprintId,
      assignedMemberId,
      subject,
      description,
      descriptionFormat,
      status,
      points,
      attributes,
    });
    if (item) notify('Queued for push — send it with Push');
    onClose();
  };

  const ctx = { workStreams: r.workStreams, sprints: r.sprints, members: team?.members ?? [] };
  const connectorName = r.connector ? connectorLabel(r.connector.type) : 'the external system';

  return (
    <Modal
      title="New work item"
      icon={Icon.item}
      onClose={onClose}
      width="var(--rt-modal-w-work-item)"
      footer={
        <>
          <span style={{ marginRight: 'auto', fontSize: 'var(--rt-fs-xs)', color: 'var(--rt-t3)' }}>
            Added to the push queue — created in {connectorName} on the next Push.
          </span>
          <PButton variant="subtle" onClick={onClose}>
            Cancel
          </PButton>
          <PButton onClick={submit} disabled={showErrors && !isValid}>
            Add to push queue
          </PButton>
        </>
      }
    >
      {types.length > 1 && (
        <PField label="Type">
          <PSelect value={selectedType.id} onChange={(e) => setTypeId(e.target.value)}>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </PSelect>
        </PField>
      )}

      {createFields.map((f) => {
        const fieldError = showErrors ? errors[f.key] : undefined;
        return (
          <PField key={f.key} label={f.label ?? f.key} hint={f.required ? undefined : 'optional'}>
            <FieldControl field={f} value={values[f.key]} onChange={(v) => set(f.key, v)} ctx={ctx} />
            {fieldError && (
              <span style={{ fontSize: 'var(--rt-fs-xs)', color: 'var(--rt-st-bl-text)', marginTop: 2 }}>{fieldError}</span>
            )}
          </PField>
        );
      })}
    </Modal>
  );
}
