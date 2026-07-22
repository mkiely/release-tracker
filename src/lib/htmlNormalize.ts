// Canonicalization of work-item HTML descriptions. The rich-text editor parses
// connector HTML through the ProseMirror/StarterKit schema and re-serializes it
// with getHTML(); that round-trip normalizes the markup (drops unknown
// tags/attributes, reorders attributes, rewrites <br>/whitespace, wraps bare
// text in <p>). So the editor's serialized string is rarely byte-identical to the
// raw string the connector sent, even when nothing semantically changed. Comparing
// those two representations with `===` therefore mis-flags description as edited.
// This module round-trips *both* sides through the same schema so semantically
// equal HTML collapses to one canonical string before comparison.

import { generateHTML, generateJSON, generateText } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';

// The exact extension set the RichTextEditor mounts, so this canonicalization
// matches editor.getHTML() output.
const EXTENSIONS = [StarterKit];

/** Connector HTML often uses <p><br></p> as a blank-line separator; TipTap parses
 *  the <br> as a hard break and appends a trailing placeholder. Stripping the <br>
 *  first lets an empty paragraph canonicalize to <p></p> on both the raw and the
 *  editor-serialized side. Shared with {@link RichTextEditor} so input and
 *  comparison normalize identically. */
export function normalizeBlanks(html: string): string {
  return html.replace(/<p>(\s*<br[^>]*>)+\s*<\/p>/gi, '<p></p>');
}

/** Canonicalize HTML by round-tripping it through the editor's schema
 *  (parse → serialize). Raw connector HTML and the editor's getHTML() output for
 *  the same document collapse to the identical string. */
export function normalizeHtml(html: string): string {
  return generateHTML(generateJSON(normalizeBlanks(html), EXTENSIONS), EXTENSIONS);
}

/** Whether two HTML strings represent the same document. A cheap identity check
 *  short-circuits; otherwise both are canonicalized so a re-serialization
 *  (attribute order, <br> vs <br/>, whitespace, dropped unknown markup) is not
 *  mistaken for a real edit. Falls back to strict equality if parsing throws. */
export function htmlEqual(a: string, b: string): boolean {
  if (a === b) return true;
  try {
    return normalizeHtml(a) === normalizeHtml(b);
  } catch {
    return a === b;
  }
}

/** Plain-text projection of an HTML string, whitespace-collapsed — for compact,
 *  single-line previews where the full markup would be noise. */
export function htmlToText(html: string): string {
  try {
    return generateText(generateJSON(html, EXTENSIONS), EXTENSIONS).replace(/\s+/g, ' ').trim();
  } catch {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
}
