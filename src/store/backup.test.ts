// @vitest-environment jsdom
//
// The backup controller against an in-memory stand-in for work-truck. Each test is
// one scenario from docs/backup.md; the three-way reconcile table is covered row by row.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BackupMeta } from '@release-tracker/sync-contract';
import { BackupUnavailableError, type BackupClient, type PutResult } from './backupClient';
import { createBackupController, type BackupController } from './backup';
import { buildEnvelope } from './backupEnvelope';
import { localSavedAt, readLocal, writeLocal } from './local';
import { LS_KEY } from './storage';
import { SCHEMA_VERSION } from '../types';

/** work-truck's backup store, in memory, with a switch to take it offline. */
class FakeBackup implements BackupClient {
  stored: { meta: BackupMeta; body: string } | null = null;
  down = false;
  puts: { body: string; expected: number | null }[] = [];
  gets = 0;

  /** Seed the store as if another browser had written it. */
  hold(entries: Record<string, string>, savedAt: string) {
    const body = JSON.stringify(buildEnvelope(entries, savedAt));
    const rev = (this.stored?.meta.rev ?? 0) + 1;
    this.stored = { meta: { rev, savedAt, size: body.length }, body };
  }

  private check() {
    if (this.down) throw new BackupUnavailableError('work-truck is not reachable');
  }

  async meta() {
    this.check();
    return this.stored?.meta ?? null;
  }

  async get() {
    this.check();
    this.gets++;
    return this.stored ? { rev: this.stored.meta.rev, body: JSON.parse(this.stored.body) as unknown } : null;
  }

  async put(body: string, expected: number | null): Promise<PutResult> {
    this.check();
    this.puts.push({ body, expected });
    if ((this.stored?.meta.rev ?? null) !== expected) return { ok: false, current: this.stored?.meta ?? null };
    const savedAt = (JSON.parse(body) as { savedAt: string }).savedAt;
    const meta = { rev: (this.stored?.meta.rev ?? 0) + 1, savedAt, size: body.length };
    this.stored = { meta, body };
    return { ok: true, meta };
  }

  /** The domain state of the last write, parsed. */
  lastState(): unknown {
    return this.stored ? (JSON.parse(this.stored.body) as { state: unknown }).state : null;
  }
}

const domain = (name: string) => JSON.stringify({ version: SCHEMA_VERSION, releases: [{ name }] });

let fake: FakeBackup;
let reload: ReturnType<typeof vi.fn<() => void>>;
let ctl: BackupController;

/** Run pending timers and let every awaited promise settle. */
async function settle(ms = 0) {
  await vi.advanceTimersByTimeAsync(ms);
}

function start() {
  ctl = createBackupController({ client: fake, reload, debounceMs: 1000, maxWaitMs: 5000, retryMs: 30_000 });
  ctl.start();
}

/** A browser that has already agreed with the backup at its current revision. */
async function syncedBrowser() {
  writeLocal(LS_KEY, domain('mine'));
  start();
  await settle();
  expect(ctl.getStatus().kind).toBe('backed-up');
  fake.puts = [];
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  fake = new FakeBackup();
  reload = vi.fn<() => void>();
});

afterEach(() => {
  ctl?.stop();
  vi.useRealTimers();
});

describe('first meeting', () => {
  it('seeds an empty backup from this browser', async () => {
    writeLocal(LS_KEY, domain('mine'));
    start();
    await settle();
    expect(fake.puts).toHaveLength(1);
    expect(fake.puts[0].expected).toBeNull();
    expect(fake.lastState()).toEqual(JSON.parse(domain('mine')));
    expect(ctl.getStatus()).toMatchObject({ kind: 'backed-up', meta: { rev: 1 } });
  });

  it('a wiped browser restores automatically and never writes first', async () => {
    fake.hold({ [LS_KEY]: domain('the real data'), 'release-tracker:theme': 'dusk' }, '2026-10-01T09:00:00.000Z');
    // What a wiped browser holds after booting: the seed, written quietly, no stamp.
    writeLocal(LS_KEY, domain('demo'), { quiet: true });

    start();
    await settle();

    expect(fake.puts).toHaveLength(0);
    expect(reload).toHaveBeenCalledOnce();
    expect(JSON.parse(readLocal(LS_KEY)!)).toEqual(JSON.parse(domain('the real data')));
    expect(readLocal('release-tracker:theme')).toBe('dusk');
    expect(localSavedAt()).toBe('2026-10-01T09:00:00.000Z');
    expect(ctl.restoredAt()).not.toBeNull();
  });

  it('after a restore, the next boot agrees with the backup and does nothing', async () => {
    fake.hold({ [LS_KEY]: domain('the real data') }, '2026-10-01T09:00:00.000Z');
    start();
    await settle();
    ctl.stop();

    start(); // the reload
    await settle();
    expect(ctl.getStatus().kind).toBe('backed-up');
    expect(fake.puts).toHaveLength(0);
    expect(reload).toHaveBeenCalledOnce();
  });

  it('a browser with its own changes meeting an existing backup is a conflict, not a restore', async () => {
    fake.hold({ [LS_KEY]: domain('other port') }, '2026-10-01T09:00:00.000Z');
    writeLocal(LS_KEY, domain('mine')); // stamped: changed here
    start();
    await settle();
    expect(ctl.getStatus()).toMatchObject({ kind: 'conflict', current: { rev: 1 } });
    expect(fake.puts).toHaveLength(0);
    expect(reload).not.toHaveBeenCalled();
  });
});

