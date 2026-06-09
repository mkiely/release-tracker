// Field presentation registry — the ONE place a connector field's DATA description
// (kind / role / target / hints) is mapped to a UI control. The contract never
// names a control; this module owns that decision so swapping a control, or adding
// a new render surface, touches only here. Keep it free of data/validation logic.

import type { ReactNode } from 'react';
import type { FieldSpec } from '../../sync/schema';
import { STATUSES } from '../../types';
import { PInput, PSelect, PTextarea, PointSeg } from '../primitives';
import type { FieldValue } from '../../lib/createFields';

export type ControlKind =
  | 'text'
  | 'textarea'
  | 'password'
  | 'number'
  | 'points'
  | 'date'
  | 'checkbox'
  | 'statusSelect'
  | 'enumSelect'
  | 'streamSelect'
  | 'sprintSelect'
  | 'memberSelect';

/** Pure: choose the control for a field from its data semantics. Unit-testable. */
export function resolveControl(field: FieldSpec): ControlKind {
  switch (field.kind) {
    case 'ref':
      return field.target === 'sprint' ? 'sprintSelect' : field.target === 'member' ? 'memberSelect' : 'streamSelect';
    case 'enum':
      return field.enumRef === 'status' ? 'statusSelect' : 'enumSelect';
    case 'number':
      return field.role === 'points' ? 'points' : 'number';
    case 'boolean':
      return 'checkbox';
    case 'date':
      return 'date';
    default: // string
      return field.sensitive ? 'password' : field.multiline ? 'textarea' : 'text';
  }
}

/** Pure: format a field's stored value for read-only display. Owns the same
 *  data→presentation decision as resolveControl, for the display direction:
 *  enum values render their option label, booleans render Yes/No, and an
 *  absent/empty value renders an em dash. */
export function displayValue(field: FieldSpec, value: unknown): string {
  if (value == null || value === '') return '—';
  if (field.kind === 'boolean') return value === true || value === 'true' ? 'Yes' : 'No';
  if (field.kind === 'enum') {
    const opt = (field.options ?? []).find((o) => o.value === String(value));
    return opt?.label ?? String(value);
  }
  return String(value);
}

export interface FieldControlCtx {
  workStreams: { id: string; name: string }[];
  sprints: { id: string; name: string }[];
  members: { id: string; name: string }[];
}

/** Render the control for a field. The single render switch for connector fields. */
export function FieldControl({
  field,
  value,
  onChange,
  ctx,
}: {
  field: FieldSpec;
  value: FieldValue;
  onChange: (v: FieldValue) => void;
  ctx: FieldControlCtx;
}): ReactNode {
  const str = value == null ? '' : String(value);
  const control = resolveControl(field);

  switch (control) {
    case 'textarea':
      return <PTextarea value={str} placeholder={field.hint} onChange={(e) => onChange(e.target.value)} />;
    case 'password':
      return <PInput type="password" value={str} placeholder={field.hint} onChange={(e) => onChange(e.target.value)} />;
    case 'number':
      return (
        <PInput
          type="number"
          value={str}
          min={field.min}
          max={field.max}
          step={field.step}
          placeholder={field.hint}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'points':
      return <PointSeg value={Number(value) || 0} onChange={(n) => onChange(n)} />;
    case 'date':
      return <PInput type="date" value={str} min={field.min} max={field.max} onChange={(e) => onChange(e.target.value)} />;
    case 'checkbox':
      return (
        <input type="checkbox" checked={value === true || value === 'true'} onChange={(e) => onChange(e.target.checked)} />
      );
    case 'statusSelect':
      return (
        <PSelect value={str} onChange={(e) => onChange(e.target.value)}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </PSelect>
      );
    case 'enumSelect':
      return (
        <PSelect value={str} onChange={(e) => onChange(e.target.value)}>
          {!field.required && <option value="">None</option>}
          {(field.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </PSelect>
      );
    case 'streamSelect':
      return (
        <PSelect value={str} onChange={(e) => onChange(e.target.value)}>
          {!field.required && <option value="">None (unassigned)</option>}
          {ctx.workStreams.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </PSelect>
      );
    case 'sprintSelect':
      return (
        <PSelect value={str} onChange={(e) => onChange(e.target.value)}>
          <option value="">Backlog</option>
          {ctx.sprints.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </PSelect>
      );
    case 'memberSelect':
      return (
        <PSelect value={str} onChange={(e) => onChange(e.target.value)}>
          <option value="">Unassigned</option>
          {ctx.members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </PSelect>
      );
    default: // text
      return <PInput value={str} placeholder={field.hint} onChange={(e) => onChange(e.target.value)} />;
  }
}
