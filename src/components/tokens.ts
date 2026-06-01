// WF — design-token handles for inline styles. Each resolves to a CSS custom
// property at paint time, so a single [data-theme] swap re-themes inline styles
// too. Mirrors the WF object in wireframe-kit.jsx.

import type { Status } from '../types';

export const WF = {
  ink: 'var(--wf-ink)',
  t2: 'var(--wf-t2)',
  t3: 'var(--wf-t3)',
  line: 'var(--wf-line)',
  lineStrong: 'var(--wf-line-strong)',
  fill: 'var(--wf-fill)',
  fillDeep: 'var(--wf-fill-deep)',
  paper: 'var(--wf-paper)',
  bg: 'var(--wf-bg)',
  onInk: 'var(--wf-on-ink)',
  status: {
    'Not Started': { dot: 'var(--wf-st-ns-dot)', soft: 'var(--wf-st-ns-soft)', text: 'var(--wf-st-ns-text)' },
    Active: { dot: 'var(--wf-st-ac-dot)', soft: 'var(--wf-st-ac-soft)', text: 'var(--wf-st-ac-text)' },
    Blocked: { dot: 'var(--wf-st-bl-dot)', soft: 'var(--wf-st-bl-soft)', text: 'var(--wf-st-bl-text)' },
    Complete: { dot: 'var(--wf-st-co-dot)', soft: 'var(--wf-st-co-soft)', text: 'var(--wf-st-co-text)' },
  } as Record<Status, { dot: string; soft: string; text: string }>,
  sans: '"Hanken Grotesk", system-ui, sans-serif',
  mono: 'ui-monospace, "SF Mono", "Cascadia Code", Menlo, monospace',
};
