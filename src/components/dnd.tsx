// Native HTML5 drag-and-drop of work items between sprints + the shared
// capacity meter. Ported from proto-dnd.jsx.

import { useEffect, useReducer, useState, type CSSProperties, type ReactNode } from 'react';
import type { Release, Sprint, Team, WorkItem } from '../types';
import { fmtShort } from '../lib/dates';
import { sprintVel } from '../lib/derive';
import { getActions } from '../store/store';
import { WF } from './tokens';

// ── external drag store so any drop target can react to an in-flight drag ──
const subs = new Set<() => void>();
let cur: WorkItem | null = null;
export const Drag = {
  start: (item: WorkItem) => {
    cur = item;
    subs.forEach((f) => f());
  },
  end: () => {
    if (cur) {
      cur = null;
      subs.forEach((f) => f());
    }
  },
  get: () => cur,
  sub: (f: () => void) => {
    subs.add(f);
    return () => {
      subs.delete(f);
    };
  },
};

export function useDrag(): WorkItem | null {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => Drag.sub(force), []);
  return Drag.get();
}

// ── planned-vs-capacity meter ───────────────────────────────────────────
export function CapacityMeter({ planned, cap, style }: { planned: number; cap: number; style?: CSSProperties }) {
  const over = planned > cap;
  const ratio = cap > 0 ? Math.min(planned / cap, 1) : planned > 0 ? 1 : 0;
  const overW = over && cap > 0 ? Math.min((planned - cap) / cap, 0.6) : 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, ...style }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
        <span className="mono" style={{ fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', color: over ? WF.status.Blocked.text : WF.t2 }}>
          {planned} / {cap}
        </span>
        <span
          style={{
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: '.04em',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            color: over ? WF.status.Blocked.text : WF.t3,
            marginLeft: 'auto',
          }}
        >
          {over ? `over by ${planned - cap}` : 'pts'}
        </span>
      </div>
      <div style={{ display: 'flex', height: 6, borderRadius: 4, overflow: 'hidden', background: WF.fill }}>
        <div style={{ flex: ratio, background: over ? WF.status.Blocked.dot : WF.status.Active.dot }} />
        {over ? <div style={{ flex: overW, background: WF.status.Blocked.text }} /> : <div style={{ flex: 1 - ratio }} />}
      </div>
    </div>
  );
}

// ── Sprint rail (Sprint view): switcher + drop targets to move an item ───
function SprintPill({
  sp,
  planned,
  cap,
  isCur,
  draggingItem,
  onGo,
  onDropItem,
}: {
  sp: Sprint;
  planned: number;
  cap: number;
  isCur: boolean;
  draggingItem: WorkItem | null;
  onGo: () => void;
  onDropItem: (it: WorkItem) => void;
}) {
  const [over, setOver] = useState(false);
  const canDropVisual = !!draggingItem && !isCur;
  return (
    <div
      onClick={() => !isCur && onGo()}
      onDragOver={(e) => {
        const it = Drag.get();
        if (it && !isCur) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          if (!over) setOver(true);
        }
      }}
      onDragLeave={() => {
        if (over) setOver(false);
      }}
      onDrop={(e) => {
        const it = Drag.get();
        if (it && !isCur) {
          e.preventDefault();
          onDropItem(it);
        }
        setOver(false);
        Drag.end();
      }}
      title={isCur ? 'Current sprint' : canDropVisual ? `Move ${draggingItem!.key} here` : `Go to ${sp.name}`}
      style={{
        flex: '1 0 150px',
        maxWidth: 280,
        cursor: isCur ? 'default' : 'pointer',
        padding: '7px 10px',
        borderRadius: 9,
        border: `1.5px ${canDropVisual ? 'dashed' : 'solid'} ${
          over ? WF.status.Active.text : isCur ? WF.status.Active.dot : canDropVisual ? WF.lineStrong : WF.line
        }`,
        background: over ? WF.status.Active.soft : isCur ? WF.status.Active.soft : WF.paper,
        display: 'flex',
        flexDirection: 'column',
        gap: 5,
        transition: 'border-color .12s, background .12s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
          {sp.name}
        </span>
        {isCur && (
          <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.06em', color: WF.status.Active.text, marginLeft: 'auto', flex: '0 0 auto' }}>
            HERE
          </span>
        )}
        {canDropVisual && (
          <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.06em', color: over ? WF.status.Active.text : WF.t3, marginLeft: 'auto', flex: '0 0 auto' }}>
            {over ? 'DROP' : 'MOVE'}
          </span>
        )}
      </div>
      <CapacityMeter planned={planned} cap={cap} />
    </div>
  );
}

export function SprintRail({
  release,
  currentSprintId,
  team,
  allItems,
  onGo,
  notify,
}: {
  release: Release;
  currentSprintId: string | null;
  team: Team | undefined;
  allItems: WorkItem[];
  onGo: (sprintId: string) => void;
  notify: (msg: string) => void;
}) {
  const draggingItem = useDrag();
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'stretch',
        gap: 8,
        padding: '10px 24px',
        borderBottom: `1.5px solid ${WF.line}`,
        background: WF.paper,
        overflowX: 'auto',
      }}
    >
      <span className="tag" style={{ alignSelf: 'center', flex: '0 0 auto' }}>
        Sprints
      </span>
      {release.sprints.map((sp) => {
        const planned = allItems.filter((i) => i.sprintId === sp.id).reduce((a, i) => a + i.points, 0);
        const cap = sprintVel(team, sp, sp.daysOff);
        return (
          <SprintPill
            key={sp.id}
            sp={sp}
            planned={planned}
            cap={cap}
            isCur={sp.id === currentSprintId}
            draggingItem={draggingItem}
            onGo={() => onGo(sp.id)}
            onDropItem={(it) => {
              if (it.sprintId !== sp.id) {
                getActions().updateItem(it.id, { sprintId: sp.id });
                notify(`Moved ${it.key} → ${sp.name}`);
              }
            }}
          />
        );
      })}
    </div>
  );
}

