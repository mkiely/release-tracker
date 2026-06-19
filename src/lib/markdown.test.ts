import { describe, it, expect } from 'vitest';
import { markdownToHtml, looksLikeMarkdown } from './markdown';

describe('markdownToHtml', () => {
  it('converts headings', () => {
    expect(markdownToHtml('## Overview')).toBe('<h2>Overview</h2>');
    expect(markdownToHtml('# A\n###### F')).toBe('<h1>A</h1><h6>F</h6>');
  });

  it('converts inline marks', () => {
    expect(markdownToHtml('**bold** and *italic* and ~~gone~~')).toBe(
      '<p><strong>bold</strong> and <em>italic</em> and <s>gone</s></p>',
    );
  });

  it('protects inline code from other marks', () => {
    expect(markdownToHtml('use `**not bold**` here')).toBe('<p>use <code>**not bold**</code> here</p>');
  });

  it('converts links', () => {
    expect(markdownToHtml('see [docs](https://x.com/a)')).toBe('<p>see <a href="https://x.com/a">docs</a></p>');
  });

  it('converts bullet and ordered lists', () => {
    expect(markdownToHtml('- one\n- two')).toBe('<ul><li>one</li><li>two</li></ul>');
    expect(markdownToHtml('1. first\n2. second')).toBe('<ol><li>first</li><li>second</li></ol>');
  });

  it('converts fenced code blocks without inner formatting', () => {
    expect(markdownToHtml('```\nconst x = **1**;\n```')).toBe('<pre><code>const x = **1**;</code></pre>');
  });

  it('converts blockquotes and horizontal rules', () => {
    expect(markdownToHtml('> quoted line')).toBe('<blockquote><p>quoted line</p></blockquote>');
    expect(markdownToHtml('---')).toBe('<hr>');
  });

  it('groups consecutive lines into one paragraph and splits on blank lines', () => {
    expect(markdownToHtml('line a\nline b\n\nline c')).toBe('<p>line a line b</p><p>line c</p>');
  });

  it('escapes HTML in plain text', () => {
    expect(markdownToHtml('a < b & c')).toBe('<p>a &lt; b &amp; c</p>');
  });
});

describe('looksLikeMarkdown', () => {
  it('detects markdown syntax', () => {
    expect(looksLikeMarkdown('## Heading')).toBe(true);
    expect(looksLikeMarkdown('- a bullet')).toBe(true);
    expect(looksLikeMarkdown('some **bold** text')).toBe(true);
    expect(looksLikeMarkdown('see [x](http://y)')).toBe(true);
  });

  it('returns false for plain prose', () => {
    expect(looksLikeMarkdown('Just a normal sentence with no markup.')).toBe(false);
    expect(looksLikeMarkdown('A multiply 3 * 4 example')).toBe(false);
  });
});
