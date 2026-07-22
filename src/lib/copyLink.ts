// Builds a rich clipboard payload for a work item: an HTML anchor (pastes as a
// clickable link whose text is the item key + subject) plus a plain-text fallback
// for targets that only accept text. Pure and HTML-escaped so it can be unit-tested
// without the browser Clipboard API; the navigator.clipboard write lives at the call site.

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
