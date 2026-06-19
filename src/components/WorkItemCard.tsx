import type { Status, WorkItem } from '../types';
import { STATUSES } from '../types';
import { getActions, selRelease, selTeam, useStore } from '../store/store';
import { Drag, useDrag } from './dnd';
import { DirtyDot } from './DirtyDot';
import { Icon } from './Icon';
import { statusVars } from './statusVars';
import styles from './WorkItemCard.module.css';

// inline status chip that doubles as a select. `label` overrides the displayed
// text (an item's native workflow state); colors stay keyed to the category.
export function StatusSelect({ value, onChange, disabled, label }: { value: Status; onChange: (v: Status) => void; disabled?: boolean; label?: string }) {
  const { soft, text, dot } = statusVars(value);
  return (
    <div style={{ position: 'relative', alignSelf: 'center' }} onClick={(e) => e.stopPropagation()}>
      <span className="chip" style={{ background: soft, color: text, paddingRight: disabled ? 9 : 22 }}>
        <span className="dot" style={{ background: dot }} />
        {label ?? value}
        {!disabled && <span style={{ position: 'absolute', right: 7, color: text, display: 'flex' }}>{Icon.chevDown}</span>}
      </span>
      {!disabled && (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value as Status)}
          style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%' }}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function MemberAvatar({ name, size = 40 }: { name: string; size?: number }) {
  const initials = name.trim().split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  return (
    <span
      title={name}
      className={styles.memberAvatar}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {initials}
    </span>
  );
}

// shared clickable work-item card (opens detail/edit modal). When `draggable`,
// it can be picked up and dropped onto another sprint.
export function WorkItemCard({
  it,
  releaseTeamId,
  onOpen,
  draggable,
}: {
  it: WorkItem;
  releaseTeamId?: string;
  onOpen: () => void;
  draggable?: boolean;
}) {
  const dragging = useDrag();
  const isMe = !!draggable && !!dragging && dragging.id === it.id;
  const team = useStore((s) => selTeam(s, releaseTeamId));
  const release = useStore((s) => selRelease(s, it.releaseId));
  const assignedMember = team?.members.find((m) => m.id === it.assignedMemberId) ?? null;
  const isDirty = it.dirtyFields.length > 0;
  const statusReadOnly = !!it.externalId || !!release?.connector;

  const cls = ['card', styles.item, draggable && styles.draggable, isMe && styles.dragging]
    .filter(Boolean).join(' ');

  return (
    <div
      className={cls}
      onClick={onOpen}
      draggable={draggable || undefined}
      onDragStart={
        draggable
          ? (e) => {
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', it.id);
              Drag.start(it);
            }
          : undefined
      }
      onDragEnd={draggable ? () => Drag.end() : undefined}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="mono" style={{ fontSize: 'var(--rt-fs-sm)', fontWeight: 'var(--rt-fw-bold)', color: 'var(--rt-t2)' }}>
          {it.key}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {isDirty && <DirtyDot />}
          {!!it.points && <span className="pts">{it.points} pts</span>}
        </div>
      </div>
      <div
        style={{
          fontSize: 'var(--rt-fs-md)',
          fontWeight: 'var(--rt-fw-semibold)',
          lineHeight: 'var(--rt-lh-snug)',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          minHeight: 37,
        }}
      >
        {it.subject}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <StatusSelect value={it.status} label={it.statusNative?.label} disabled={statusReadOnly} onChange={(v) => getActions().updateItem(it.id, { status: v })} />
        {assignedMember ? (
          <MemberAvatar name={assignedMember.name} size={32} />
        ) : (
          <span
            title="Unassigned"
            className={styles.unassigned}
            style={{ width: 32, height: 32 }}
          >
            {Icon.member}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
        {it.itemType && (
          <span title={`Type: ${it.itemType.label}`} className={styles.metaChip} style={{ color: 'var(--rt-t2)' }}>
            <span className={styles.metaChipDot} style={{ background: 'var(--rt-t2)' }} />
            {it.itemType.label}
          </span>
        )}
        {it.build ? (
          <span title={`Build: ${it.build}`} className={styles.metaChip} style={{ color: 'var(--rt-t3)' }}>
            <span className={styles.metaChipSquare} style={{ background: 'var(--rt-t3)' }} />
            {it.build}
          </span>
        ) : (
          <span title="No build associated — this should be set by the connector" className={styles.noBuildChip}>
            <span className={styles.noBuildChipSquare} />
            No Set Build
          </span>
        )}
      </div>
    </div>
  );
}
