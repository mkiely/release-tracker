// Building clipboard payloads, and writing them.
//
// The payload builders are pure and HTML-escaped so they unit-test without the
// browser Clipboard API. The writers below own the fallbacks: three call sites
// had each written out the same hidden-textarea/execCommand dance, and each one
// carried a comment noting that it "mirrors" the others.

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ESC[c]);

/** The visible link text for an item: `KEY subject`, trimmed. */
export function linkLabel(key: string, subject: string): string {
  return `${key} ${subject}`.trim();
}

/** The `{ html, text }` clipboard flavors for a work item's backend link. */
export function linkClipboard(key: string, subject: string, url: string): { html: string; text: string } {
  const label = linkLabel(key, subject);
  return {
    html: `<a href="${escape(url)}">${escape(label)}</a>`,
    text: `${label} — ${url}`,
  };
}

/**
 * Copy plain text to the clipboard. Returns whether it actually landed.
 *
 * Falls back to a hidden textarea + `document.execCommand('copy')` when the
 * async Clipboard API is unavailable — it needs a secure context, so a dev
 * server or an intranet host reached over plain http has no `navigator.clipboard`
 * at all.
 *
 * The boolean is the point. This used to return void and swallow both failure
 * paths — the async API's rejection was caught and `execCommand`'s false return
 * was discarded — while its own comment claimed the caller's toast reported the
 * failure. No caller could: there was nothing to report. Every copy action said
 * "copied" whether or not anything reached the clipboard.
 */
export async function copyText(text: string): Promise<boolean> {
  const hasAsyncApi = typeof navigator.clipboard?.writeText === 'function';
  if (hasAsyncApi) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* refused — try the legacy path, but see the note on trusting it below */
    }
  }

  const wrote = writeViaTextarea(text);

  // `execCommand('copy')` can return true having written nothing: measured in an
  // embedded webview where both async writes were refused with NotAllowedError, this
  // returned true, and a subsequent paste came back empty. So its optimism is only
  // trusted where the async API is ABSENT — an http origin or an old browser, where
  // it is the only mechanism there is. Where the API exists and explicitly refused,
  // that refusal is the more reliable signal and the caller is told the copy failed.
  //
  // The legacy write is still attempted rather than skipped: if it does work, the
  // text is on the clipboard and the pessimistic toast costs the user a retry. The
  // opposite mistake — claiming success over an untouched clipboard — is the one
  // that loses work, and is the bug this whole function was rewritten for.
  return hasAsyncApi ? false : wrote;
}

/** The pre-Clipboard-API copy: select a hidden textarea and ask the document to
 *  copy the selection. Returns what `execCommand` claims, which is not the same
 *  thing as whether the clipboard changed — see the caller. */
function writeViaTextarea(text: string): boolean {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    document.body.removeChild(ta);
  }
}

/**
 * Copy text that isn't ready yet, without losing the click that asked for it.
 *
 * A clipboard write needs the page's *transient user activation* — the short
 * window a real click opens. Awaiting anything first spends it, so the obvious
 * shape
 *
 *     const url = await buildSnapshotUrl(...);   // async: deflate via CompressionStream
 *     await copyText(url);                       // activation already gone
 *
 * is refused by browsers that enforce this (Safari always; Chromium depending on
 * how long the await took). That is exactly the shape the share and summary links
 * had, and it is why they were the actions that failed while Export TSV — whose
 * payload is built synchronously — kept working.
 *
 * The fix is to hand the clipboard a *promise* of the content: `write()` is
 * issued inside the activation window and the browser waits on the blob itself.
 * So **nothing may be awaited in this function before `write()` is called**, and
 * callers must not await anything before calling it.
 *
 * Falls back to building first and writing after, for browsers without
 * promise-valued `ClipboardItem` — no worse than the old behaviour, and now
 * honestly reported. Reject `pending` to mean "there is nothing to copy": that
 * returns false rather than writing an empty string over the real clipboard.
 */
export async function copyTextLazy(pending: Promise<string>): Promise<boolean> {
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ 'text/plain': pending.then((t) => new Blob([t], { type: 'text/plain' })) }),
      ]);
      return true;
    } catch {
      /* the browser refused, or `pending` rejected — the fallback settles which */
    }
  }
  try {
    return await copyText(await pending);
  } catch {
    return false;
  }
}

/**
 * Copy a dual-flavour payload, so a paste lands as a live link in a document or
 * chat client and as readable text everywhere else.
 *
 * `ClipboardItem` is the only way to offer both flavours at once and isn't
 * universal, so this degrades to the plain-text flavour rather than failing.
 * Returns whether the write succeeded, since the caller distinguishes
 * "Link copied" from "Copy failed".
 */
export async function copyRich({ html, text }: { html: string; text: string }): Promise<boolean> {
  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' }),
        }),
      ]);
    } else {
      await copyText(text);
    }
    return true;
  } catch {
    return false;
  }
}
