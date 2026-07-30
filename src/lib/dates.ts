// Date utilities. All dates are local
// "YYYY-MM-DD" ISO strings to avoid timezone drift.

import { DEFAULT_SPRINT_COUNT, SPRINT_LEN_DAYS, type Sprint } from '../types';

const PMON = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** A Date to a local 'YYYY-MM-DD' string. Local, not UTC — toISOString() would
 *  shift the date across the dateline for anyone west of Greenwich. */
export const isoOf = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** 'YYYY-MM-DD' to a local Date at midnight. Parsed by hand rather than via
 *  `new Date(iso)`, which reads a bare date string as UTC. */
export const dOf = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** Shift an ISO date by `n` days (negative to go back), staying in local time. */
export const addDays = (iso: string, n: number): string => {
  const d = dOf(iso);
  d.setDate(d.getDate() + n);
  return isoOf(d);
};

/** 'Apr 13' — the app's default date rendering, used wherever the year is
 *  already implied by context. */
export const fmtShort = (iso: string): string => {
  const d = dOf(iso);
  return `${PMON[d.getMonth()]} ${d.getDate()}`;
};

/** 'Apr 13, 2026' — for dates that leave their context, e.g. the standalone
 *  summary viewer. */
export const fmtLong = (iso: string): string => {
  const d = dOf(iso);
  return `${PMON[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
};

/** Today as a local ISO date. Derivations take `today` as a parameter rather
 *  than calling this, so they stay pure and testable. */
export const todayISO = (): string => isoOf(new Date());

/** Now as a full ISO-8601 instant. Unlike every other date in the app — which is
 *  a bare local 'YYYY-MM-DD' — item timestamps carry a time of day, so they're
 *  stored as UTC instants and rendered in the reader's own zone. */
export const nowISO = (): string => new Date().toISOString();

/** 'Apr 13, 2026, 14:03' — an instant from {@link nowISO} (or a connector's
 *  createdAt/updatedAt) in the reader's local zone. Returns null for a null or
 *  unparseable input, so callers can fall back to an em dash rather than
 *  rendering 'Invalid Date' from whatever a backend sent. */
export const fmtDateTime = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${PMON[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}, ${hh}:${mm}`;
};

/** Whether `iso` falls within [a, b], inclusive at both ends — sprint ranges are
 *  inclusive of their end date. */
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
/** A locally-unique id with a type prefix ('sp', 'ws', 'it'). Time-based plus a
 *  counter, so ids stay unique within a session even inside one millisecond.
 *  Local only — connector entities are matched by externalId, never by this. */
export const uid = (p: string): string => `${p}_${Date.now().toString(36)}_${(_seq++).toString(36)}`;