// ── Sprint column (Work Stream view): one sprint, drop target for this stream ─
export function StreamSprintColumn({
  sp,
  team,
  streamItems,
  allItems,
  isCur,
  notify,
  renderCard,
}: {
  sp: Sprint;
  team: Team | undefined;
  streamItems: WorkItem[];
  allItems: WorkItem[];
  isCur: boolean;
  notify: (msg: string) => void;
  renderCard: (it: WorkItem) => ReactNode;
}) {
  const draggingItem = useDrag();
  const [over, setOver] = useState(false);
  const planned = allItems.filter((i) => i.sprintId === sp.id).reduce((a, i) => a + i.points, 0);
  const cap = sprintVel(team, sp, sp.daysOff);
  const streamPts = streamItems.reduce((a, i) => a + i.points, 0);
  const canDropVisual = !!draggingItem && draggingItem.sprintId !== sp.id;
  return (
    <div style={{ flex: 1, minWidth: 158, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          padding: '8px 10px',
          borderRadius: 9,
          border: `1.5px solid ${isCur ? WF.status.Active.dot : WF.line}`,
          background: isCur ? WF.status.Active.soft : WF.paper,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontWeight: 750, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
            {sp.name}
          </span>
          {isCur && (
            <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.06em', color: WF.status.Active.text, marginLeft: 'auto', flex: '0 0 auto' }}>
              NOW
            </span>
          )}
        </div>
        <span style={{ fontSize: 10.5, color: WF.t3, whiteSpace: 'nowrap' }}>
          {fmtShort(sp.startISO)} – {fmtShort(sp.endISO)}
        </span>
        <CapacityMeter planned={planned} cap={cap} />
        <span style={{ fontSize: 10, color: WF.t3, whiteSpace: 'nowrap' }}>
          this stream · {streamPts} pts · {streamItems.length}
        </span>
      </div>
      <div
        onDragOver={(e) => {
          const it = Drag.get();
          if (it && it.sprintId !== sp.id) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (!over) setOver(true);
          }
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false);
        }}
        onDrop={(e) => {
          const it = Drag.get();
          if (it && it.sprintId !== sp.id) {
            e.preventDefault();
            getActions().updateItem(it.id, { sprintId: sp.id });
            notify(`Moved ${it.key} → ${sp.name}`);
          }
          setOver(false);
          Drag.end();
        }}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 9,
          flex: 1,
          minHeight: 64,
          borderRadius: 10,
          padding: over ? 6 : 0,
          outline: over ? `2px dashed ${WF.status.Active.dot}` : 'none',
          outlineOffset: -2,
          background: over ? WF.status.Active.soft : 'transparent',
          transition: 'background .12s',
        }}
      >
        {streamItems.map((it) => renderCard(it))}
        {streamItems.length === 0 && (
          <div className="card dash" style={{ padding: '16px 10px', textAlign: 'center', color: over ? WF.status.Active.text : WF.t3, fontSize: 11.5 }}>
            {canDropVisual ? 'Drop to move here' : 'No items'}
          </div>
        )}
      </div>
    </div>
  );
}
