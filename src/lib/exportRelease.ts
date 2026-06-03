// Release → tab-delimited (TSV) export for pasting into Google Sheets.
//
// Layout: rows grouped by work stream, columns per sprint. Each work item is a
// truncated "KEY Subject" cell. When a work stream has multiple items in the
// same sprint, items stack into extra rows (the work-stream label appears once,
// then blank on continuation rows) so every cell holds at most one item and the
// output pastes cleanly without quoted/multi-line fields.

import type { AppState, WorkItem } from '../types';
import { fmtShort } from './dates';
import { eventsIn, sprintVel } from './derive';

const TAB = '\t';

// Strip tabs/newlines so a field can't break the row/column grid.
const cell = (s: string): string => s.replace(/[\t\r\n]+/g, ' ').trim();

const itemLabel = (it: WorkItem): string => cell(`${it.key} ${it.subject}`);

/**
 * Build a TSV string for a release: a header row (`Work Stream` + sprint names)
 * followed by per-work-stream rows. Returns '' if the release is not found.
 */
export function releaseToTSV(state: AppState, releaseId: string): string {
  const release = state.releases.find((r) => r.id === releaseId);
  if (!release) return '';

  const team = state.teams.find((t) => t.id === release.teamId);
  const sprints = [...release.sprints].sort((a, b) => a.startISO.localeCompare(b.startISO));
  const rows: string[][] = [
    ['Work Stream', ...sprints.map((s) => cell(s.name))],
    ['Dates', ...sprints.map((s) => `${fmtShort(s.startISO)} – ${fmtShort(s.endISO)}`)],
    ['Days off', ...sprints.map((s) => String(s.daysOff))],
    ['Events', ...sprints.map((s) => cell(eventsIn(release, s).map((e) => `${e.label} (${fmtShort(e.dateISO)})`).join('; ')))],
    ['Capacity', ...sprints.map((s) => String(sprintVel(team, s, s.daysOff)))],
    ['Planned', ...sprints.map((s) => String(state.items.filter((i) => i.releaseId === releaseId && i.sprintId === s.id).reduce((sum, i) => sum + i.points, 0)))],
  ];

  for (const ws of release.workStreams) {
    // group this stream's items by sprint, sorted within a cell by key
    const bySprint = new Map<string, WorkItem[]>(sprints.map((s) => [s.id, []]));
    for (const it of state.items) {
      if (it.releaseId !== releaseId || it.workStreamId !== ws.id) continue;
      if (it.sprintId !== null) bySprint.get(it.sprintId)?.push(it);
    }
    for (const arr of bySprint.values()) {
      arr.sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
    }

    // one row per item depth; at least one row so empty streams still show
    const depth = Math.max(1, ...sprints.map((s) => bySprint.get(s.id)!.length));
    for (let r = 0; r < depth; r++) {
      const row = [r === 0 ? cell(ws.name) : ''];
      for (const s of sprints) {
        const it = bySprint.get(s.id)![r];
        row.push(it ? itemLabel(it) : '');
      }
      rows.push(row);
    }
  }

  return rows.map((r) => r.join(TAB)).join('\n');
}
