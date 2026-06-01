// Date utilities — ported verbatim from proto-store.jsx. All dates are local
// "YYYY-MM-DD" ISO strings to avoid timezone drift.

import { SPRINT_COUNT, SPRINT_LEN_DAYS, type Sprint } from '../types';

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

// build 8 contiguous sprints from a release start date
export const buildSprints = (
  startISO: string,
  overrides: Record<number, number> = {},
): Sprint[] => {
  const arr: Sprint[] = [];
  for (let i = 0; i < SPRINT_COUNT; i++) {
    const n = i + 1;
    const s = addDays(startISO, i * SPRINT_LEN_DAYS);
    const e = addDays(s, SPRINT_LEN_DAYS - 1);
    arr.push({ n, name: `Sprint ${n}`, startISO: s, endISO: e, daysOff: overrides[n] || 0, externalId: null });
  }
  return arr;
};

let _seq = 1;
export const uid = (p: string): string => `${p}_${Date.now().toString(36)}_${(_seq++).toString(36)}`;