describe('the reconcile table', () => {
  it('unchanged here, backup unchanged → nothing', async () => {
    await syncedBrowser();
    ctl.stop();
    start();
    await settle();
    expect(ctl.getStatus().kind).toBe('backed-up');
    expect(fake.puts).toHaveLength(0);
  });

  it('changed here, backup unchanged → save', async () => {
    await syncedBrowser();
    ctl.stop();
    writeLocal(LS_KEY, domain('edited while closed')); // as if edited with work-truck down
    start();
    await settle();
    expect(fake.puts).toHaveLength(1);
    expect(fake.puts[0].expected).toBe(1);
    expect(fake.lastState()).toEqual(JSON.parse(domain('edited while closed')));
  });

  it('unchanged here, backup changed → restore', async () => {
    await syncedBrowser();
    ctl.stop();
    fake.hold({ [LS_KEY]: domain('newer elsewhere') }, '2026-10-08T09:00:00.000Z');
    start();
    await settle();
    expect(reload).toHaveBeenCalledOnce();
    expect(JSON.parse(readLocal(LS_KEY)!)).toEqual(JSON.parse(domain('newer elsewhere')));
  });

  it('changed here and backup changed → conflict', async () => {
    await syncedBrowser();
    ctl.stop();
    fake.hold({ [LS_KEY]: domain('newer elsewhere') }, '2026-10-08T09:00:00.000Z');
    writeLocal(LS_KEY, domain('edited offline'));
    start();
    await settle();
    expect(ctl.getStatus().kind).toBe('conflict');
    expect(reload).not.toHaveBeenCalled();
    expect(fake.puts).toHaveLength(0);
  });
});

describe('saving', () => {
  it('coalesces a burst of changes into one save after the quiet period', async () => {
    await syncedBrowser();
    writeLocal(LS_KEY, domain('a'));
    await settle(300);
    writeLocal(LS_KEY, domain('b'));
    await settle(300);
    writeLocal('release-tracker:theme', 'dusk');
    await settle(999);
    expect(fake.puts).toHaveLength(0);
    await settle(1);
    expect(fake.puts).toHaveLength(1);
    expect(fake.lastState()).toEqual(JSON.parse(domain('b')));
  });

  it('a steady stream of changes still saves within the max wait', async () => {
    await syncedBrowser();
    for (let i = 0; i < 12; i++) {
      writeLocal(LS_KEY, domain(`edit ${i}`));
      await settle(500);
    }
    expect(fake.puts.length).toBeGreaterThanOrEqual(1);
  });

  it('flushNow saves immediately, skipping the debounce', async () => {
    await syncedBrowser();
    writeLocal(LS_KEY, domain('pulled'));
    await ctl.flushNow();
    expect(fake.puts).toHaveLength(1);
  });

  it('a change during an in-flight save produces exactly one more save', async () => {
    await syncedBrowser();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const realPut = fake.put.bind(fake);
    fake.put = async (body, expected) => {
      await gate;
      return realPut(body, expected);
    };
    writeLocal(LS_KEY, domain('first'));
    const first = ctl.flushNow();
    writeLocal(LS_KEY, domain('second'));
    void ctl.flushNow();
    release();
    await first;
    await settle();
    expect(fake.puts).toHaveLength(2);
    expect(fake.lastState()).toEqual(JSON.parse(domain('second')));
  });

  it('a 409 mid-session stops saving and reports the conflict', async () => {
    await syncedBrowser();
    fake.hold({ [LS_KEY]: domain('another tab') }, '2026-10-08T09:00:00.000Z');
    writeLocal(LS_KEY, domain('this tab'));
    await settle(1000);
    expect(ctl.getStatus()).toMatchObject({ kind: 'conflict', current: { rev: 2 } });
    writeLocal(LS_KEY, domain('this tab again'));
    await settle(10_000);
    expect(fake.puts).toHaveLength(1); // the refused one, and no more
  });

  it('device bookkeeping never triggers a save of its own', async () => {
    await syncedBrowser();
    await settle(10_000);
    expect(fake.puts).toHaveLength(0);
  });
});

