// Consolidated release metrics surface. Gathers the three release-level metrics
// that used to live in scattered chips/modals into one tabbed modal:
//   · Velocity   — backward attainment (delivered vs. planned) + the safe Apply.
//   · Capacity   — team allocation / over-allocation explainer.
//   · Runway     — forward planning-runway (is enough work created to fill held
//                  capacity?), per stream, with the proactive-creation alarm.
// Backward attainment + forward runway are the spine; capacity sits between them.
// See docs/metrics.md (Phase 4).

import { useState, type ReactNode } from 'react';
import type { Release, Team, WorkItem } from '../types';
import { todayISO } from '../lib/dates';
import {
  releaseCapacity,
  streamCapacityCtx,
  streamContention,
  streamHealth,
  streamRunway,
  velocityAttainment,
  velocitySuggestion,
} from '../lib/derive';
import { getActions, selRelease, selTeam, useStore } from '../store/store';
import { useApp } from '../app-context';
import { Icon } from '../components/Icon';
import { Modal, PButton } from '../components/primitives';
import { SegmentedToggle } from '../components/SegmentedToggle';
import { VelocityTrendChart } from '../components/trend';
import { RunwayBadge } from '../components/VerdictLine';
import { statusVars } from '../components/statusVars';
import { Row } from './modals';

export type MetricsSection = 'velocity' | 'capacity' | 'runway';

interface SectionProps {
  r: Release;
  team: Team | undefined;
  items: WorkItem[];
}

