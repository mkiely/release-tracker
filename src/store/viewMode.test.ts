// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The stores read localStorage once at module load, so each case seeds storage
// first and then imports a fresh copy.
async function load(seed: Record<string, string> = {}) {
  localStorage.clear();
  for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v);
  vi.resetModules();
  return import('./viewMode');
}

describe('per-screen view mode', () => {
  beforeEach(() => localStorage.clear());

  it('falls back to the old global density for a screen with no choice', async () => {
    const m = await load({ 'release-tracker:viewMode': 'table' });
    expect(m.ScreenViewModeStore.get().sprint ?? m.ViewModeStore.get()).toBe('table');
  });

  it('remembers each screen separately and across reloads', async () => {
    let m = await load();
    m.setViewMode('sprint', 'cards');
    m.setViewMode('release', 'table');
    const saved = localStorage.getItem('release-tracker:viewModes')!;
    m = await load({ 'release-tracker:viewModes': saved });
    expect(m.ScreenViewModeStore.get()).toEqual({ sprint: 'cards', release: 'table' });
  });

  it('ignores a corrupt or unknown stored value', async () => {
    const m = await load({ 'release-tracker:viewModes': '{"sprint":"grid","stream":"table","x":1}' });
    expect(m.ScreenViewModeStore.get()).toEqual({ stream: 'table' });
  });
});
