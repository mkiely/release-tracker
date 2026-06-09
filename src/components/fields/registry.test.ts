import { describe, expect, it } from 'vitest';
import { displayValue, resolveControl } from './registry';
import type { FieldSpec } from '../../sync/schema';

const f = (over: Partial<FieldSpec> & Pick<FieldSpec, 'key' | 'kind'>): FieldSpec => ({ label: over.key, ...over });

describe('resolveControl', () => {
  it('maps refs to their bound select by target', () => {
    expect(resolveControl(f({ key: 'a', kind: 'ref', target: 'workStream' }))).toBe('streamSelect');
    expect(resolveControl(f({ key: 'a', kind: 'ref', target: 'sprint' }))).toBe('sprintSelect');
    expect(resolveControl(f({ key: 'a', kind: 'ref', target: 'member' }))).toBe('memberSelect');
  });

  it('maps enums by enumRef vs connector options', () => {
    expect(resolveControl(f({ key: 'a', kind: 'enum', enumRef: 'status' }))).toBe('statusSelect');
    expect(resolveControl(f({ key: 'a', kind: 'enum', options: [] }))).toBe('enumSelect');
  });

  it('maps number to points only when role=points', () => {
    expect(resolveControl(f({ key: 'a', kind: 'number', role: 'points' }))).toBe('points');
    expect(resolveControl(f({ key: 'a', kind: 'number' }))).toBe('number');
  });

  it('maps string variants by hints', () => {
    expect(resolveControl(f({ key: 'a', kind: 'string' }))).toBe('text');
    expect(resolveControl(f({ key: 'a', kind: 'string', multiline: true }))).toBe('textarea');
    expect(resolveControl(f({ key: 'a', kind: 'string', sensitive: true }))).toBe('password');
  });

  it('maps boolean and date', () => {
    expect(resolveControl(f({ key: 'a', kind: 'boolean' }))).toBe('checkbox');
    expect(resolveControl(f({ key: 'a', kind: 'date' }))).toBe('date');
  });
});

describe('displayValue', () => {
  it('renders an em dash for absent/empty values', () => {
    expect(displayValue(f({ key: 'a', kind: 'string' }), null)).toBe('—');
    expect(displayValue(f({ key: 'a', kind: 'string' }), undefined)).toBe('—');
    expect(displayValue(f({ key: 'a', kind: 'string' }), '')).toBe('—');
  });

  it('resolves enum values to their option label, falling back to the raw value', () => {
    const sev = f({ key: 'severity', kind: 'enum', options: [{ value: 'high', label: 'High' }] });
    expect(displayValue(sev, 'high')).toBe('High');
    expect(displayValue(sev, 'unknown')).toBe('unknown');
  });

  it('renders booleans as Yes/No and scalars as strings', () => {
    expect(displayValue(f({ key: 'a', kind: 'boolean' }), true)).toBe('Yes');
    expect(displayValue(f({ key: 'a', kind: 'boolean' }), false)).toBe('No');
    expect(displayValue(f({ key: 'a', kind: 'number' }), 5)).toBe('5');
    expect(displayValue(f({ key: 'a', kind: 'string' }), 'x')).toBe('x');
  });
});
