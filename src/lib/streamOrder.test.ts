import { describe, expect, it } from 'vitest';
import { aStream } from '../test/factories';
import { compareStreams, sortStreams } from './streamOrder';

const names = (ws: ReturnType<typeof sortStreams>) => ws.map((w) => w.name);

describe('sortStreams', () => {
  it('orders by name, case-insensitively', () => {
    const streams = [
      aStream({ id: '1', name: 'webhooks' }),
      aStream({ id: '2', name: 'API Gateway' }),
      aStream({ id: '3', name: 'auth & SSO' }),
    ];
    expect(names(sortStreams(streams))).toEqual(['API Gateway', 'auth & SSO', 'webhooks']);
  });

  it('sinks muted streams below every counted one, whatever their names', () => {
    const streams = [
      aStream({ id: '1', name: 'Auth', muted: true }),
      aStream({ id: '2', name: 'Zebra' }),
      aStream({ id: '3', name: 'Billing' }),
    ];
    expect(names(sortStreams(streams))).toEqual(['Billing', 'Zebra', 'Auth']);
  });

  it('keeps muted streams alphabetical among themselves — they are still findable', () => {
    const streams = [
      aStream({ id: '1', name: 'Zed', muted: true }),
      aStream({ id: '2', name: 'Alpha', muted: true }),
      aStream({ id: '3', name: 'Real' }),
    ];
    expect(names(sortStreams(streams))).toEqual(['Real', 'Alpha', 'Zed']);
  });

  it('does not mutate the input — callers pass store state straight in', () => {
    const streams = [aStream({ id: '1', name: 'B' }), aStream({ id: '2', name: 'A' })];
    sortStreams(streams);
    expect(names(streams)).toEqual(['B', 'A']);
  });
});

describe('compareStreams', () => {
  it('is symmetric about the muted flag', () => {
    const counted = aStream({ id: '1', name: 'A' });
    const muted = aStream({ id: '2', name: 'A', muted: true });
    expect(compareStreams(counted, muted)).toBeLessThan(0);
    expect(compareStreams(muted, counted)).toBeGreaterThan(0);
  });
});
