// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { htmlEqual, htmlToText, normalizeHtml } from './htmlNormalize';

describe('htmlEqual', () => {
  it('treats a schema round-trip re-serialization as equal (no false dirty)', () => {
    // Raw connector HTML the schema rewrites: <b> becomes <strong>, and the
    // paragraph's unknown class/style attributes are dropped.
    const raw = '<p class="jira" style="margin:0">Ship <b>it</b></p>';
    const normalized = normalizeHtml(raw);
    expect(normalized).not.toBe(raw); // the round-trip *does* rewrite the string…
    expect(normalized).toBe('<p>Ship <strong>it</strong></p>');
    expect(htmlEqual(raw, normalized)).toBe(true); // …but they compare equal.
  });

  it('ignores blank-line <br> vs empty-paragraph differences', () => {
    expect(htmlEqual('<p><br></p>', '<p></p>')).toBe(true);
  });

  it('short-circuits identical strings without parsing', () => {
    expect(htmlEqual('<p>same</p>', '<p>same</p>')).toBe(true);
  });

  it('detects a genuine content edit', () => {
    expect(htmlEqual('<p>before</p>', '<p>after</p>')).toBe(false);
  });

  it('detects a genuine formatting edit', () => {
    expect(htmlEqual('<p>word</p>', '<p><strong>word</strong></p>')).toBe(false);
  });
});

describe('htmlToText', () => {
  it('strips tags and collapses whitespace to a single line', () => {
    expect(htmlToText('<p>Hello</p>\n<ul><li>one</li><li>two</li></ul>')).toBe('Hello one two');
  });

  it('returns empty string for empty markup', () => {
    expect(htmlToText('<p></p>')).toBe('');
  });
});