// ── Velocity attainment (backward) ──────────────────────────────────────
function VelocitySection({ r, team, items }: SectionProps) {
  const { notify } = useApp();
  const v = velocityAttainment(r, team, items);
  const suggestion = velocitySuggestion(r, team, items);
  const under = v.verdict === 'under';
  const none = v.verdict === 'none';
  const tone = statusVars(under ? 'Blocked' : 'Complete');

  // Applying is safe only because started sprints carry a frozen plannedVelocity
  // baseline (docs/metrics.md): lowering team.velocity moves future sprints but
  // never rewrites the elapsed/active attainment this suggestion came from.
  const onApply = () => {
    if (!suggestion || !r.teamId) return;
    getActions().updateTeam(r.teamId, { velocity: suggestion.recentAvg });
    notify(`Team velocity set to ${suggestion.recentAvg} pts — started sprints keep their baselines`);
  };

  if (none) {
    return (
      <div className="card dash" style={{ padding: '18px 16px', color: 'var(--rt-t3)', fontSize: 'var(--rt-fs-sm)', lineHeight: 1.5 }}>
        No sprint has fully elapsed yet — attainment appears once the first sprint ends.
      </div>
    );
  }

  return (
    <>
      <div style={{ fontSize: 'var(--rt-fs-md)', color: 'var(--rt-t2)', lineHeight: 1.5 }}>
        The team delivered <strong style={{ color: tone.dot }}>{v.totalActual}</strong> of{' '}
        <strong>{v.totalPlanned}</strong> planned points across {v.perSprint.length} elapsed sprint
        {v.perSprint.length !== 1 ? 's' : ''} — {under ? 'below' : 'meeting'} the set velocity (
        <strong style={{ color: tone.dot }}>{v.attainmentPct}%</strong>).
      </div>

      {suggestion && suggestion.meaningful && (
        <div className="card" style={{ background: 'var(--rt-bg)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span className="tag">Suggestion</span>
          <div style={{ fontSize: 'var(--rt-fs-sm)', color: 'var(--rt-t2)', lineHeight: 1.5 }}>
            The last {suggestion.sampleSize} sprint{suggestion.sampleSize !== 1 ? 's' : ''} delivered{' '}
            ~<strong>{suggestion.recentAvg}</strong> pts on average against a set velocity of{' '}
            <strong>{suggestion.currentVelocity}</strong> — consider {suggestion.delta < 0 ? 'lowering' : 'raising'} it.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <PButton sm onClick={onApply} disabled={!r.teamId}>
              Set velocity to {suggestion.recentAvg}
            </PButton>
            <span style={{ fontSize: 'var(--rt-fs-micro)', color: 'var(--rt-t3)', lineHeight: 1.4 }}>
              Affects only sprints not yet started; elapsed and active sprints keep their frozen
              baselines, so attainment history is unchanged.
            </span>
          </div>
        </div>
      )}

      <div className="card" style={{ background: 'var(--rt-bg)', padding: '14px 14px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span className="tag">Delivered vs. planned per sprint</span>
        <VelocityTrendChart
          series={v.perSprint.map((s) => ({ label: s.sprint.name.replace(/^Sprint\s*/i, 'S'), planned: s.planned, actual: s.actual }))}
          tone={under ? 'under' : 'ok'}
        />
        <span style={{ fontSize: 'var(--rt-fs-micro)', color: 'var(--rt-t3)', lineHeight: 1.4 }}>
          Faint bars are each sprint's planned velocity (capacity-adjusted); the bold bars + line are points completed.
          Only fully-elapsed sprints are counted.
        </span>
      </div>

      <div className="card" style={{ background: 'var(--rt-bg)', padding: '15px 16px', display: 'flex', flexDirection: 'column', gap: 9 }}>
        <span className="tag" style={{ marginBottom: 2 }}>By sprint</span>
        {v.perSprint.map((s) => {
          const pct = s.planned > 0 ? Math.round((s.actual / s.planned) * 100) : null;
          return <Row key={s.sprint.id} k={s.sprint.name} v={`${s.actual} / ${s.planned} pts${pct !== null ? ` · ${pct}%` : ''}`} />;
        })}
        <hr className="divider" style={{ margin: '3px 0' }} />
        <Row k="Total" v={`${v.totalActual} / ${v.totalPlanned} pts · ${v.attainmentPct}%`} big />
      </div>
    </>
  );
}

// ── Capacity / allocations ──────────────────────────────────────────────
function CapacitySection({ r, team, items }: SectionProps) {
  const { openModal } = useApp();
  const ctx = releaseCapacity(r, team);

  // Streams with remaining work and a declared engineer need — the ones whose
  // demand is checked against the team's contributing headcount below.
  const active = r.workStreams
    .map((ws) => ({ ws, remainingPts: streamHealth(items.filter((i) => i.workStreamId === ws.id)).remainingPts }))
    .filter((s) => s.ws.engineersRequired != null && s.remainingPts > 0)
    .sort((a, b) => (b.ws.engineersRequired ?? 0) - (a.ws.engineersRequired ?? 0));

  const contention = streamContention(active.map((s) => s.ws.engineersRequired!), ctx.contributingCount);
  const over = contention.totalRequired - ctx.contributingCount;
  const isOver = contention.overAllocated;
  const headroom = ctx.contributingCount - contention.totalRequired;

  return (
    <>
      <div style={{ fontSize: 'var(--rt-fs-md)', color: 'var(--rt-t2)', lineHeight: 1.5 }}>
        {isOver ? (
          <>
            The active work streams collectively ask for <strong style={{ color: 'var(--rt-ink)' }}>{contention.totalRequired} engineers</strong>, but{' '}
            {team ? team.name : 'the team'} has only <strong style={{ color: 'var(--rt-ink)' }}>{ctx.contributingCount} contributing</strong>
            {over > 0 ? <> — over by <strong style={{ color: 'var(--rt-ink)' }}>{over}</strong>.</> : '.'} Everyone can't be on everything at once, so
            each stream's <em>effective</em> staffing is scaled down and its forecast reflects that contention.
          </>
        ) : (
          <>
            The active work streams collectively ask for{' '}
            <strong style={{ color: 'var(--rt-ink)' }}>{contention.totalRequired} engineer{contention.totalRequired === 1 ? '' : 's'}</strong>, and{' '}
            {team ? team.name : 'the team'} has <strong style={{ color: 'var(--rt-ink)' }}>{ctx.contributingCount} contributing</strong>
            {headroom > 0 ? <> — <strong style={{ color: 'var(--rt-ink)' }}>{headroom}</strong> to spare.</> : ' — fully allocated, with no contention.'} Each
            stream can be staffed at its full request.
          </>
        )}
      </div>

      <div className="card" style={{ background: 'var(--rt-bg)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 9 }}>
        <span className="tag" style={{ marginBottom: 2 }}>Engineers requested · active streams</span>
        {active.length === 0 ? (
          <span style={{ fontSize: 'var(--rt-fs-sm)', color: 'var(--rt-t3)' }}>No active streams have a configured engineer requirement.</span>
        ) : (
          active.map((s) => <Row key={s.ws.id} k={s.ws.name} v={`${s.ws.engineersRequired} eng · ${s.remainingPts} pts left`} />)
        )}
        <hr className="divider" style={{ margin: '3px 0' }} />
        <Row k="Total requested" v={`${contention.totalRequired} eng`} />
      </div>

      <div className="card" style={{ background: 'var(--rt-bg)', padding: '15px 16px', display: 'flex', flexDirection: 'column', gap: 9 }}>
        <span className="tag" style={{ marginBottom: 2 }}>The math</span>
        <Row k="Engineers available" v={`${ctx.contributingCount} contributing`} />
        <Row k="Engineers requested" v={`${contention.totalRequired}`} />
        {isOver ? (
          <>
            <Row k="Allocation factor" v={`${ctx.contributingCount} ÷ ${contention.totalRequired} = ×${contention.scale.toFixed(2)}`} />
            <hr className="divider" style={{ margin: '3px 0' }} />
            <Row k="Effect" v={`each stream runs at ${Math.round(contention.scale * 100)}% staffing`} big />
          </>
        ) : (
          <>
            <hr className="divider" style={{ margin: '3px 0' }} />
            <Row k="Headroom" v={headroom > 0 ? `${headroom} eng` : 'none'} big />
          </>
        )}
      </div>

      <div style={{ fontSize: 'var(--rt-fs-sm)', color: 'var(--rt-t3)', lineHeight: 1.5 }}>
        {isOver
          ? "To clear the over-allocation, lower some streams' engineers required, add contributing team members, or move work out of the release."
          : 'Open any stream to see its individual capacity-fit detail.'}
      </div>

      {team && (
        <PButton variant="subtle" onClick={() => openModal({ type: 'team', teamId: team.id })} style={{ alignSelf: 'flex-start' }}>
          {Icon.team} View team
        </PButton>
      )}
    </>
  );
}

// ── Planning runway (forward) ───────────────────────────────────────────
/** One runway verdict per work stream. Shared by the Runway section and the
 *  modal's tab-warning check so the alarm logic lives in one place. */
function buildRunwayRows(r: Release, team: Team | undefined, items: WorkItem[]) {
  const ctx = releaseCapacity(r, team);
  const today = todayISO();
  const firstRemainingIndex = r.sprints.findIndex((sp) => sp.endISO >= today);
  const beyondNextThreshold = (firstRemainingIndex < 0 ? r.sprints.length : firstRemainingIndex) + 2;
  const sprintIndexById = new Map(r.sprints.map((sp, i) => [sp.id, i] as const));
  const healthByWs = new Map(r.workStreams.map((ws) => [ws.id, streamHealth(items.filter((i) => i.workStreamId === ws.id))] as const));
  // Release-level contention so the runway capacity matches the at-risk forecast's
  // effective capacity (one baseline → no at-risk/under-planned contradiction).
  const contention = streamContention(
    r.workStreams.filter((ws) => ws.engineersRequired != null && healthByWs.get(ws.id)!.remainingPts > 0).map((ws) => ws.engineersRequired!),
    ctx.contributingCount,
  );
  return r.workStreams.map((ws) => {
    const streamItems = items.filter((i) => i.workStreamId === ws.id);
    const health = healthByWs.get(ws.id)!;
    const itemsBeyondNext = streamItems.filter(
      (i) => i.status !== 'Complete' && i.sprintId != null && (sprintIndexById.get(i.sprintId) ?? -1) >= beyondNextThreshold,
    ).length;
    // Honor a stream's own code-freeze override so its runway matches the overview
    // row and the health modal (all three route through streamCapacityCtx).
    const streamCtx = streamCapacityCtx(r, team, ws, ctx, today);
    return { ws, runway: streamRunway(health, ws.engineersRequired, streamCtx, contention, { itemsBeyondNext, muted: ws.planningMuted }) };
  });
}

function RunwaySection({ r, team, items }: SectionProps) {
  const { openModal } = useApp();
  const rows = buildRunwayRows(r, team, items);

  // Order by urgency: alarms first, then other under-planned, then the rest.
  const rank = (x: (typeof rows)[number]) => (x.runway.alarm ? 0 : x.runway.verdict === 'under-planned' ? 1 : 2);
  const ordered = [...rows].sort((a, b) => rank(a) - rank(b));
  const alarms = rows.filter((x) => x.runway.alarm).length;
  const alertTone = statusVars('Blocked');

  return (
    <>
      <div style={{ fontSize: 'var(--rt-fs-md)', color: 'var(--rt-t2)', lineHeight: 1.5 }}>
        Forward planning health: is enough work <em>created</em> to fill the capacity each stream is holding for the
        remaining sprints? A large unclaimed runway means a stream is under-planned — and, until work is created, can't be
        measured at all.
      </div>

      {alarms > 0 && (
        <div className="card" style={{ background: alertTone.soft, border: `1.5px solid ${alertTone.soft}`, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={{ display: 'inline-flex', color: alertTone.text }}>{Icon.alert}</span>
          <span style={{ fontSize: 'var(--rt-fs-sm)', color: alertTone.text, lineHeight: 1.45 }}>
            {alarms} stream{alarms === 1 ? '' : 's'} {alarms === 1 ? 'holds' : 'hold'} capacity but {alarms === 1 ? 'has' : 'have'} nothing created beyond the next sprint.
          </span>
        </div>
      )}

      <div className="card" style={{ background: 'var(--rt-bg)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span className="tag" style={{ marginBottom: 4 }}>Per-stream planning runway</span>
        {ordered.length === 0 ? (
          <span style={{ fontSize: 'var(--rt-fs-sm)', color: 'var(--rt-t3)' }}>No work streams yet.</span>
        ) : (
          ordered.map(({ ws, runway }) => (
            <button
              key={ws.id}
              type="button"
              onClick={() => openModal({ type: 'stream', releaseId: r.id, wsId: ws.id })}
              title="Edit this stream — set engineers required or mute its alarm"
              style={{
                appearance: 'none', background: 'transparent', border: 'none', textAlign: 'left', cursor: 'pointer',
                display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 4px',
                borderBottom: '1px solid var(--rt-line)',
              }}
            >
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 'var(--rt-fs-sm)', fontWeight: 'var(--rt-fw-semibold)', color: 'var(--rt-ink)' }}>{ws.name}</span>
                  <RunwayBadge verdict={runway.verdict} />
                  {ws.planningMuted && (
                    <span className="tag" style={{ fontSize: 'var(--rt-fs-micro)', color: 'var(--rt-t3)' }}>muted</span>
                  )}
                </span>
                <span style={{ fontSize: 'var(--rt-fs-xs)', color: runway.alarm ? alertTone.text : 'var(--rt-t3)', lineHeight: 1.4 }}>
                  {runway.summary}
                </span>
              </div>
              <span style={{ display: 'inline-flex', color: 'var(--rt-t3)', flexShrink: 0, marginTop: 2 }}>{Icon.chevRight}</span>
            </button>
          ))
        )}
      </div>

      <div style={{ fontSize: 'var(--rt-fs-sm)', color: 'var(--rt-t3)', lineHeight: 1.5 }}>
        Reserved capacity = engineers required × per-engineer velocity over the remaining sprints. A stream with no items, no
        estimates, or no engineer count reads as <strong style={{ color: 'var(--rt-t2)' }}>un-judgeable</strong> — never on-track —
        because there's nothing to measure yet. Muting a stream silences its alarm (e.g. research pending) but keeps it un-judgeable.
      </div>
    </>
  );
}

/** Which sections currently hold a warning — drives the red tab tint + alert icon,
 *  matching the chip in the release chrome so problems are obvious on open. */
function sectionWarnings(r: Release, team: Team | undefined, items: WorkItem[]): Record<MetricsSection, boolean> {
  const ctx = releaseCapacity(r, team);
  const activeReq = r.workStreams
    .filter((ws) => ws.engineersRequired != null && streamHealth(items.filter((i) => i.workStreamId === ws.id)).remainingPts > 0)
    .map((ws) => ws.engineersRequired!);
  return {
    velocity: velocityAttainment(r, team, items).verdict === 'under',
    capacity: streamContention(activeReq, ctx.contributingCount).overAllocated,
    runway: buildRunwayRows(r, team, items).some((x) => x.runway.alarm),
  };
}

export function MetricsModal({ releaseId, section, onClose }: { releaseId: string; section?: MetricsSection; onClose: () => void }) {
  const r = useStore((s) => selRelease(s, releaseId));
  const team = useStore((s) => (r ? selTeam(s, r.teamId) : undefined));
  const allItems = useStore((s) => s.items);
  const [tab, setTab] = useState<MetricsSection>(section ?? 'velocity');

  if (!r) {
    return (
      <Modal title="Release analysis" icon={Icon.sprint} onClose={onClose} width={620}>
        <span style={{ color: 'var(--rt-t3)' }}>This release no longer exists.</span>
      </Modal>
    );
  }

  const items = allItems.filter((i) => i.releaseId === releaseId);
  const warn = sectionWarnings(r, team, items);
  const options: { value: MetricsSection; label: string; icon: ReactNode; title: string; warn: boolean }[] = [
    { value: 'velocity', label: 'Velocity', icon: warn.velocity ? Icon.alert : Icon.sprint, warn: warn.velocity, title: 'Delivered vs. planned across elapsed sprints' },
    { value: 'capacity', label: 'Capacity', icon: warn.capacity ? Icon.alert : Icon.users, warn: warn.capacity, title: 'Team allocation across streams' },
    { value: 'runway', label: 'Runway', icon: warn.runway ? Icon.alert : Icon.stream, warn: warn.runway, title: 'Is enough work created to fill held capacity?' },
  ];

  return (
    <Modal
      onClose={onClose}
      width={640}
      title={<span style={{ fontSize: 'var(--rt-fs-lg)', fontWeight: 'var(--rt-fw-heading)' }}>Release analysis</span>}
      footer={
        <PButton variant="subtle" onClick={onClose}>
          Close
        </PButton>
      }
    >
      <SegmentedToggle<MetricsSection> ariaLabel="Metric" value={tab} onChange={setTab} options={options} />
      {tab === 'velocity' && <VelocitySection r={r} team={team} items={items} />}
      {tab === 'capacity' && <CapacitySection r={r} team={team} items={items} />}
      {tab === 'runway' && <RunwaySection r={r} team={team} items={items} />}
    </Modal>
  );
}
