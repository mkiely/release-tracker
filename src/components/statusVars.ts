import type { Status } from '../types';
import type { HealthVerdict } from '../lib/derive';

const KEY: Record<Status, string> = {
  'Not Started':  'ns',
  'In Progress':  'ac',
  'Under Review': 'ur',
  'Blocked':      'bl',
  'Complete':     'co',
};

export function statusVars(s: Status) {
  const k = KEY[s] ?? 'ns';
  return {
    dot:  `var(--rt-st-${k}-dot)`,
    soft: `var(--rt-st-${k}-soft)`,
    text: `var(--rt-st-${k}-text)`,
  };
}

/**
 * Color tokens for a work-item *type* label, reusing the status palette so types
 * read consistently with statuses. Unknown/absent labels fall back to the
 * neutral "Not Started" tones.
 */
export function typeVars(label: string | undefined) {
  if (!label) return statusVars('Not Started');
  if (label === 'Bug') return statusVars('Blocked');
  if (label === 'User Story' || label === 'Story') return statusVars('In Progress');
  if (label === 'Investigation') return statusVars('Under Review');
  return statusVars('Not Started');
}

/** Health-verdict styling, reusing the status color tokens. `tone` lets non-status
 *  consumers (charts) pick a color without re-deriving the mapping. */
export function verdictVars(v: HealthVerdict): { label: string; tone: 'ok' | 'risk' | 'muted'; dot: string; soft: string; text: string } {
  const map = {
    'on-track':     { label: 'On track',     tone: 'ok' as const,    status: 'Complete' as const },
    'at-risk':      { label: 'At risk',       tone: 'risk' as const,  status: 'Blocked' as const },
    'complete':     { label: 'Complete',      tone: 'ok' as const,    status: 'Complete' as const },
    'unconfigured': { label: 'Not assessed',  tone: 'muted' as const, status: 'Not Started' as const },
  }[v];
  return { label: map.label, tone: map.tone, ...statusVars(map.status) };
}
