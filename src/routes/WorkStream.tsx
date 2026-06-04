// Work Stream view — a column per sprint for one stream, drag items between
// sprints, per-column capacity. Ported from WorkStreamScreen.

import { useNavigate, useParams } from 'react-router-dom';
import { activeSprint } from '../lib/derive';
import { selRelease, selItemsForStream, selTeam, useStore } from '../store/store';
import { useApp } from '../app-context';
import { NotFound, PushButton, SyncButton, TopBar } from '../components/chrome';
import { Icon } from '../components/Icon';
import { StreamSprintColumn } from '../components/dnd';
import { WorkItemCard } from '../components/WorkItemCard';
import { IconButton, PButton } from '../components/primitives';
import { WF } from '../components/tokens';

export function WorkStream() {
  const st = useStore();
  const navigate = useNavigate();
  const { openModal, onSync, onPush, notify } = useApp();
  const { id = '', wsId = '' } = useParams();
  const r = selRelease(st, id);
  const ws = r && r.workStreams.find((w) => w.id === wsId);
  if (!r || !ws) return <NotFound label="Work stream not found." />;
  const items = selItemsForStream(st, r.id, ws.id);
  const team = selTeam(st, r.teamId);
  const allItems = st.items.filter((i) => i.releaseId === r.id);
  const act = activeSprint(r);
  const curId = act ? act.id : null;
  const totalPts = items.reduce((a, i) => a + i.points, 0);

  return (
    <div className="wf wf-screen pt-root">
      <TopBar
        left={<IconButton icon={Icon.chevLeft} title="Back" onClick={() => navigate(`/releases/${id}`)} />}
        title={
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: WF.t3, marginBottom: 3, whiteSpace: 'nowrap' }}>
              <span className="pt-link" onClick={() => navigate(`/releases/${id}`)} style={{ cursor: 'pointer' }}>
                {r.name}
              </span>
              {Icon.chevRight}
              <span style={{ fontWeight: 600, color: WF.t2 }}>Work stream</span>
            </div>
            <div style={{ fontSize: 19, fontWeight: 750, letterSpacing: '-0.02em', lineHeight: 1, whiteSpace: 'nowrap' }}>{ws.name}</div>
          </>
        }
        right={
          <>
            <span style={{ fontSize: 12.5, color: WF.t3 }}>
              {items.length} items · {totalPts} pts · drag cards between sprints
            </span>
            <PushButton release={r} onPush={() => onPush(id)} />
            <SyncButton release={r} onSync={() => onSync(id)} />
            <PButton sm icon={Icon.plus} onClick={() => openModal({ type: 'item', releaseId: id, presetStreamId: ws.id })}>
              New work item
            </PButton>
          </>
        }
      />

      <div style={{ flex: 1, overflow: 'auto', padding: '18px 24px' }}>
        {items.length === 0 ? (
          <div className="wf-card wf-dash" style={{ padding: 40, textAlign: 'center', color: WF.t3, fontSize: 14 }}>
            No work items yet. Create one to get started.
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 14, alignItems: 'stretch', minHeight: '100%' }}>
            {r.sprints.map((sp) => (
              <StreamSprintColumn
                key={sp.id}
                sp={sp}
                team={team}
                isCur={sp.id === curId}
                streamItems={items.filter((i) => i.sprintId === sp.id)}
                allItems={allItems}
                notify={notify}
                renderCard={(it) => (
                  <WorkItemCard key={it.id} it={it} releaseTeamId={r.teamId} draggable onOpen={() => openModal({ type: 'itemDetail', itemId: it.id })} />
                )}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
