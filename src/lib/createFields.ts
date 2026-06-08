// Pure validation for connector item forms, driven by each field's DATA kind +
// constraints (never its control). Shared by the modal and unit tests.

import { STATUSES, type Status } from '../types';
import type { FieldSpec } from '../sync/schema';

export type FieldValue = string | number | boolean | null | undefined;
export type FieldValues = Record<string, FieldValue>;

/**
 * Validate field values against their specs. Returns a map of field key → error
 * message for invalid fields only (empty map = valid). Required-but-empty is
 * checked first; kind/constraint checks run only on non-empty values.
 */
export function validateFields(specs: FieldSpec[], values: FieldValues): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of specs) {
    const raw = values[f.key];
    const empty = raw == null || raw === '';
    if (f.required && empty) {
      errors[f.key] = `${f.label ?? f.key} is required`;
      continue;
    }
    if (empty) continue;

    const label = f.label ?? f.key;
    switch (f.kind) {
      case 'number': {
        const n = Number(raw);
        if (!Number.isFinite(n)) errors[f.key] = `${label} must be a number`;
        else if (f.min != null && n < f.min) errors[f.key] = `${label} must be ≥ ${f.min}`;
        else if (f.max != null && n > f.max) errors[f.key] = `${label} must be ≤ ${f.max}`;
        break;
      }
      case 'enum': {
        if (f.enumRef === 'status') {
          if (!STATUSES.includes(raw as Status)) errors[f.key] = `Choose a valid ${label}`;
        } else if (!(f.options ?? []).some((o) => o.value === String(raw))) {
          errors[f.key] = `Choose a valid ${label}`;
        }
        break;
      }
      case 'string': {
        const s = String(raw);
        if (f.maxLength != null && s.length > f.maxLength) errors[f.key] = `${label} is too long`;
        else if (f.pattern && !new RegExp(f.pattern).test(s)) errors[f.key] = `${label} is invalid`;
        break;
      }
      // date / boolean / ref: the required check above suffices
    }
  }
  return errors;
}
