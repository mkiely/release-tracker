import { describe, expect, it } from 'vitest';
import { validateFields } from './createFields';
import type { FieldSpec } from '../sync/schema';

const f = (over: Partial<FieldSpec> & Pick<FieldSpec, 'key' | 'kind'>): FieldSpec => ({
  label: over.key,
  ...over,
});

describe('validateFields', () => {
  it('flags required-but-empty fields', () => {
    const specs = [f({ key: 'subject', kind: 'string', required: true })];
    expect(validateFields(specs, { subject: '' })).toHaveProperty('subject');
    expect(validateFields(specs, { subject: 'Hi' })).toEqual({});
  });

  it('ignores empty optional fields', () => {
    const specs = [f({ key: 'desc', kind: 'string', multiline: true })];
    expect(validateFields(specs, { desc: '' })).toEqual({});
    expect(validateFields(specs, {})).toEqual({});
  });

  it('validates numbers and ranges', () => {
    const specs = [f({ key: 'n', kind: 'number', min: 1, max: 10 })];
    expect(validateFields(specs, { n: 'abc' })).toHaveProperty('n');
    expect(validateFields(specs, { n: 0 })).toHaveProperty('n');
    expect(validateFields(specs, { n: 11 })).toHaveProperty('n');
    expect(validateFields(specs, { n: 5 })).toEqual({});
  });

  it('validates connector-defined enums against their options', () => {
    const specs = [
      f({ key: 'sev', kind: 'enum', required: true, options: [{ value: 'low', label: 'Low' }, { value: 'high', label: 'High' }] }),
    ];
    expect(validateFields(specs, { sev: 'nope' })).toHaveProperty('sev');
    expect(validateFields(specs, { sev: 'high' })).toEqual({});
  });

  it('validates status enums against the canonical set', () => {
    const specs = [f({ key: 'st', kind: 'enum', enumRef: 'status' })];
    expect(validateFields(specs, { st: 'Bogus' })).toHaveProperty('st');
    expect(validateFields(specs, { st: 'In Progress' })).toEqual({});
  });

  it('enforces string maxLength and pattern', () => {
    expect(validateFields([f({ key: 't', kind: 'string', maxLength: 3 })], { t: 'abcd' })).toHaveProperty('t');
    expect(validateFields([f({ key: 't', kind: 'string', pattern: '^[A-Z]+$' })], { t: 'abc' })).toHaveProperty('t');
    expect(validateFields([f({ key: 't', kind: 'string', pattern: '^[A-Z]+$' })], { t: 'ABC' })).toEqual({});
  });

  it('treats ref/number fields by required only (no kind-specific check)', () => {
    const specs = [
      f({ key: 'workStream', kind: 'ref', target: 'workStream', required: true }),
      f({ key: 'sprint', kind: 'ref', target: 'sprint' }),
      f({ key: 'points', kind: 'number', role: 'points' }),
    ];
    expect(validateFields(specs, { workStream: '', sprint: '', points: 3 })).toHaveProperty('workStream');
    expect(validateFields(specs, { workStream: 'ws1', sprint: '', points: 3 })).toEqual({});
  });
});
