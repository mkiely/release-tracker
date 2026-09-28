// HTML escaping, in one place.
//
// Two modules build HTML strings by hand — the clipboard payload builder and the
// Markdown converter — and each carried its own character map. They were nearly
// but not quite the same (one escaped the double quote, the other didn't), which
// is exactly the shape of divergence that turns into an injection hole the day a
// third caller copies whichever one it found first.
//
// The distinction that actually matters is the context the text lands in, so
// that's what the two functions are named after rather than the module they came
// from.

const TEXT: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
const ATTR: Record<string, string> = { ...TEXT, '"': '&quot;' };

/** Escape for element content, where a bare quote is harmless. */
export const escapeText = (s: string): string => s.replace(/[&<>]/g, (c) => TEXT[c]);

/** Escape for a double-quoted attribute value, where a bare quote ends it. */
export const escapeAttr = (s: string): string => s.replace(/[&<>"]/g, (c) => ATTR[c]);
