// Create a work item on a connector-backed release. The connector's itemTypes
// catalog describes each field as data (kind/role/target + access); the create
// form shows the `creatable` fields, rendered through the shared field registry
// (the single data→control map). On submit the ref selections are resolved to
// externalIds and the item is created through the sync service.

import { useMemo, useState } from 'react';
import type { ConnectorItemType, FieldSpec } from '../sync/schema';
import { connectorCreateTypes } from '../sync/client';
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
      if (f.kind === 'number' && f.role === 'points') v[f.key] = 3;
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
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  // Field-keyed 422 errors from the service — the validation authority. Rendered
  // inline under the offending inputs, like client-side validation.
  const [serverFieldErrors, setServerFieldErrors] = useState<Record<string, string>>({});

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

  const refExternalId = (field: FieldSpec, localId: FieldValues[string]): string | null => {
    if (!localId) return null;
    const id = String(localId);
    if (field.target === 'workStream') return r.workStreams.find((w) => w.id === id)?.externalId ?? null;
    if (field.target === 'sprint') return r.sprints.find((s) => s.id === id)?.externalId ?? null;
    if (field.target === 'member') return team?.members.find((m) => m.id === id)?.externalId ?? null;
    return null;
  };

  const submit = async () => {
    if (!isValid) {
      setShowErrors(true);
      return;
    }
    setBusy(true);
    setServerError(null);
    setServerFieldErrors({});

    let extWorkStreamId: string | null = null;
    let extSprintId: string | null = null;
    let extAssigneeId: string | null = null;
    const fields: Record<string, unknown> = {};
    for (const f of createFields) {
      const v = values[f.key];
      if (f.kind === 'ref' && f.target === 'workStream') extWorkStreamId = refExternalId(f, v);
      else if (f.kind === 'ref' && f.target === 'sprint') extSprintId = refExternalId(f, v);
      else if (f.kind === 'ref' && f.target === 'member') extAssigneeId = refExternalId(f, v);
      else if (f.kind === 'number') fields[f.key] = Number(v) || 0;
      else if (v != null && v !== '') fields[f.key] = v;
    }

    const outcome = await getActions().createConnectorItem(releaseId, {
      type: selectedType.id,
      extWorkStreamId,
      extSprintId,
      extAssigneeId,
      fields,
    });
    setBusy(false);
    if (outcome.ok) {
      notify(`Created ${outcome.item.key}`);
      onClose();
    } else {
      const byField = Object.fromEntries((outcome.fieldErrors ?? []).map((fe) => [fe.field, fe.message]));
      setServerFieldErrors(byField);
      // Keep the footer summary only when there's nothing to pin to a field.
      setServerError(Object.keys(byField).length > 0 ? null : outcome.message);
    }
  };

  const ctx = { workStreams: r.workStreams, sprints: r.sprints, members: team?.members ?? [] };

  return (
    <Modal
      title="New work item"
      icon={Icon.item}
      onClose={onClose}
      width="var(--rt-modal-w-work-item)"
      footer={
        <>
          {serverError && (
            <span style={{ marginRight: 'auto', fontSize: 'var(--rt-fs-sm)', color: 'var(--rt-st-bl-text)' }}>
              {serverError}
            </span>
          )}
          <PButton variant="subtle" onClick={onClose}>
            Cancel
          </PButton>
          <PButton onClick={submit} disabled={busy || (showErrors && !isValid)}>
            {busy ? 'Creating…' : 'Create work item'}
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
        const fieldError = (showErrors && errors[f.key]) || serverFieldErrors[f.key];
        return (
          <PField key={f.key} label={f.label ?? f.key} hint={f.required ? undefined : 'optional'}>
            <FieldControl
              field={f}
              value={values[f.key]}
              onChange={(v) => {
                set(f.key, v);
                // Editing a field clears its server verdict (it'll be re-checked on submit).
                if (serverFieldErrors[f.key]) setServerFieldErrors(({ [f.key]: _, ...rest }) => rest);
              }}
              ctx={ctx}
            />
            {fieldError && (
              <span style={{ fontSize: 'var(--rt-fs-xs)', color: 'var(--rt-st-bl-text)', marginTop: 2 }}>{fieldError}</span>
            )}
          </PField>
        );
      })}
    </Modal>
  );
}