describe('conflict resolution', () => {
  async function inConflict() {
    fake.hold({ [LS_KEY]: domain('theirs') }, '2026-10-01T09:00:00.000Z');
    writeLocal(LS_KEY, domain('mine'));
    start();
    await settle();
    expect(ctl.getStatus().kind).toBe('conflict');
  }

  it('use-backup restores and reloads', async () => {
    await inConflict();
    await ctl.resolveConflict('use-backup');
    expect(reload).toHaveBeenCalledOnce();
    expect(JSON.parse(readLocal(LS_KEY)!)).toEqual(JSON.parse(domain('theirs')));
  });

  it('keep-this-browser overwrites the backup at its current revision', async () => {
    await inConflict();
    await ctl.resolveConflict('keep-this-browser');
    expect(fake.puts.at(-1)?.expected).toBe(1);
    expect(fake.lastState()).toEqual(JSON.parse(domain('mine')));
    expect(ctl.getStatus().kind).toBe('backed-up');
  });
});

describe('when work-truck is not running', () => {
  it('reports unavailable, keeps working locally, and catches up when it returns', async () => {
    fake.down = true;
    writeLocal(LS_KEY, domain('mine'));
    start();
    await settle();
    expect(ctl.getStatus().kind).toBe('unavailable');

    writeLocal(LS_KEY, domain('edited while down'));
    await settle(5000);
    expect(fake.puts).toHaveLength(0);

    fake.down = false;
    await settle(30_000);
    expect(ctl.getStatus().kind).toBe('backed-up');
    expect(fake.lastState()).toEqual(JSON.parse(domain('edited while down')));
  });

  it('backs off between attempts while work-truck stays down', async () => {
    fake.down = true;
    const meta = vi.spyOn(fake, 'meta');
    start();
    await settle();
    expect(meta).toHaveBeenCalledTimes(1);
    await settle(30_000); // 1st retry at 30 s
    expect(meta).toHaveBeenCalledTimes(2);
    await settle(30_000); // next is 60 s after that, so not yet
    expect(meta).toHaveBeenCalledTimes(2);
    await settle(30_000);
    expect(meta).toHaveBeenCalledTimes(3);
  });

  it('an outage mid-save is unavailable, not a conflict', async () => {
    await syncedBrowser();
    fake.down = true;
    writeLocal(LS_KEY, domain('x'));
    await settle(1000);
    expect(ctl.getStatus().kind).toBe('unavailable');
  });
});

describe('refusals', () => {
  it('a backup from a newer build is neither restored nor overwritten', async () => {
    fake.hold({ [LS_KEY]: JSON.stringify({ version: SCHEMA_VERSION + 1 }) }, '2026-10-01T09:00:00.000Z');
    start();
    await settle();
    expect(ctl.getStatus()).toMatchObject({ kind: 'refused', reason: 'newer-schema' });
    expect(reload).not.toHaveBeenCalled();
    writeLocal(LS_KEY, domain('mine'));
    await settle(10_000);
    expect(fake.puts).toHaveLength(0);
  });
});

describe('start fresh (detach)', () => {
  it('a detached browser neither restores nor saves', async () => {
    fake.hold({ [LS_KEY]: domain('the real data') }, '2026-10-01T09:00:00.000Z');
    start();
    await settle();
    reload.mockClear();
    ctl.detach();
    ctl.stop();

    start();
    await settle();
    expect(ctl.getStatus().kind).toBe('detached');
    writeLocal(LS_KEY, domain('sandbox'));
    await settle(10_000);
    expect(fake.puts).toHaveLength(0);
    expect(reload).not.toHaveBeenCalled();
  });

  it('re-attaching with local changes is a conflict, never a silent restore', async () => {
    fake.hold({ [LS_KEY]: domain('the real data') }, '2026-10-01T09:00:00.000Z');
    start();
    await settle();
    ctl.detach();
    writeLocal(LS_KEY, domain('sandbox'));
    await ctl.attach();
    expect(ctl.getStatus().kind).toBe('conflict');
  });
});
