// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyText, copyTextLazy, linkClipboard, linkLabel } from './copyLink';

describe('copyLink', () => {
  it('builds the label as `KEY subject`', () => {
    expect(linkLabel('NXS-123', 'Per-tenant rate limiting')).toBe('NXS-123 Per-tenant rate limiting');
  });

  it('trims a blank subject to just the key', () => {
    expect(linkLabel('NXS-123', '')).toBe('NXS-123');
  });

  it('produces an HTML anchor whose text is the key + subject', () => {
    const { html } = linkClipboard('NXS-1', 'Ship it', 'https://acme.test/browse/NXS-1');
    expect(html).toBe('<a href="https://acme.test/browse/NXS-1">NXS-1 Ship it</a>');
  });

  it('produces a plain-text fallback carrying the label and url', () => {
    const { text } = linkClipboard('NXS-1', 'Ship it', 'https://acme.test/browse/NXS-1');
    expect(text).toBe('NXS-1 Ship it — https://acme.test/browse/NXS-1');
  });

  it('escapes HTML metacharacters in the subject and url', () => {
    const { html } = linkClipboard('NXS-2', 'A < B & "C"', 'https://x.test/q?a=1&b=2');
    expect(html).toBe('<a href="https://x.test/q?a=1&amp;b=2">NXS-2 A &lt; B &amp; &quot;C&quot;</a>');
  });
});

// ── Clipboard writers ──────────────────────────────────────────────────────
// jsdom ships neither navigator.clipboard nor ClipboardItem, so both are stubbed
// per test. That is the point: the behaviour under test is what happens when a
// write is REFUSED, which is the case the browser only reaches intermittently and
// the app previously could not detect at all.

type WriteText = (t: string) => Promise<void>;
type Write = (items: unknown[]) => Promise<void>;

function stubClipboard(impl: { writeText?: WriteText; write?: Write } | null): void {
  Object.defineProperty(navigator, 'clipboard', { value: impl ?? undefined, configurable: true, writable: true });
}

/** Stub `document.execCommand`, which jsdom does not implement. */
function stubExecCommand(result: boolean | (() => never)): void {
  (document as unknown as { execCommand: () => boolean }).execCommand = () => {
    if (typeof result === 'function') result();
    return result as boolean;
  };
}

function stubClipboardItem(present: boolean): void {
  if (present) {
    (globalThis as { ClipboardItem?: unknown }).ClipboardItem = class {
      constructor(readonly parts: Record<string, unknown>) {}
    };
  } else {
    delete (globalThis as { ClipboardItem?: unknown }).ClipboardItem;
  }
}

afterEach(() => {
  stubClipboard(null);
  stubClipboardItem(false);
  vi.restoreAllMocks();
});

describe('copyText', () => {
  it('reports true when the async Clipboard API accepts the write', async () => {
    stubClipboard({ writeText: async () => {} });
    await expect(copyText('hello')).resolves.toBe(true);
  });

  it('passes the text through to writeText', async () => {
    const seen: string[] = [];
    stubClipboard({ writeText: async (t) => void seen.push(t) });
    await copyText('the payload');
    expect(seen).toEqual(['the payload']);
  });

  it('trusts execCommand where the async API is absent — an http origin has nothing else', async () => {
    stubClipboard(null);
    stubExecCommand(true);
    await expect(copyText('hello')).resolves.toBe(true);
  });

  // The reported bug: a success toast over an untouched clipboard. Both paths fail,
  // and the caller has to be able to tell.
  it('reports FALSE when the async API rejects and execCommand also fails', async () => {
    stubClipboard({ writeText: async () => { throw new Error('NotAllowedError'); } });
    stubExecCommand(false);
    await expect(copyText('hello')).resolves.toBe(false);
  });

  // Measured in this app's own embedded webview: both async writes refused, yet
  // execCommand returned true and the clipboard stayed empty. An explicit refusal
  // from an API that exists outranks the deprecated one's optimism.
  it('does NOT trust execCommand\'s true when the async API existed and refused', async () => {
    stubClipboard({ writeText: async () => { throw new Error('NotAllowedError'); } });
    stubExecCommand(true);
    await expect(copyText('hello')).resolves.toBe(false);
  });

  it('still attempts the legacy write even when it will not trust the result', async () => {
    // Pessimistic reporting must not become "don't bother trying" — if the legacy
    // path does work, the text should be on the clipboard for the user's retry.
    stubClipboard({ writeText: async () => { throw new Error('NotAllowedError'); } });
    let attempted = false;
    (document as unknown as { execCommand: () => boolean }).execCommand = () => { attempted = true; return true; };
    await copyText('hello');
    expect(attempted).toBe(true);
  });

  it('reports false when execCommand throws rather than returning', async () => {
    stubClipboard(null);
    stubExecCommand(() => { throw new Error('unsupported'); });
    await expect(copyText('hello')).resolves.toBe(false);
  });

  it('removes its scratch textarea whichever way the fallback goes', async () => {
    stubClipboard(null);
    stubExecCommand(false);
    await copyText('hello');
    expect(document.querySelectorAll('textarea')).toHaveLength(0);
  });
});

