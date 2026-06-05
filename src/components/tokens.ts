// WF — design-token handles for inline styles. Each resolves to a CSS custom
// property at paint time, so a single [data-theme] swap re-themes inline styles
// too. Mirrors the WF object in wireframe-kit.jsx.

import type { Status } from '../types';

export const WF = {
  ink: 'var(--rt-ink)',
  t2: 'var(--rt-t2)',
  t3: 'var(--rt-t3)',
  line: 'var(--rt-line)',
  lineStrong: 'var(--rt-line-strong)',
  fill: 'var(--rt-fill)',
  fillDeep: 'var(--rt-fill-deep)',
  paper: 'var(--rt-paper)',
  bg: 'var(--rt-bg)',
  onInk: 'var(--rt-on-ink)',
  status: {
    'Not Started': { dot: 'var(--rt-st-ns-dot)', soft: 'var(--rt-st-ns-soft)', text: 'var(--rt-st-ns-text)' },
    Active: { dot: 'var(--rt-st-ac-dot)', soft: 'var(--rt-st-ac-soft)', text: 'var(--rt-st-ac-text)' },
    Blocked: { dot: 'var(--rt-st-bl-dot)', soft: 'var(--rt-st-bl-soft)', text: 'var(--rt-st-bl-text)' },
    Complete: { dot: 'var(--rt-st-co-dot)', soft: 'var(--rt-st-co-soft)', text: 'var(--rt-st-co-text)' },
  } as Record<Status, { dot: string; soft: string; text: string }>,
  sans: '"Hanken Grotesk", system-ui, sans-serif',
  mono: 'ui-monospace, "SF Mono", "Cascadia Code", Menlo, monospace',
};
