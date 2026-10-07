// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { COL_DEFAULTS, getColWidthFromDOM, saveColWidth } from './useColumnWidths';

const KEY = 'release-tracker:col-widths';
const [col, defaultPx] = Object.entries(COL_DEFAULTS)[0];

describe('column width persistence', () => {
  beforeEach(() => localStorage.clear());

  it('stores a width that differs from the default', () => {
    saveColWidth(col, defaultPx + 40);
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ [col]: defaultPx + 40 });
    expect(getColWidthFromDOM(col, null)).toBe(defaultPx + 40);
  });

  it('drops the entry when a width returns to its default', () => {
    // Storing a default would freeze the column if that default later changes.
    saveColWidth(col, defaultPx + 40);
    saveColWidth(col, defaultPx);
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({});
    expect(getColWidthFromDOM(col, null)).toBe(defaultPx);
  });

  it('reads widths saved by the previous hand-rolled store', () => {
    // Same key, same { col: px } shape — moving onto keyed prefs loses nothing.
    localStorage.setItem(KEY, JSON.stringify({ [col]: 333 }));
    expect(getColWidthFromDOM(col, null)).toBe(333);
  });
});
