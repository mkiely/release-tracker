// Date utilities — ported verbatim from proto-store.jsx. All dates are local
// "YYYY-MM-DD" ISO strings to avoid timezone drift.

import { DEFAULT_SPRINT_COUNT, SPRINT_LEN_DAYS, type Sprint } from '../types';

const PMON = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export const isoOf = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const dOf = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const addDays = (iso: string, n: number): string => {
  const d = dOf(iso);
  d.setDate(d.getDate() + n);
  return isoOf(d);
};

export const fmtShort = (iso: string): string => {
  const d = dOf(iso);
  return `${PMON[d.getMonth()]} ${d.getDate()}`;
};

export const fmtLong = (iso: string): string => {
  const d = dOf(iso);
  return `${PMON[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
};

export const todayISO = (): string => isoOf(new Date());

export const between = (iso: string, a: string, b: string): boolean => {
  const t = dOf(iso).getTime();
  return t >= dOf(a).getTime() && t <= dOf(b).getTime();
};

// Count Mon–Fri business days within an inclusive date range. Used for capacity
// math on variable-length sprints (connector sprints aren't always 14 days).
export const workdaysInRange = (startISO: string, endISO: string): number => {
  let count = 0;
  const end = dOf(endISO);
  for (let d = dOf(startISO); d <= end; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
};

// build `count` contiguous fixed-length sprints from a release start date.
// `overrides` maps 1-based sprint position → person-days off. `lenDays` is the
// uniform calendar length of every sprint (chosen at release creation).
export const buildSprints = (
  startISO: string,
  overrides: Record<number, number> = {},
  count = DEFAULT_SPRINT_COUNT,
  lenDays = SPRINT_LEN_DAYS,
): Sprint[] => {
  const arr: Sprint[] = [];
  for (let i = 0; i < count; i++) {
    const n = i + 1;
    const s = addDays(startISO, i * lenDays);
    const e = addDays(s, lenDays - 1);
    arr.push({ id: uid('sp'), name: `Sprint ${n}`, startISO: s, endISO: e, daysOff: overrides[n] || 0, externalId: null, plannedVelocity: null });
  }
  return arr;
};

let _seq = 1;
export const uid = (p: string): string => `${p}_${Date.now().toString(36)}_${(_seq++).toString(36)}`;
