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

describe('tables and images', () => {
  const table =
    '<table><tbody><tr><th colspan="1" rowspan="1"><p>Name</p></th></tr>' +
    '<tr><td colspan="1" rowspan="1"><p>Ada</p></td></tr></tbody></table>';
  const image = '<img src="https://example.com/a.png" alt="diagram">';

  it('keeps a table through the schema round-trip', () => {
    expect(normalizeHtml(table)).toContain('<table');
    expect(normalizeHtml(table)).toContain('<th');
    expect(normalizeHtml(table)).toContain('Ada');
  });

  it('keeps an image with its src and alt', () => {
    const out = normalizeHtml(image);
    expect(out).toContain('src="https://example.com/a.png"');
    expect(out).toContain('alt="diagram"');
  });

  it('detects an edit inside a table cell', () => {
    expect(htmlEqual(table, table.replace('Ada', 'Grace'))).toBe(false);
  });

  it('detects an image being removed', () => {
    expect(htmlEqual(`<p>x</p>${image}`, '<p>x</p>')).toBe(false);
  });

  it('does not treat a re-serialized table as an edit', () => {
    expect(htmlEqual(table, normalizeHtml(table))).toBe(true);
  });
});
