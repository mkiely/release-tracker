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
 * Copy plain text to the clipboard.
 *
 * Falls back to a hidden textarea + `document.execCommand('copy')` when the
 * async Clipboard API is unavailable — it needs a secure context, so a dev
 * server or an intranet host reached over plain http has no `navigator.clipboard`
 * at all. Resolves either way; a copy that silently didn't happen is reported by
 * the caller's toast, not thrown.
 */
export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    /* fall through to the legacy path */
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
  } finally {
    document.body.removeChild(ta);
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
