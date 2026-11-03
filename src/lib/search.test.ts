import { describe, expect, it } from 'vitest';
import { matchesQuery } from './search';
import { anItem } from '../test/factories';

describe('matchesQuery', () => {
  const item = anItem({ key: 'ACME-142', subject: 'Fix Login redirect', description: 'mentions checkout' });

  it('matches everything when the query is blank', () => {
    expect(matchesQuery(item, '')).toBe(true);
    expect(matchesQuery(item, '   ')).toBe(true);
  });

  it('matches the key and the title, ignoring case', () => {
    expect(matchesQuery(item, 'acme-1')).toBe(true);
    expect(matchesQuery(item, 'LOGIN')).toBe(true);
  });

  it('matches a substring anywhere in the field', () => {
    expect(matchesQuery(item, '142')).toBe(true);
    expect(matchesQuery(item, 'redir')).toBe(true);
  });

  it('does not look at the description', () => {
    expect(matchesQuery(item, 'checkout')).toBe(false);
  });
});
