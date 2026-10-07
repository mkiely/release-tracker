// HTTP access to work-truck's backup store (GET /backup/meta, GET /backup, PUT /backup).
//
// Deliberately apart from SyncClient: that interface is the path to an external
// system, and backup must never be mistaken for it. This one only ever moves the
// app's own data to and from a file on the user's disk.
//
// Every failure the caller can't act on — no service, an older work-truck without
// the backup module, a non-JSON reply — surfaces as BackupUnavailableError, so the
// controller has one "can't reach a backup" state rather than a dozen.

import type { BackupMeta } from '@release-tracker/sync-contract';

/** Compress bodies above this. Localhost is fast; this is about not shipping 10 MB of JSON. */
const COMPRESS_OVER_BYTES = 256 * 1024;
/** Browsers drop a keepalive request above ~64 KB, so only small flushes can use it. */
const KEEPALIVE_UNDER_BYTES = 60 * 1024;

export class BackupUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupUnavailableError';
  }
}

export type PutResult = { ok: true; meta: BackupMeta } | { ok: false; current: BackupMeta | null };

export interface BackupClient {
  /** The stored backup's meta, or null when the service holds none. */
  meta(): Promise<BackupMeta | null>;
  /** The stored envelope (unvalidated JSON) and the revision it is. */
  get(): Promise<{ rev: number; body: unknown } | null>;
  /** Replace the backup if `expectedRev` is current (null = "there is none yet"). */
  put(body: string, expectedRev: number | null, opts?: { keepalive?: boolean }): Promise<PutResult>;
}

export class HttpBackupClient implements BackupClient {
  constructor(private readonly baseUrl: string) {}

  async meta(): Promise<BackupMeta | null> {
    const res = await this.request('/backup/meta');
    if (res.status === 404) return null;
    return asMeta(await this.json(res));
  }

  async get(): Promise<{ rev: number; body: unknown } | null> {
    const res = await this.request('/backup');
    if (res.status === 404) return null;
    const rev = Number((res.headers.get('ETag') ?? '').replace(/"/g, ''));
    if (!Number.isInteger(rev) || rev < 1) throw new BackupUnavailableError('Backup reply carried no revision');
    return { rev, body: await this.json(res) };
  }

  async put(body: string, expectedRev: number | null, opts: { keepalive?: boolean } = {}): Promise<PutResult> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (expectedRev === null) headers['If-None-Match'] = '*';
    else headers['If-Match'] = `"${expectedRev}"`;

    let payload: BodyInit = body;
    const size = new Blob([body]).size;
    if (size > COMPRESS_OVER_BYTES && canDeflate()) {
      payload = await deflate(body);
      headers['Content-Encoding'] = 'deflate';
    }
    const res = await this.request('/backup', {
      method: 'PUT',
      headers,
      body: payload,
      keepalive: opts.keepalive === true && size < KEEPALIVE_UNDER_BYTES,
    });
    if (res.status === 409) {
      const conflict = (await this.json(res)) as { current?: unknown };
      return { ok: false, current: conflict.current == null ? null : asMeta(conflict.current) };
    }
    return { ok: true, meta: asMeta(await this.json(res)) };
  }

  private async request(path: string, init?: RequestInit): Promise<Response> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, init);
    } catch {
      throw new BackupUnavailableError('work-truck is not reachable');
    }
    if (res.ok || res.status === 404 || res.status === 409) return res;
    const detail = await res.text().catch(() => '');
    throw new BackupUnavailableError(`Backup request failed (${res.status})${detail ? `: ${detail}` : ''}`);
  }

  /** Parse a reply as JSON. A work-truck that predates backup answers unknown GETs
   *  with the SPA's index.html and a 200, so "it said 200" proves nothing. */
  private async json(res: Response): Promise<unknown> {
    const type = res.headers.get('Content-Type') ?? '';
    if (!type.includes('application/json')) throw new BackupUnavailableError('This work-truck does not offer backup');
    try {
      return await res.json();
    } catch {
      throw new BackupUnavailableError('Backup reply was not JSON');
    }
  }
}

function asMeta(value: unknown): BackupMeta {
  const m = value as Partial<BackupMeta> | null;
  if (!m || typeof m.rev !== 'number' || typeof m.savedAt !== 'string' || typeof m.size !== 'number') {
    throw new BackupUnavailableError('This work-truck does not offer backup');
  }
  return { rev: m.rev, savedAt: m.savedAt, size: m.size };
}

function canDeflate(): boolean {
  try {
    return typeof CompressionStream === 'function' && !!new CompressionStream('deflate');
  } catch {
    return false;
  }
}

/** zlib-wrapped deflate — what `Content-Encoding: deflate` means, and what the server inflates. */
async function deflate(text: string): Promise<Blob> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Response(stream).blob();
}
