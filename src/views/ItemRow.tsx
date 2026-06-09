import type { Member, WorkItem } from '../types';
import { Avatar } from '../components/Avatar';
import { StatusPill } from '../components/badges';
import { DirtyDot } from '../components/DirtyDot';
import { Drag, setDragGhost, useDrag } from '../components/dnd';
import { typeVars } from '../components/statusVars';
import styles from './SprintTable.module.css';

/**
 * One draggable work-item row in a table view (sprint or work-stream). The key
 * cell is the drag handle; `workStreamName` adds the optional Work Stream column
 * (used by the sprint view's "by status" grouping).
 */
export function ItemRow({
  item,
  members,
  workStreamName,
  onOpen,
}: {
  item: WorkItem;
  members: Member[];
  workStreamName?: string;
  onOpen: () => void;
}) {
  const assignee = item.assignedMemberId ? members.find((m) => m.id === item.assignedMemberId) : undefined;
  const tv = typeVars(item.itemType?.label);
  const dragging = useDrag();
  const isMe = dragging?.id === item.id;
  const isDirty = item.dirtyFields.length > 0;

  return (
    <div className={styles.itemRow} onClick={onOpen} style={isMe ? { opacity: 0.4 } : undefined}>
      <div
        className={styles.colKey}
        draggable
        style={{ cursor: 'grab', userSelect: 'none', WebkitUserSelect: 'none', display: 'flex', alignItems: 'center', gap: 5 }}
        onDragStart={(e) => {
          e.stopPropagation();
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', item.id);
          setDragGhost(e, item.key);
          Drag.start(item);
        }}
        onDragEnd={() => Drag.end()}
      >
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
      <div className={styles.colPts}>{item.points > 0 ? item.points : ''}</div>
      <div className={styles.colAssignee}>{assignee && <Avatar member={assignee} />}</div>
      <div className={styles.colStatus}>
        <StatusPill status={item.status} sm />
      </div>
      <div
        className={`${styles.colBuild}${item.build ? '' : ` ${styles.colBuildEmpty}`}`}
        title={item.build ?? undefined}
      >
        {item.build ?? '—'}
      </div>
      {workStreamName !== undefined && <div className={styles.colWorkStream}>{workStreamName}</div>}
      <div className={styles.colTitle}>{item.subject}</div>
    </div>
  );
}
