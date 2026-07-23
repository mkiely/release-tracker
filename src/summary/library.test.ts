// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { SnapshotPayload } from '../lib/releaseSnapshot';
import { LIBRARY_KEY, forgetSummary, getSummary, listSummaries, rememberSummary } from './library';

const snap = (id: string, generatedAtISO: string, name = id): SnapshotPayload =>
  ({
    v: 1,
    summaryId: id,
    generatedAtISO,
    name,
    teamName: null,
    dateRange: '',
    connectorLabel: null,
    overall: {
      totalItems: 0,
      totalPts: 0,
      donePts: 0,
      completionPct: 0,
      teamVelocity: 0,
      contributingCount: 0,
      engineersRequiredTotal: 0,
      overAllocated: false,
      runwayAlarmCount: 0,
    },
    velocity: { verdict: 'none', totalPlanned: 0, totalActual: 0, attainmentPct: null, series: [] },
    sprints: [],
    streams: [],
  }) satisfies SnapshotPayload;

describe('summary library', () => {
  beforeEach(() => localStorage.clear());

  it('remembers a snapshot and reads it back', () => {
    rememberSummary(snap('rel_a', '2026-04-20T00:00:00.000Z'));
    expect(getSummary('rel_a')!.summaryId).toBe('rel_a');
    expect(listSummaries()).toHaveLength(1);
  });

  it('replaces an existing summary in place when the incoming one is fresher', () => {
    rememberSummary(snap('rel_a', '2026-04-20T00:00:00.000Z', 'old'));
    const stored = rememberSummary(snap('rel_a', '2026-04-25T00:00:00.000Z', 'new'));
    expect(stored.name).toBe('new');
    expect(listSummaries()).toHaveLength(1); // updated in place, not duplicated
    expect(getSummary('rel_a')!.name).toBe('new');
  });

  it('keeps the existing summary when the incoming one is older, and returns it', () => {
    rememberSummary(snap('rel_a', '2026-04-25T00:00:00.000Z', 'newer'));
    const stored = rememberSummary(snap('rel_a', '2026-04-20T00:00:00.000Z', 'stale'));
    expect(stored.name).toBe('newer'); // stale link still renders the best data we have
    expect(getSummary('rel_a')!.name).toBe('newer');
  });

  it('lists summaries newest-first across releases', () => {
    rememberSummary(snap('rel_a', '2026-04-20T00:00:00.000Z'));
    rememberSummary(snap('rel_b', '2026-05-01T00:00:00.000Z'));
    rememberSummary(snap('rel_c', '2026-03-10T00:00:00.000Z'));
    expect(listSummaries().map((s) => s.summaryId)).toEqual(['rel_b', 'rel_a', 'rel_c']);
  });

  it('forgets a summary', () => {
    rememberSummary(snap('rel_a', '2026-04-20T00:00:00.000Z'));
    forgetSummary('rel_a');
    expect(getSummary('rel_a')).toBeNull();
    expect(listSummaries()).toHaveLength(0);
  });

  it('tolerates a corrupt library blob', () => {
    localStorage.setItem(LIBRARY_KEY, '{not json');
    expect(listSummaries()).toEqual([]);
    rememberSummary(snap('rel_a', '2026-04-20T00:00:00.000Z'));
    expect(getSummary('rel_a')).not.toBeNull();
  });
});
