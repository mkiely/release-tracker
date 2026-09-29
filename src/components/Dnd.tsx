// Native HTML5 drag-and-drop of work items between sprints + the shared
// capacity meter.

import { useEffect, useReducer, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import type { Release, Sprint, Team, WorkItem } from '../types';
import { fmtShort } from '../lib/dates';
import { sprintVel, sumPoints, type EventChip } from '../lib/derive';
import { getActions } from '../store/store';
import { EventBadge } from './Badges';
import { capacityBar } from './capacityBar';
import styles from './Dnd.module.css';

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

/**
 * Everything a sprint needs to accept a dragged work item: the highlight state,
 * the four drag handlers, and the move itself.
 *
 * There were three copies of this — the sprint rail's pills, the work-stream
 * board's columns and the work-stream table's sprint bands — and they had drifted
 * on the one part that is genuinely hard to get right. Native drag fires bubbling
 * dragenter/dragleave for every child the pointer crosses, and reports a null
 * `relatedTarget` often enough that the obvious `currentTarget.contains(...)`
 * check flickers the highlight off mid-drop. Counting enters against leaves is
 * what actually holds, so that's what all three do now; before this, one of them
 * still ran the `contains()` version the others had already abandoned.
 *
 * Owning the move here is also what keeps `getActions` out of `views/`: a
 * presenter asks for a drop target and gets one, without reaching for the store.
 *
 * `canDrop` is for policy a sprint's identity can't express — the rail doubles as
 * a navigation control, so its pill for the sprint you're already on refuses the
 * drop. The "already in this sprint" case is guarded here for everyone.
 */
export function useSprintDropTarget(
  sprint: Sprint,
  notify: (msg: string) => void,
  canDrop?: (item: WorkItem) => boolean,
): {
  /** The pointer is over this target with a droppable item in hand. */
  over: boolean;
  /** A droppable drag is in flight — for affordances shown before the pointer
   *  arrives ("MOVE", "Drop to move here"). */
  active: boolean;
  handlers: React.HTMLAttributes<HTMLDivElement>;
} {
  const draggingItem = useDrag();
  const [over, setOver] = useState(false);
  const depth = useRef(0);

  const accepts = (item: WorkItem | null): item is WorkItem =>
    !!item && item.sprintId !== sprint.id && (canDrop?.(item) ?? true);

  // Reset when any drag ends — dropped elsewhere, or cancelled — so a stray enter
  // without a matching leave can't strand the highlight on.
  useEffect(() => {
    if (!draggingItem) {
      depth.current = 0;
      setOver(false);
    }
  }, [draggingItem]);

  return {
    over,
    active: accepts(draggingItem),
    handlers: {
      onDragEnter: (e) => {
        if (!accepts(Drag.get())) return;
        e.preventDefault();
        depth.current += 1;
        setOver(true);
      },
      onDragOver: (e) => {
        if (!accepts(Drag.get())) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setOver(true);
      },
      onDragLeave: () => {
        depth.current -= 1;
        if (depth.current <= 0) {
          depth.current = 0;
          setOver(false);
        }
      },
      onDrop: (e) => {
        const item = Drag.get();
        if (accepts(item)) {
          e.preventDefault();
          getActions().moveItemToSprint(item.id, sprint.id);
          notify(`Moved ${item.key} → ${sprint.name}`);
        }
        depth.current = 0;
        setOver(false);
        Drag.end();
      },
    },
  };
}

/**
 * Continuously scrolls `ref`'s element while a work-item drag is in flight and
 * the pointer is near its top/bottom edge. Native HTML5 auto-scroll only nudges
 * when the pointer keeps moving, so dragging an item to a far-off sprint in a
 * tall, vertically-scrolling list (the work-stream table) stalls at the edge.
 * A rAF loop reading the last drag pointer position scrolls even while the
 * pointer is held still, so far drop targets stay reachable.
 */
export function useDragAutoScroll(ref: RefObject<HTMLElement | null>) {
  const dragging = useDrag();
  const pointerY = useRef(0);
  useEffect(() => {
    const el = ref.current;
    if (!dragging || !el) return;
    let raf = 0;
    const MARGIN = 72; // px band at each edge where scrolling kicks in
    const MAX_SPEED = 16; // px per frame at the very edge
    const onDragOver = (e: DragEvent) => { pointerY.current = e.clientY; };
    const tick = () => {
      const rect = el.getBoundingClientRect();
      const y = pointerY.current;
      if (y > 0) {
        if (y < rect.top + MARGIN) {
          el.scrollTop -= ((rect.top + MARGIN - y) / MARGIN) * MAX_SPEED;
        } else if (y > rect.bottom - MARGIN) {
          el.scrollTop += ((y - (rect.bottom - MARGIN)) / MARGIN) * MAX_SPEED;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    document.addEventListener('dragover', onDragOver);
    raf = requestAnimationFrame(tick);
    return () => {
      document.removeEventListener('dragover', onDragOver);
      cancelAnimationFrame(raf);
    };
  }, [dragging, ref]);
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
// The numbers-above-track framing of the same reading CapBarInline draws inline;
// the arithmetic they share lives in capacityBar.
function CapacityMeter({ planned, cap, style }: { planned: number; cap: number; style?: CSSProperties }) {
  const { over, ratio, overW } = capacityBar(planned, cap);
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
  notify,
}: {
  sp: Sprint;
  planned: number;
  cap: number;
  isCur: boolean;
  draggingItem: WorkItem | null;
  onGo: () => void;
  notify: (msg: string) => void;
}) {
  // The rail is a navigation control as well as a drop target, so the pill for the
  // sprint you're already on takes you nowhere and accepts nothing.
  const { over, active: canDrop, handlers } = useSprintDropTarget(sp, notify, () => !isCur);
  return (
    <div
      className={styles.pill}
      data-cur={isCur}
      data-can-drop={canDrop}
      data-over={over}
      onClick={() => !isCur && onGo()}
      {...handlers}
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
        const planned = sumPoints(allItems.filter((i) => i.sprintId === sp.id));
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
            notify={notify}
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
  freezeChip,
  notify,
  renderCard,
}: {
  sp: Sprint;
  team: Team | undefined;
  streamItems: WorkItem[];
  allItems: WorkItem[];
  isCur: boolean;
  /** This stream's code-freeze marker, when its effective freeze falls in this sprint. */
  freezeChip?: EventChip | null;
  notify: (msg: string) => void;
  renderCard: (it: WorkItem) => ReactNode;
}) {
  const { over, active: canDrop, handlers } = useSprintDropTarget(sp, notify);
  const planned = sumPoints(allItems.filter((i) => i.sprintId === sp.id));
  const cap = sprintVel(team, sp, sp.daysOff);
  const streamPts = sumPoints(streamItems);
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
        {freezeChip && (
          <div style={{ alignSelf: 'flex-start' }}>
            <EventBadge date={fmtShort(freezeChip.dateISO)} critical>
              {freezeChip.label}
            </EventBadge>
          </div>
        )}
      </div>
      <div
        className={over ? `${styles.dropZone} ${styles.dropZoneOver}` : styles.dropZone}
        {...handlers}
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
