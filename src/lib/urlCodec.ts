// The URL-payload codec shared by the app's two link formats: the connector share
// link (`#share=`) and the executive-summary snapshot (`#s=`). Both carry JSON in a
// URL fragment, so both want the same thing — the smallest URL-safe encoding of an
// object, and one agreed ceiling on the resulting link.
//
// Encoding is raw DEFLATE via the platform's CompressionStream, then base64url. This
// replaced lz-string, which was roughly twice as large on both payloads (measured on
// the seed data: a snapshot 5957 → 3022 chars, a share 1190 → 707) because it is LZW
// over a 6-bit output alphabet with no entropy coding. Deflate wins at every size we
// produce, including a ~300-byte share where its header overhead is most visible.
//
// The cost is that the platform API is async, which is why every encode/decode in
// this app is. There is no synchronous equivalent — a sync codec means bundling a
// deflate implementation (fflate, pako), which is not worth a dependency when the
// only thing it buys is calling shape.

/**
 * The one ceiling on a link this app will produce, for both formats. Both payloads
 * ride in the *fragment*, which is never sent to a server, so this is bounded by
 * what browsers accept in an address bar rather than by any server's request-line
 * limit (nginx and Apache both cut off around 8k). A link over this is reported to
 * the sharer, not produced.
 */
export const MAX_URL_LENGTH = 8000;

/** `deflate-raw` is the narrowest-supported of the CompressionStream formats:
 *  Chrome 103, Safari 16.4, Firefox 113. Detected rather than assumed so the
 *  summary viewer — a static page opened by recipients on browsers we don't
 *  control — can say "your browser is too old" instead of "this link is invalid". */
export function supportsUrlCodec(): boolean {
  try {
    return typeof CompressionStream === 'function' && !!new CompressionStream('deflate-raw');
  } catch {
    return false;
  }
}

async function pipe(bytes: Uint8Array, transform: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(transform as ReadableWritablePair<Uint8Array, Uint8Array>);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// String.fromCharCode is applied in chunks because spreading a whole payload can
// exceed the engine's argument limit on large inputs.
const CHUNK = 0x8000;

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array {
  // Padding is stripped on encode; atob's forgiving-base64 tolerates its absence,
  // but restoring it keeps this independent of that leniency.
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '='));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** Serialize + compress + URL-safe-encode a value into a fragment payload. */
export async function encodeJson(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return toBase64Url(await pipe(bytes, new CompressionStream('deflate-raw')));
}

/**
 * Reverse {@link encodeJson}. Returns null for anything that isn't a payload this
 * codec produced — bad base64, a corrupt or truncated deflate stream, or invalid
 * JSON all land here, so callers only have to validate *shape*.
 */
export async function decodeJson<T>(encoded: string): Promise<T | null> {
  try {
    const bytes = await pipe(fromBase64Url(encoded), new DecompressionStream('deflate-raw'));
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    return null;
  }
}
