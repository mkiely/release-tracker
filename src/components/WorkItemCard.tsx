// WorkItemCard + StatusSelect — ported from proto-app.jsx.

import type { Status, WorkItem } from '../types';
import { STATUSES } from '../types';
import { getActions, selRelease, selTeam, useStore } from '../store/store';
import { Drag, useDrag } from './dnd';
import { Icon } from './Icon';
import { WF } from './tokens';

// inline status chip that doubles as a select
export function StatusSelect({ value, onChange, disabled }: { value: Status; onChange: (v: Status) => void; disabled?: boolean }) {
  const c = WF.status[value];
  return (
    <div style={{ position: 'relative', alignSelf: 'center' }} onClick={(e) => e.stopPropagation()}>
      <span className="wf-chip" style={{ background: c.soft, color: c.text, paddingRight: disabled ? 9 : 22 }}>
        <span className="wf-dot" style={{ background: c.dot }} />
        {value}
        {!disabled && <span style={{ position: 'absolute', right: 7, color: c.text, display: 'flex' }}>{Icon.chevDown}</span>}
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

/** Compact initials avatar for a member name. */
function MemberAvatar({ name, size = 40 }: { name: string; size?: number }) {
  const initials = name.trim().split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  return (
    <span
      title={name}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: WF.fill,
        border: `1.5px solid ${WF.line}`,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.42,
        fontWeight: 700,
        color: WF.t2,
        flexShrink: 0,
        letterSpacing: '-0.02em',
      }}
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

  return (
    <div
      className="wf-card"
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
      style={{
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 9,
        cursor: draggable ? 'grab' : 'pointer',
        opacity: isMe ? 0.4 : 1,
        transition: 'border-color .12s, box-shadow .12s, opacity .12s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = WF.lineStrong;
        e.currentTarget.style.boxShadow = '0 2px 0 ' + WF.line;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = WF.line;
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="wf-mono" style={{ fontSize: 12.5, fontWeight: 700, color: WF.t2 }}>
          {it.key}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {isDirty && (
            <span
              title="Modified — pending push"
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: WF.status.Active.dot,
                flexShrink: 0,
              }}
            />
          )}
          <span className="wf-pts">{it.points} pts</span>
        </div>
      </div>
      <div
        style={{
          fontSize: 14.5,
          fontWeight: 600,
          lineHeight: 1.3,
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
        <StatusSelect value={it.status} disabled={statusReadOnly} onChange={(v) => getActions().updateItem(it.id, { status: v })} />
        {assignedMember ? (
          <MemberAvatar name={assignedMember.name} size={32} />
        ) : (
          <span
            title="Unassigned"
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              border: `1.5px dashed ${WF.line}`,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: WF.line,
              flexShrink: 0,
            }}
          >
            {Icon.member}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
        {it.build ? (
          <span
            title={`Build: ${it.build}`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 10.5, fontWeight: 600, color: WF.t3,
              background: WF.fill, border: `1px solid ${WF.line}`,
              borderRadius: 4, padding: '1px 6px',
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ width: 5, height: 5, borderRadius: 1, background: WF.t3, flexShrink: 0 }} />
            {it.build}
          </span>
        ) : (
          <span
            title="No build associated — this should be set by the connector"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 10.5, fontWeight: 600, color: WF.t3,
              background: 'transparent', border: `1px dashed ${WF.line}`,
              borderRadius: 4, padding: '1px 6px',
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ width: 5, height: 5, borderRadius: 1, border: `1px solid ${WF.t3}`, flexShrink: 0 }} />
            No Set Build
          </span>
        )}
      </div>
    </div>
  );
}
