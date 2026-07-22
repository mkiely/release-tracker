import { describe, expect, it } from 'vitest';
import { linkClipboard, linkLabel } from './copyLink';

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
