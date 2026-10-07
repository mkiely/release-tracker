import { afterEach, describe, expect, it, vi } from 'vitest';
import { BackupUnavailableError, HttpBackupClient } from './backupClient';

const meta = { rev: 3, savedAt: '2026-10-07T12:00:00.000Z', size: 120 };

function respond(body: string, init: ResponseInit & { json?: boolean } = {}) {
  const headers = new Headers(init.headers);
  if (init.json !== false) headers.set('Content-Type', 'application/json');
  vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { ...init, headers })));
}

afterEach(() => vi.unstubAllGlobals());

const client = new HttpBackupClient('http://localhost:8787');

describe('HttpBackupClient', () => {
  it('reads meta, and treats 404 as "no backup yet"', async () => {
    respond(JSON.stringify(meta));
    expect(await client.meta()).toEqual(meta);
    respond('{"error":"No backup stored"}', { status: 404 });
    expect(await client.meta()).toBeNull();
  });

  it('an older work-truck answering with the SPA page is unavailable, not a backup', async () => {
    // The SPA fallback serves index.html with a 200 for any unknown GET.
    respond('<!doctype html><html></html>', { status: 200, headers: { 'Content-Type': 'text/html' }, json: false });
    await expect(client.meta()).rejects.toBeInstanceOf(BackupUnavailableError);
  });

  it('JSON that is not meta is unavailable too', async () => {
    respond('{"hello":"world"}');
    await expect(client.meta()).rejects.toBeInstanceOf(BackupUnavailableError);
  });

  it('no service at all is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }));
    await expect(client.meta()).rejects.toBeInstanceOf(BackupUnavailableError);
  });

  it('takes the revision from the ETag on get', async () => {
    respond('{"format":"release-tracker-backup"}', { headers: { ETag: '"3"' } });
    expect(await client.get()).toEqual({ rev: 3, body: { format: 'release-tracker-backup' } });
  });

  it('a get without a readable ETag is unavailable (the header was not exposed)', async () => {
    respond('{"format":"release-tracker-backup"}');
    await expect(client.get()).rejects.toBeInstanceOf(BackupUnavailableError);
  });

  it('sends If-None-Match for a first write and If-Match after', async () => {
    respond(JSON.stringify(meta));
    await client.put('{}', null);
    let init = vi.mocked(fetch).mock.calls[0][1]!;
    expect((init.headers as Record<string, string>)['If-None-Match']).toBe('*');

    respond(JSON.stringify(meta));
    await client.put('{}', 3);
    init = vi.mocked(fetch).mock.calls[0][1]!;
    expect((init.headers as Record<string, string>)['If-Match']).toBe('"3"');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('turns a 409 into a conflict carrying the current meta', async () => {
    respond(JSON.stringify({ error: 'changed', current: meta }), { status: 409 });
    expect(await client.put('{}', 1)).toEqual({ ok: false, current: meta });
  });
});
