import type { Status } from '../types';
import type { HealthVerdict, RunwayVerdict } from '../lib/derive';

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

/** Health-verdict styling, reusing the status color tokens. `tone` lets non-status
 *  consumers (charts) pick a color without re-deriving the mapping. */
export function verdictVars(v: HealthVerdict): { label: string; tone: 'ok' | 'risk' | 'muted'; dot: string; soft: string; text: string } {
  const map = {
    'on-track':     { label: 'On track',     tone: 'ok' as const,    status: 'Complete' as const },
    'at-risk':      { label: 'At risk',       tone: 'risk' as const,  status: 'Blocked' as const },
    'complete':     { label: 'Complete',      tone: 'ok' as const,    status: 'Complete' as const },
    'unconfigured': { label: 'Not assessed',  tone: 'muted' as const, status: 'Not Started' as const },
    'unestimated':  { label: 'Unestimated',   tone: 'muted' as const, status: 'Not Started' as const },
  }[v];
  return { label: map.label, tone: map.tone, ...statusVars(map.status) };
}

/** Planning-runway verdict styling, reusing the status color tokens. The three
 *  un-judgeable verdicts read muted (a number you can't stand a green behind);
 *  under-planned reads as a risk tone; planned/complete read ok. */
export function runwayVars(v: RunwayVerdict): { label: string; tone: 'ok' | 'risk' | 'muted'; dot: string; soft: string; text: string } {
  const map = {
    'planned':        { label: 'Planned',        tone: 'ok' as const,    status: 'Complete' as const },
    'complete':       { label: 'Complete',       tone: 'ok' as const,    status: 'Complete' as const },
    'under-planned':  { label: 'Under-planned',  tone: 'risk' as const,  status: 'Blocked' as const },
    'unplanned':      { label: 'Unplanned',      tone: 'muted' as const, status: 'Not Started' as const },
    'unestimated':    { label: 'Unestimated',    tone: 'muted' as const, status: 'Not Started' as const },
    'unconfigured':   { label: 'Not assessed',   tone: 'muted' as const, status: 'Not Started' as const },
  }[v];
  return { label: map.label, tone: map.tone, ...statusVars(map.status) };
}
