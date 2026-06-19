// A compact, dependency-free Markdown → HTML converter, scoped to exactly the
// nodes/marks Tiptap's StarterKit understands (headings, bold/italic/strike,
// inline code, links, code fences, blockquotes, bullet/ordered lists, rules,
// paragraphs). It exists so the RichTextEditor can format Markdown on paste
// without pulling in a full Markdown library; anything outside this subset is
// re-serialized away by ProseMirror's schema anyway. Not a spec-complete parser
// — it handles the everyday Markdown people paste, and degrades to plain text.

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
const escapeHtml = (s: string) => s.replace(/[&<>]/g, (c) => ESC[c]);
const escapeAttr = (s: string) => escapeHtml(s).replace(/"/g, '&quot;');

/** Apply bold/italic/strike/link marks to a code-free run of text. */
function marks(run: string): string {
  let s = escapeHtml(run);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text, url) => `<a href="${escapeAttr(url)}">${text}</a>`);
  s = s.replace(/(\*\*|__)(?=\S)(.+?)(?<=\S)\1/g, '<strong>$2</strong>');
  s = s.replace(/(?<![*\w])(\*|_)(?=\S)(.+?)(?<=\S)\1(?![*\w])/g, '<em>$2</em>');
  s = s.replace(/~~(?=\S)(.+?)(?<=\S)~~/g, '<s>$1</s>');
  return s;
}

/** Inline formatting: code spans are emitted verbatim (escaped only), and the
 *  text between them gets the other marks. Tokenizing this way means code
 *  contents are never re-processed and ordinary prose can't be misread as a
 *  placeholder. */
function inline(src: string): string {
  let out = '';
  let last = 0;
  const re = /`([^`]+)`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    out += marks(src.slice(last, m.index));
    out += `<code>${escapeHtml(m[1])}</code>`;
    last = m.index + m[0].length;
  }
  return out + marks(src.slice(last));
}

const isBlank = (l: string) => l.trim() === '';
const HR = /^\s*([-*_])(?:\s*\1){2,}\s*$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const ORDERED = /^\s*\d+\.\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;
const FENCE = /^\s*```/;

/** Convert a Markdown string to an HTML fragment. */
export function markdownToHtml(md: string): string {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (isBlank(line)) { i++; continue; }

    if (FENCE.test(line)) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !FENCE.test(lines[i])) body.push(lines[i++]);
      i++; // consume closing fence (if present)
      out.push(`<pre><code>${escapeHtml(body.join('\n'))}</code></pre>`);
      continue;
    }

    if (HR.test(line)) { out.push('<hr>'); i++; continue; }

    const h = line.match(HEADING);
    if (h) { out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue; }

    if (QUOTE.test(line)) {
      const body: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) body.push(lines[i++].match(QUOTE)![1]);
      out.push(`<blockquote><p>${inline(body.join(' ').trim())}</p></blockquote>`);
      continue;
    }

    if (BULLET.test(line)) {
      const items: string[] = [];
      while (i < lines.length && BULLET.test(lines[i])) items.push(lines[i++].match(BULLET)![1]);
      out.push(`<ul>${items.map((t) => `<li>${inline(t)}</li>`).join('')}</ul>`);
      continue;
    }

    if (ORDERED.test(line)) {
      const items: string[] = [];
      while (i < lines.length && ORDERED.test(lines[i])) items.push(lines[i++].match(ORDERED)![1]);
      out.push(`<ol>${items.map((t) => `<li>${inline(t)}</li>`).join('')}</ol>`);
      continue;
    }

    // Paragraph: gather consecutive plain lines until a blank line or a block start.
    const para: string[] = [];
    while (
      i < lines.length && !isBlank(lines[i]) && !FENCE.test(lines[i]) && !HR.test(lines[i]) &&
      !HEADING.test(lines[i]) && !QUOTE.test(lines[i]) && !BULLET.test(lines[i]) && !ORDERED.test(lines[i])
    ) {
      para.push(lines[i++]);
    }
    out.push(`<p>${inline(para.join(' ').trim())}</p>`);
  }
  return out.join('');
}

/** Heuristic: does this text contain Markdown worth converting? Plain prose
 *  returns false so ordinary paste is left to the editor's default handling. */
export function looksLikeMarkdown(text: string): boolean {
  return (
    HR.test(text) || FENCE.test(text) ||
    /^#{1,6}\s+/m.test(text) ||      // heading
    /^\s*>\s+/m.test(text) ||         // blockquote
    /^\s*[-*+]\s+/m.test(text) ||     // bullet list
    /^\s*\d+\.\s+/m.test(text) ||     // ordered list
    /(\*\*|__)\S.*?\S\1/.test(text) ||// bold
    /`[^`]+`/.test(text) ||           // inline code
    /\[[^\]]+\]\([^)\s]+\)/.test(text)// link
  );
}
