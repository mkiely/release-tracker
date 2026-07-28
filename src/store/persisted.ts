// Factories for the app's small, persistent UI preferences — the settings that
// live outside the domain store (theme, view mode, text size, …) because they
// describe how the app is being *looked at*, not what it holds.
//
// These were six near-identical hand-rolled modules: a module-level `current`, a
// Set of listeners, a try/catch localStorage read, a {get,set,sub} object and a
// useSyncExternalStore hook — the same 29 lines with the identifiers changed.
// Two more (facet selections, export scope) repeated a second shape: JSON keyed
// by an owning entity id.
//
// Both patterns live here now. A preference module declares its key, its default
// and how to parse a stored string; anything genuinely its own (applying a value
// to <html>, degrading a stale choice) stays with that module.
//
// localStorage access is always guarded: it throws in private-mode Safari and
// under some embedded webviews, and a preference failing to persist must never
// take the app down with it.

import { useSyncExternalStore } from 'react';

/** A persisted single-value preference. `use()` is the React binding. */
export interface PersistedStore<T> {
  get(): T;
  set(v: T): void;
  /** Subscribe to changes; returns an unsubscribe. */
  sub(listener: () => void): () => void;
  /** React hook — re-renders the caller when the value changes. */
  use(): T;
}

export interface PersistedStoreOptions<T> {
  /** localStorage key. Conventionally `release-tracker:<name>`. */
  key: string;
  /** Value used when nothing is stored, or when the stored value doesn't parse. */
  initial: T;
  /**
   * Turn a raw stored string into a value, or return undefined to reject it and
   * fall back to `initial`. Rejecting is the important half: a key left behind by
   * an older build must not resurrect a value the app no longer understands.
   */
  parse(raw: string): T | undefined;
  /** Serialize for storage. Defaults to String(v), which suits the string unions. */
  serialize?(v: T): string;
  /**
   * Side effect run with the current value at module load and on every change —
   * for preferences that must be reflected onto the document (a `data-` attribute,
   * a CSS custom property). Runs before listeners are notified.
   */
  apply?(v: T): void;
}

/**
 * Create a persisted preference backed by localStorage and readable from React
 * via `useSyncExternalStore`.
 *
 * The value is read once at module load — these are settings, not data, so a
 * second tab writing the same key mid-session is not a case worth syncing.
 */
export function createPersistedStore<T>({
  key,
  initial,
  parse,
  serialize = (v) => String(v),
  apply,
}: PersistedStoreOptions<T>): PersistedStore<T> {
  const listeners = new Set<() => void>();
  let current = initial;

  try {
    const raw = localStorage.getItem(key);
    if (raw != null) {
      const parsed = parse(raw);
      if (parsed !== undefined) current = parsed;
    }
  } catch {
    /* storage unavailable — fall back to the default */
  }

  apply?.(current);

  const get = () => current;

  const set = (v: T) => {
    current = v;
    apply?.(v);
    try {
      localStorage.setItem(key, serialize(v));
    } catch {
      /* storage unavailable — the value still applies for this session */
    }
    listeners.forEach((l) => l());
  };

  // Standalone bindings rather than methods, so a destructured `set`/`use` still
  // works — several call sites pass `Store.set` straight to an onChange.
  const sub = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  // Same fn for getSnapshot and getServerSnapshot: `current` is a module-level
  // primitive, so it's referentially stable between changes and safe for both.
  const use = () => useSyncExternalStore(sub, get, get);

  return { get, set, sub, use };
}

/**
 * `parse` for a preference whose values are a fixed set of strings — the common
 * case (theme ids, 'cards' | 'table', …). Anything outside the set is rejected,
 * so a stale or hand-edited key falls back to the default.
 */
export function oneOf<T extends string>(values: readonly T[]): (raw: string) => T | undefined {
  const valid = new Set<string>(values);
  return (raw) => (valid.has(raw) ? (raw as T) : undefined);
}

// ── Keyed preferences ──────────────────────────────────────────────────────

/**
 * A preference stored per owning entity (per release, per view) rather than
 * globally, as a single JSON object keyed by that entity's id.
 *
 * Deliberately not reactive: these are read during render from the hook that
 * owns the screen, and written from an event handler that nudges its own state.
 * Adding a subscription would buy nothing and cost a re-render of every screen.
 */
export interface KeyedPrefs<T> {
  /** The stored value for `scope`, or undefined when nothing is stored. */
  get(scope: string): T | undefined;
  /** Store a value for `scope`. Passing undefined removes the entry. */
  set(scope: string, value: T | undefined): void;
}

/**
 * Create a per-entity preference store. `T` is whatever that scope holds — a
 * single value (export scope) or a record (facet selections).
 *
 * Entries are removed rather than written when the caller passes undefined, so
 * the stored object doesn't accumulate one key per release the user ever opened.
 */
export function createKeyedPrefs<T>(key: string): KeyedPrefs<T> {
  type Shape = Record<string, T>;

  const load = (): Shape => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as Shape) : {};
    } catch {
      return {};
    }
  };

  const save = (s: Shape) => {
    try {
      localStorage.setItem(key, JSON.stringify(s));
    } catch {
      /* storage unavailable — preference just doesn't persist */
    }
  };

  return {
    get(scope) {
      return load()[scope];
    },
    set(scope, value) {
      const s = load();
      if (value === undefined) delete s[scope];
      else s[scope] = value;
      save(s);
    },
  };
}
