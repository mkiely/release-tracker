import type { Member, WorkItem } from '../types';
import { Avatar } from '../components/Avatar';
import { StatusPill } from '../components/badges';
import { DirtyDot } from '../components/DirtyDot';
import { Drag, setDragGhost, useDrag } from '../components/dnd';
import type { AttrColumn } from '../components/fields/columns';
import { StreamChip } from '../components/StreamChip';
import { typeVars } from '../components/typeColor';
import styles from './SprintTable.module.css';

/**
 * One draggable work-item row in a table view (sprint or work-stream). The whole
 * row is the drag handle (not just the key cell) — a narrower handle made drags
 * inconsistent to initiate, since a mousedown landing anywhere else in the row's
 * generous hit area just fell through to the row's click-to-open instead. Native
 * drag/click disambiguation (movement threshold before dragstart fires) means the
 * row's onClick still works normally for a plain click. `workStream` adds the
 * optional Work Stream column (used by the sprint view's "by status" grouping);
 * `attrColumns` adds the release's vocabulary columns (declared by the connector
 * catalog, not the app).
 */
export function ItemRow({
  item,
  members,
  workStream,
  sprintName,
  attrColumns = [],
  onOpen,
}: {
  item: WorkItem;
  members: Member[];
  workStream?: { id: string | null; name: string };
  sprintName?: string;
  attrColumns?: AttrColumn[];
  onOpen: () => void;
}) {
  const assignee = item.assignedMemberId ? members.find((m) => m.id === item.assignedMemberId) : undefined;
  const tv = typeVars(item.itemType?.label);
  const dragging = useDrag();
  const isMe = dragging?.id === item.id;
  const isDirty = item.dirtyFields.length > 0;

  return (
    <div
      className={styles.itemRow}
      draggable
      onClick={onOpen}
      style={isMe ? { opacity: 0.4, cursor: 'grab' } : { cursor: 'grab' }}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', item.id);
        setDragGhost(e, item.key);
        Drag.start(item);
      }}
      onDragEnd={() => Drag.end()}
    >
      <div className={styles.colKey} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.key}</span>
        {isDirty && <DirtyDot />}
      </div>
      <div className={styles.colType}>
        {item.itemType && (
          <span className={styles.typeChip} style={{ borderColor: tv.dot, color: tv.text, background: tv.soft }}>
            {item.itemType.label}
          </span>
        )}
      </div>
      <div className={styles.colPts}>{item.points ? item.points : ''}</div>
      <div className={styles.colAssignee}>{assignee && <Avatar member={assignee} />}</div>
      <div className={styles.colStatus}>
        <StatusPill status={item.status} sm label={item.statusNative?.label} />
      </div>
      <div
        className={`${styles.colBuild}${item.build ? '' : ` ${styles.colBuildEmpty}`}`}
        title={item.build ?? undefined}
      >
        {item.build ?? '—'}
      </div>
      {attrColumns.map((c) => {
        const text = c.cell(item);
        return (
          <div key={c.key} className={`${styles.colAttr}${text && text !== '—' ? '' : ` ${styles.colAttrEmpty}`}`} title={text || undefined}>
            {text}
          </div>
        );
      })}
      {sprintName !== undefined && <div className={styles.colSprint}>{sprintName}</div>}
      {workStream !== undefined && (
        <div className={styles.colWorkStream}>
          <StreamChip workStreamId={workStream.id} label={workStream.name} />
        </div>
      )}
      <div className={styles.colTitle}>{item.subject}</div>
    </div>
  );
}
