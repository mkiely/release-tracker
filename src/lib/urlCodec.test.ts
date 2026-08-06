import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_URL_LENGTH, decodeJson, encodeJson, supportsUrlCodec } from './urlCodec';

describe('encodeJson / decodeJson', () => {
  it('round-trips an object', async () => {
    const value = { a: 1, b: 'two', c: [3, null, true], d: { nested: 'yes' } };
    expect(await decodeJson(await encodeJson(value))).toEqual(value);
  });

  it('round-trips non-ASCII text', async () => {
    // The payloads carry release and stream names, which are user-authored: the
    // encoder must go through UTF-8 bytes rather than assuming one char per byte.
    const value = { name: 'Café — Ünïcode ✓ 日本語', note: 'em—dash and “smart quotes”' };
    expect(await decodeJson(await encodeJson(value))).toEqual(value);
  });

  it('produces a URL-safe value needing no escaping', async () => {
    const encoded = await encodeJson({ padding: 'x'.repeat(500), n: 42 });
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(encodeURIComponent(encoded)).toBe(encoded);
  });

  it('compresses repetitive payloads well below their JSON size', async () => {
    const value = { rows: Array.from({ length: 200 }, (_, i) => ({ label: 'Sprint', index: i, points: 8 })) };
    const encoded = await encodeJson(value);
    expect(encoded.length).toBeLessThan(JSON.stringify(value).length / 4);
  });

  it('returns null rather than throwing on input it did not produce', async () => {
    await expect(decodeJson('')).resolves.toBeNull();
    await expect(decodeJson('!!!not-base64!!!')).resolves.toBeNull();
    // Well-formed base64url, but the bytes are not a deflate stream.
    await expect(decodeJson('bm90LWRlZmxhdGU')).resolves.toBeNull();
  });

  it('returns null for a truncated payload, as a clipped link produces', async () => {
    const encoded = await encodeJson({ rows: Array.from({ length: 200 }, (_, i) => ({ i, v: `row ${i}` })) });
    await expect(decodeJson(encoded.slice(0, Math.floor(encoded.length / 2)))).resolves.toBeNull();
  });

  it('handles a payload large enough to cross the chunked-base64 boundary', async () => {
    // Incompressible data, so the deflate output exceeds the 0x8000 chunk size the
    // base64 conversion steps through.
    const blob = Array.from({ length: 60000 }, (_, i) => (i * 2654435761) % 256);
    const decoded = await decodeJson<{ blob: number[] }>(await encodeJson({ blob }));
    expect(decoded!.blob).toEqual(blob);
  });
});

describe('supportsUrlCodec', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports support on a platform with CompressionStream', () => {
    expect(supportsUrlCodec()).toBe(true);
  });

  it('reports no support when CompressionStream is missing', () => {
    // A browser predating the API (pre-2023). The summary viewer is a static page
    // opened by recipients, so it uses this to explain itself rather than blaming
    // the link.
    vi.stubGlobal('CompressionStream', undefined);
    expect(supportsUrlCodec()).toBe(false);
  });

  it('reports no support when deflate-raw specifically is unavailable', () => {
    // Chrome 80–102 shipped CompressionStream with only gzip/deflate.
    vi.stubGlobal(
      'CompressionStream',
      class {
        constructor(format: string) {
          if (format === 'deflate-raw') throw new TypeError('unsupported format');
        }
      },
    );
    expect(supportsUrlCodec()).toBe(false);
  });
});

describe('MAX_URL_LENGTH', () => {
  it('is the single cap both link formats share', () => {
    expect(MAX_URL_LENGTH).toBe(8000);
  });
});