describe('copyTextLazy', () => {
  it('issues the clipboard write BEFORE the payload resolves', async () => {
    // The property the whole function exists for: `write()` has to land inside the
    // click's user-activation window, so it cannot wait on the payload. If this
    // assertion ever fails, the share and summary links are silently broken again
    // in every browser that enforces activation.
    stubClipboardItem(true);
    let release!: (s: string) => void;
    const pending = new Promise<string>((r) => { release = r; });
    const calls: unknown[][] = [];
    stubClipboard({ write: async (items) => void calls.push(items) });

    const result = copyTextLazy(pending);
    expect(calls).toHaveLength(1); // issued synchronously, payload still pending

    release('the url');
    await expect(result).resolves.toBe(true);
  });

  it('hands the clipboard a promise of the payload, not the payload itself', async () => {
    stubClipboardItem(true);
    let captured: Record<string, unknown> | undefined;
    stubClipboard({
      write: async (items) => {
        captured = (items[0] as { parts: Record<string, unknown> }).parts;
      },
    });
    await copyTextLazy(Promise.resolve('x'));
    expect(captured!['text/plain']).toBeInstanceOf(Promise);
  });

  it('falls back to build-then-write where promise-valued ClipboardItem is unavailable', async () => {
    stubClipboardItem(false);
    const seen: string[] = [];
    stubClipboard({ writeText: async (t) => void seen.push(t) });
    await expect(copyTextLazy(Promise.resolve('built later'))).resolves.toBe(true);
    expect(seen).toEqual(['built later']);
  });

  it('reports false, and writes nothing, when the payload rejects', async () => {
    // A rejected payload is how callers say "there is nothing to copy" — it must not
    // clear whatever the user already had on the clipboard.
    stubClipboardItem(false);
    const seen: string[] = [];
    stubClipboard({ writeText: async (t) => void seen.push(t) });
    await expect(copyTextLazy(Promise.reject(new Error('nothing to copy')))).resolves.toBe(false);
    expect(seen).toEqual([]);
  });

  it('reports false when the browser refuses the write and the fallback fails too', async () => {
    stubClipboardItem(true);
    stubClipboard({
      write: async () => { throw new Error('NotAllowedError'); },
      writeText: async () => { throw new Error('NotAllowedError'); },
    });
    stubExecCommand(false);
    await expect(copyTextLazy(Promise.resolve('x'))).resolves.toBe(false);
  });

  it('recovers through the fallback when only the promise-valued write is refused', async () => {
    stubClipboardItem(true);
    const seen: string[] = [];
    stubClipboard({
      write: async () => { throw new Error('NotAllowedError'); },
      writeText: async (t) => void seen.push(t),
    });
    await expect(copyTextLazy(Promise.resolve('x'))).resolves.toBe(true);
    expect(seen).toEqual(['x']);
  });
});
