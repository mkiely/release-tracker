// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createKeyedPrefs, createPersistedStore, oneOf } from './persisted';
import { AxisModeStore } from './axisMode';
import { SprintGroupByStore } from './sprintGroupBy';
import { TextScaleStore } from './textScale';
import { ThemeStore } from './theme';
import { ViewModeStore } from './viewMode';

describe('createPersistedStore', () => {
  beforeEach(() => localStorage.clear());

  it('starts at the initial value when nothing is stored', () => {
    const s = createPersistedStore({ key: 'k', initial: 'a', parse: oneOf(['a', 'b']) });
    expect(s.get()).toBe('a');
  });

  it('adopts a valid stored value at construction', () => {
    localStorage.setItem('k', 'b');
    const s = createPersistedStore({ key: 'k', initial: 'a', parse: oneOf(['a', 'b']) });
    expect(s.get()).toBe('b');
  });

  it('rejects a stored value the parser does not recognize', () => {
    // A key left behind by an older build must not resurrect a value this
    // version no longer understands.
    localStorage.setItem('k', 'legacy-mode');
    const s = createPersistedStore({ key: 'k', initial: 'a', parse: oneOf(['a', 'b']) });
    expect(s.get()).toBe('a');
  });

  it('persists on set', () => {
    const s = createPersistedStore({ key: 'k', initial: 'a', parse: oneOf(['a', 'b']) });
    s.set('b');
    expect(s.get()).toBe('b');
    expect(localStorage.getItem('k')).toBe('b');
  });

  it('honours a custom serializer in both directions', () => {
    const make = () =>
      createPersistedStore<boolean>({
        key: 'flag',
        initial: false,
        parse: (raw) => (raw === 'on' ? true : raw === 'off' ? false : undefined),
        serialize: (v) => (v ? 'on' : 'off'),
      });
    make().set(true);
    expect(localStorage.getItem('flag')).toBe('on');
    expect(make().get()).toBe(true);
  });

  it('notifies subscribers until they unsubscribe', () => {
    const s = createPersistedStore({ key: 'k', initial: 'a', parse: oneOf(['a', 'b']) });
    let hits = 0;
    const unsub = s.sub(() => { hits += 1; });
    s.set('b');
    s.set('a');
    unsub();
    s.set('b');
    expect(hits).toBe(2);
  });

  it('runs apply at construction and on every change', () => {
    localStorage.setItem('k', 'b');
    const apply = vi.fn();
    const s = createPersistedStore({ key: 'k', initial: 'a', parse: oneOf(['a', 'b']), apply });
    // Applied with the value actually adopted from storage, not the initial.
    expect(apply).toHaveBeenCalledWith('b');
    s.set('a');
    expect(apply).toHaveBeenLastCalledWith('a');
    expect(apply).toHaveBeenCalledTimes(2);
  });

  it('survives localStorage throwing (private mode, embedded webviews)', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const s = createPersistedStore({ key: 'k', initial: 'a', parse: oneOf(['a', 'b']) });
    expect(s.get()).toBe('a');
    // The value still applies for the session; only persistence is lost.
    expect(() => s.set('b')).not.toThrow();
    expect(s.get()).toBe('b');
    getItem.mockRestore();
    setItem.mockRestore();
  });

  it('exposes set as a standalone binding (call sites pass it to onChange)', () => {
    const s = createPersistedStore({ key: 'k', initial: 'a', parse: oneOf(['a', 'b']) });
    const { set } = s;
    set('b');
    expect(s.get()).toBe('b');
  });
});

describe('createKeyedPrefs', () => {
  beforeEach(() => localStorage.clear());

  it('returns undefined for an unknown scope', () => {
    expect(createKeyedPrefs<string>('p').get('nope')).toBeUndefined();
  });

  it('round-trips a value and keeps scopes isolated', () => {
    const p = createKeyedPrefs<string>('p');
    p.set('rel_a', 'x');
    expect(p.get('rel_a')).toBe('x');
    expect(p.get('rel_b')).toBeUndefined();
  });

  it('removes the entry when set to undefined', () => {
    const p = createKeyedPrefs<string>('p');
    p.set('rel_a', 'x');
    p.set('rel_a', undefined);
    expect(p.get('rel_a')).toBeUndefined();
    expect(localStorage.getItem('p')).toBe('{}');
  });

  it('treats unparseable stored JSON as empty rather than throwing', () => {
    localStorage.setItem('p', 'not json');
    const p = createKeyedPrefs<string>('p');
    expect(p.get('rel_a')).toBeUndefined();
    expect(() => p.set('rel_a', 'x')).not.toThrow();
  });
});

// Six preference modules now share one factory, so the risk that used to live in
// each hand-rolled copy (a wrong default) is replaced by a new one: two modules
// declaring the same storage key, which would make them silently overwrite each
// other. This asserts each is wired to its own key with the intended default.
describe('preference wiring', () => {
  const stores = [
    { name: 'theme', store: ThemeStore, key: 'release-tracker:theme', initial: 'light', other: 'dark' },
    { name: 'viewMode', store: ViewModeStore, key: 'release-tracker:viewMode', initial: 'cards', other: 'table' },
    { name: 'axisMode', store: AxisModeStore, key: 'release-tracker:axisMode', initial: 'sprint', other: 'stream' },
    { name: 'sprintGroupBy', store: SprintGroupByStore, key: 'release-tracker:sprintGroupBy', initial: 'stream', other: 'status' },
    { name: 'textScale', store: TextScaleStore, key: 'release-tracker:textScale', initial: 'md', other: 'lg' },
  ] as const;

  it('gives every preference a distinct storage key', () => {
    const keys = stores.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it.each(stores)('$name writes to $key and restores its default', ({ store, key, initial, other }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = store as any;
    s.set(other);
    expect(localStorage.getItem(key)).toBe(other);
    s.set(initial);
    expect(s.get()).toBe(initial);
  });
});
