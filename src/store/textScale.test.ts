// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { TextScaleStore } from './textScale';
import { PRESENTATION_SCALE, PresentationStore } from './presentationMode';

const effective = () =>
  parseFloat(document.documentElement.style.getPropertyValue('--rt-type-scale'));

describe('TextScaleStore', () => {
  afterEach(() => {
    PresentationStore.set(false);
    TextScaleStore.set('md');
    localStorage.clear();
  });

  it('applies the chosen baseline scale to --rt-type-scale', () => {
    TextScaleStore.set('lg');
    expect(effective()).toBeCloseTo(1.15);
    TextScaleStore.set('md');
    expect(effective()).toBeCloseTo(1);
  });

  it('persists the selection to localStorage', () => {
    TextScaleStore.set('xl');
    expect(localStorage.getItem('release-tracker:textScale')).toBe('xl');
  });

  it('composes with presentation mode instead of clobbering it', () => {
    TextScaleStore.set('lg');
    PresentationStore.set(true);
    expect(effective()).toBeCloseTo(1.15 * PRESENTATION_SCALE);
    // Turning presentation off returns to the baseline preference.
    PresentationStore.set(false);
    expect(effective()).toBeCloseTo(1.15);
  });

  it('re-applies when presentation toggles without a text-size change', () => {
    TextScaleStore.set('sm');
    PresentationStore.set(true);
    expect(effective()).toBeCloseTo(0.9 * PRESENTATION_SCALE);
  });
});
