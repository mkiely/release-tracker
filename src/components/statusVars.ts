import type { Status } from '../types';

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
