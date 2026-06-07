// Native HTML5 drag-and-drop of work items between sprints + the shared
// capacity meter.

import { useEffect, useReducer, useState, type CSSProperties, type ReactNode } from 'react';
import type { Release, Sprint, Team, WorkItem } from '../types';
import { fmtShort } from '../lib/dates';
import { sprintVel } from '../lib/derive';
import { getActions } from '../store/store';
import styles from './dnd.module.css';

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
    return () => { subs.delete(f); };
  },
};

export function useDrag(): WorkItem | null {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => Drag.sub(force), []);
  return Drag.get();
}

// Creates a styled key-badge ghost for table-row drag operations.
export function setDragGhost(e: React.DragEvent, text: string) {
  const cs = getComputedStyle(document.documentElement);
  const el = document.createElement('div');
  el.textContent = text;
  Object.assign(el.style, {
    position: 'fixed',
    top: '-100px',
    left: '-100px',
    background: cs.getPropertyValue('--rt-paper').trim() || '#fff',
    color: cs.getPropertyValue('--rt-ink').trim() || '#111',
    border: `1.5px solid ${cs.getPropertyValue('--rt-line').trim() || '#ddd'}`,
    borderRadius: '6px',
    padding: '5px 12px',
    fontFamily: cs.getPropertyValue('--rt-mono').trim() || 'ui-monospace,monospace',
    fontSize: '12.5px',
    fontWeight: '700',
    boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
    pointerEvents: 'none',
    whiteSpace: 'nowrap',
  });
  document.body.appendChild(el);
  e.dataTransfer.setDragImage(el, Math.round(el.offsetWidth / 2), Math.round(el.offsetHeight / 2));
  requestAnimationFrame(() => { el.parentNode?.removeChild(el); });
}

// ── planned-vs-capacity meter ───────────────────────────────────────────
export function CapacityMeter({ planned, cap, style }: { planned: number; cap: number; style?: CSSProperties }) {
  const over = planned > cap;
  const ratio = cap > 0 ? Math.min(planned / cap, 1) : planned > 0 ? 1 : 0;
  const overW = over && cap > 0 ? Math.min((planned - cap) / cap, 0.6) : 0;
  return (
    <div className={styles.capacityMeter} style={style}>
      <div className={styles.capNumbers}>
        <span className={`mono ${styles.capValue}`} data-over={over}>
          {planned} / {cap}
        </span>
        <span className={styles.capUnit} data-over={over}>
          {over ? `over by ${planned - cap}` : 'pts'}
        </span>
      </div>
      <div className={styles.capTrack}>
        <div className={over ? styles.capFillOver : styles.capFill} style={{ flex: ratio }} />
        {over ? <div className={styles.capOverflow} style={{ flex: overW }} /> : <div style={{ flex: 1 - ratio }} />}
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
  const canDrop = !!draggingItem && !isCur;
  return (
    <div
      className={styles.pill}
      data-cur={isCur}
      data-can-drop={canDrop}
      data-over={over}
      onClick={() => !isCur && onGo()}
      onDragOver={(e) => {
        const it = Drag.get();
        if (it && !isCur) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          if (!over) setOver(true);
        }
      }}
      onDragLeave={() => { if (over) setOver(false); }}
      onDrop={(e) => {
        const it = Drag.get();
        if (it && !isCur) { e.preventDefault(); onDropItem(it); }
        setOver(false);
        Drag.end();
      }}
      title={isCur ? 'Current sprint' : canDrop ? `Move ${draggingItem!.key} here` : `Go to ${sp.name}`}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span className={styles.pillName}>{sp.name}</span>
        {isCur && <span className={styles.pillBadge}>HERE</span>}
        {canDrop && (
          <span className={styles.pillBadgeDrop} data-over={over}>
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
    <div className={styles.rail}>
      <span className="tag" style={{ alignSelf: 'center', flex: '0 0 auto' }}>Sprints</span>
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
                getActions().moveItemToSprint(it.id, sp.id);
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
  const canDrop = !!draggingItem && draggingItem.sprintId !== sp.id;
  return (
    <div style={{ flex: 1, minWidth: 158, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className={styles.columnHeader} data-cur={isCur}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className={styles.columnHeaderName}>{sp.name}</span>
          {isCur && <span className={styles.columnHeaderNow}>NOW</span>}
        </div>
        <span className={styles.columnHeaderDates}>
          {fmtShort(sp.startISO)} – {fmtShort(sp.endISO)}
        </span>
        <CapacityMeter planned={planned} cap={cap} />
        <span className={styles.columnHeaderMeta}>
          this stream · {streamPts} pts · {streamItems.length}
        </span>
      </div>
      <div
        className={over ? `${styles.dropZone} ${styles.dropZoneOver}` : styles.dropZone}
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
            getActions().moveItemToSprint(it.id, sp.id);
            notify(`Moved ${it.key} → ${sp.name}`);
          }
          setOver(false);
          Drag.end();
        }}
      >
        {streamItems.map((it) => renderCard(it))}
        {streamItems.length === 0 && (
          <div className={`card dash ${over ? `${styles.emptyDrop} ${styles.emptyDropOver}` : styles.emptyDrop}`}>
            {canDrop ? 'Drop to move here' : 'No items'}
          </div>
        )}
      </div>
    </div>
  );
}
