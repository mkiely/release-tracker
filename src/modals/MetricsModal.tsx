// Consolidated release metrics surface. Gathers the release-level metrics that
// used to live in scattered chips/modals into one tabbed modal:
//   · Velocity   — backward attainment (delivered vs. planned) + the safe Apply.
//   · Capacity   — team allocation / over-allocation explainer, as of today.
//   · Whole release — the same allocation question over the release's full cycle,
//                  plus the scope/capacity ledger. Completion-invariant.
//   · Runway     — forward planning-runway (is enough work created to fill held
//                  capacity?), per stream, with the proactive-creation alarm.
// Backward attainment + forward runway are the spine; the two allocation readings
// sit between them, adjacent on purpose — Capacity answers "can we finish from
// here", Whole release answers "how did this run", and the pair is only legible
// side by side. See docs/metrics.md (Phase 4) and docs/capacity-history.md.

import { useState, type ReactNode } from 'react';
import type { Release, Team, WorkItem } from '../types';
import { reservationBalance, velocityAttainment, velocitySuggestion } from '../lib/derive';
import { getActions, selRelease, selTeam, useStore } from '../store/store';
import { useApp } from '../app-context';
import { Icon } from '../components/Icon';
import { Modal, PButton } from '../components/primitives';
import { SegmentedToggle } from '../components/SegmentedToggle';
import { VelocityTrendChart } from '../components/Trend';
import { RunwayBadge } from '../components/VerdictLine';
import { assessRelease, assessStreams } from '../lib/streamAssessment';
import { statusVars, warningVars } from '../components/statusVars';
import { Row } from './Modals';

export type MetricsSection = 'velocity' | 'capacity' | 'release' | 'runway';

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
  const noBaseline = v.verdict === 'no-baseline';
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

  // Sprints have elapsed, but there's no planned baseline to divide by — the team
  // has no velocity set (0, the connector default). Show what was delivered and let
  // the user seed a velocity from it, rather than the false "no sprint elapsed" copy.
  if (noBaseline) {
    return (
      <div className="card dash" style={{ padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ color: 'var(--rt-t2)', fontSize: 'var(--rt-fs-sm)', lineHeight: 1.5 }}>
          The team delivered <strong style={{ color: 'var(--rt-ink)' }}>{v.totalActual}</strong> point
          {v.totalActual !== 1 ? 's' : ''} across {v.perSprint.length} elapsed sprint
          {v.perSprint.length !== 1 ? 's' : ''}, but <strong style={{ color: 'var(--rt-ink)' }}>{team ? team.name : 'the team'}</strong> has
          no velocity set — so there's no planned baseline to measure attainment against yet.
        </div>
        {suggestion && suggestion.recentAvg > 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <PButton sm onClick={onApply} disabled={!r.teamId}>
              Set velocity to {suggestion.recentAvg}
            </PButton>
            <span style={{ fontSize: 'var(--rt-fs-micro)', color: 'var(--rt-t3)', lineHeight: 1.4 }}>
              ~{suggestion.recentAvg} pts / sprint, the average delivered over the last {suggestion.sampleSize} elapsed
              sprint{suggestion.sampleSize !== 1 ? 's' : ''}. Attainment then measures against it.
            </span>
          </div>
        ) : (
          <span style={{ fontSize: 'var(--rt-fs-sm)', color: 'var(--rt-t3)', lineHeight: 1.5 }}>
            Set a team velocity to measure attainment.
          </span>
        )}
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
  const { ctx, contention, streams } = assessStreams(r, team, items);

  // The rows behind `contention`: streams with remaining work and a declared
  // engineer need. Same predicate assessStreams used to compute it — listed here
  // only to render the breakdown, never to recompute the total.
  const active = streams
    .flatMap((s) =>
      s.ws != null && s.ws.engineersRequired != null && s.health.remainingPts > 0
        ? [{ ws: s.ws, eng: s.ws.engineersRequired, remainingPts: s.health.remainingPts }]
        : [],
    )
    .sort((a, b) => b.eng - a.eng);
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
          active.map((s) => <Row key={s.ws.id} k={s.ws.name} v={`${s.eng} eng · ${s.remainingPts} pts left`} />)
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

// ── Whole release (retrospective) ───────────────────────────────────────
// The deliberate counterpart to Capacity above. That section reads remaining work
// against remaining sprints, so a stream finishing releases its engineers and the
// verdict improves — correct for "can we finish", but it means a release overbooked
// all cycle ends up reading as comfortable. This one counts every stream that
// carried work and every sprint that ran, so nothing here moves as work lands.
function ReleaseSection({ r, team, items }: SectionProps) {
  const retro = assessRelease(r, team, items);
  const { ledger, contention } = retro;
  const isOver = contention.overAllocated;
  const over = contention.totalRequired - ledger.contributingCount;
  const headroom = ledger.contributingCount - contention.totalRequired;
  const scopeGap = Math.round(retro.totalPts - ledger.totalCap);
  const tone = statusVars(isOver || retro.overCommitted ? 'Blocked' : 'Complete');

  // Every stream that carried work, reserved or not — an unreserved stream still
  // consumed capacity, and hiding it would understate what the release ran on.
  const carried = retro.streams.filter((s) => s.totalPts > 0).sort((a, b) => b.totalPts - a.totalPts);

  return (
    <>
      <div style={{ fontSize: 'var(--rt-fs-md)', color: 'var(--rt-t2)', lineHeight: 1.5 }}>
        {ledger.contributingCount === 0 ? (
          <>This release has no team set, so there is no headcount to measure its streams against.</>
        ) : isOver ? (
          <>
            Across the whole release, the streams that carried work reserved{' '}
            <strong style={{ color: 'var(--rt-ink)' }}>{contention.totalRequired} engineers</strong> against{' '}
            <strong style={{ color: 'var(--rt-ink)' }}>{ledger.contributingCount} contributing</strong>
            {over > 0 ? <> — over by <strong style={{ color: 'var(--rt-ink)' }}>{over}</strong>.</> : '.'} Completed streams are counted
            here, so this figure can't improve just because work landed.
          </>
        ) : (
          <>
            Across the whole release, the streams that carried work reserved{' '}
            <strong style={{ color: 'var(--rt-ink)' }}>
              {contention.totalRequired} engineer{contention.totalRequired === 1 ? '' : 's'}
            </strong>{' '}
            against <strong style={{ color: 'var(--rt-ink)' }}>{ledger.contributingCount} contributing</strong>
            {headroom > 0 ? <> — <strong style={{ color: 'var(--rt-ink)' }}>{headroom}</strong> to spare.</> : ' — fully allocated throughout.'}
          </>
        )}
      </div>

      <div className="card" style={{ background: 'var(--rt-bg)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 9 }}>
        <span className="tag" style={{ marginBottom: 2 }}>Scope vs. capacity · whole release</span>
        <Row k="Total scope" v={`${retro.totalPts} pts · ${retro.donePts} done`} />
        <Row k="Release capacity" v={`${Math.round(ledger.totalCap)} pts across ${ledger.sprintCount} sprint${ledger.sprintCount === 1 ? '' : 's'}`} />
        <hr className="divider" style={{ margin: '3px 0' }} />
        {ledger.totalCap === 0 ? (
          <Row k="Verdict" v="no velocity baseline to measure against" big />
        ) : (
          <Row
            k={retro.overCommitted ? 'Over-committed by' : 'Headroom'}
            v={<span style={{ color: tone.dot }}>{Math.abs(scopeGap)} pts</span>}
            big
          />
        )}
      </div>

      <div className="card" style={{ background: 'var(--rt-bg)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 9 }}>
        <span className="tag" style={{ marginBottom: 2 }}>Allocation by sprint</span>
        <div style={{ fontSize: 'var(--rt-fs-sm)', color: 'var(--rt-t2)', lineHeight: 1.5 }}>
          {retro.judgedSprints === 0
            ? 'No sprint in this release has a work stream holding work.'
            : retro.overbookedSprints === 0
              ? `Within capacity in all ${retro.judgedSprints} sprint${retro.judgedSprints === 1 ? '' : 's'} that carried work.`
              : `Overbooked in ${retro.overbookedSprints} of ${retro.judgedSprints} sprint${retro.judgedSprints === 1 ? '' : 's'} that carried work.`}
        </div>
        <div style={{ display: 'flex', gap: 3 }} role="group" aria-label="Allocation by sprint">
          {retro.perSprint.map((s, i) => {
            const seg = s.idle
              ? { bg: statusVars('Not Started').soft, fg: 'var(--rt-t3)' }
              : s.contention.overAllocated
                ? { bg: statusVars('Blocked').soft, fg: statusVars('Blocked').text }
                : { bg: statusVars('Complete').soft, fg: statusVars('Complete').text };
            return (
              <div
                key={s.sprint.id}
                title={
                  s.idle
                    ? `${s.sprint.name} — no work stream held work`
                    : `${s.sprint.name} — ${s.contention.totalRequired} reserved across ${s.streamCount} stream${s.streamCount === 1 ? '' : 's'}, ${ledger.contributingCount} contributing`
                }
                style={{
                  flex: 1,
                  minWidth: 0,
                  height: 26,
                  borderRadius: 3,
                  background: seg.bg,
                  color: seg.fg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 'var(--rt-fs-xs)',
                  fontWeight: 'var(--rt-fw-semibold)',
                }}
              >
                {i + 1}
              </div>
            );
          })}
        </div>
      </div>

      <div className="card" style={{ background: 'var(--rt-bg)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 9 }}>
        <span className="tag" style={{ marginBottom: 2 }}>Reserved vs. what the scope needed</span>
        {carried.length === 0 ? (
          <span style={{ fontSize: 'var(--rt-fs-sm)', color: 'var(--rt-t3)' }}>No work streams carried any work in this release.</span>
        ) : (
          carried.map((s) => (
            <Row
              key={s.ws.id}
              k={s.ws.name}
              v={
                s.engineersRequired == null
                  ? `no reservation · scope needed ${s.engineersImplied.toFixed(1)}`
                  : `${s.engineersRequired} reserved · scope needed ${s.engineersImplied.toFixed(1)}`
              }
            />
          ))
        )}
      </div>

      <div style={{ fontSize: 'var(--rt-fs-sm)', color: 'var(--rt-t3)', lineHeight: 1.5 }}>
        A final-plan reading: reservations, the roster and each item's sprint are taken at today's values, so a change made mid-release
        reads as though it had always been so. Elapsed sprints do contribute the velocity they actually committed.
      </div>
    </>
  );
}

// ── Planning runway (forward) ───────────────────────────────────────────
/** One runway verdict per work stream. Shared by the Runway section and the
 *  modal's tab-warning check so the alarm logic lives in one place. */
function buildRunwayRows(r: Release, team: Team | undefined, items: WorkItem[]) {
  return assessStreams(r, team, items).streams.map(({ ws, runway, forecast }) => ({ ws: ws!, runway, forecast }));
}

/** Release-level reservation balance: pair over-reserved (scope-complete) streams
 *  against at-risk ones to spot reserved engineers that could be redeployed. */
function runwayReservation(r: Release, team: Team | undefined, items: WorkItem[]) {
  return reservationBalance(
    buildRunwayRows(r, team, items).map(({ ws, forecast, runway }) => ({
      name: ws.name,
      shortfallPts: forecast.shortfallPts,
      atRisk: forecast.verdict === 'at-risk',
      overReservedPts: runway.overReservedPts,
      perEngineerCap: runway.perEngineerCap,
    })),
  );
}

function RunwaySection({ r, team, items }: SectionProps) {
  const { openModal } = useApp();
  const rows = buildRunwayRows(r, team, items);

  // Order by urgency: alarms → under-planned → over-reserved → the rest → muted.
  // Muted outranks every verdict because it isn't one: the stream took no part in
  // the figures this list is ranking, so however its runway reads, it is not the
  // thing to act on.
  const rank = (x: (typeof rows)[number]) =>
    x.ws.muted ? 4 : x.runway.alarm ? 0 : x.runway.verdict === 'under-planned' ? 1 : x.runway.verdict === 'over-reserved' ? 2 : 3;
  const ordered = [...rows].sort((a, b) => rank(a) - rank(b));
  const alarms = rows.filter((x) => x.runway.alarm).length;
  const alertTone = statusVars('Blocked');
  const warnTone = warningVars();
  const balance = runwayReservation(r, team, items);

  return (
    <>
      <div style={{ fontSize: 'var(--rt-fs-md)', color: 'var(--rt-t2)', lineHeight: 1.5 }}>
        Forward planning health: is enough work <em>created</em> to fill the capacity each stream is holding for the
        remaining sprints? A large unclaimed runway means a stream is under-planned — and, until work is created, can't be
        measured at all. A stream marked <em>scope complete</em> flips that reading: leftover capacity is over-reservation.
      </div>

      {alarms > 0 && (
        <div className="card" style={{ background: alertTone.soft, border: `1.5px solid ${alertTone.soft}`, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={{ display: 'inline-flex', color: alertTone.text }}>{Icon.alert}</span>
          <span style={{ fontSize: 'var(--rt-fs-sm)', color: alertTone.text, lineHeight: 1.45 }}>
            {alarms} stream{alarms === 1 ? '' : 's'} {alarms === 1 ? 'holds' : 'hold'} capacity but {alarms === 1 ? 'has' : 'have'} nothing created beyond the next sprint.
          </span>
        </div>
      )}

      {balance.rebalanceable && (
        <div className="card" style={{ background: warnTone.soft, border: `1.5px solid ${warnTone.soft}`, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={{ display: 'inline-flex', color: warnTone.text }}>{Icon.alert}</span>
          <span style={{ fontSize: 'var(--rt-fs-sm)', color: warnTone.text, lineHeight: 1.45 }}>
            {balance.summary}.
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
              title="Edit this stream — set engineers required or its planning status"
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
                  {/* "deferred", not "muted": WorkStream.muted is now a separate flag
                      meaning "not this team's work at all", and this list would
                      otherwise show the same word for two near-opposite states one
                      row apart. The prose below already calls this state Deferred. */}
                  {ws.planningState === 'deferred' && (
                    <span className="tag" style={{ fontSize: 'var(--rt-fs-micro)', color: 'var(--rt-t3)' }}>deferred</span>
                  )}
                  {ws.planningState === 'complete' && (
                    <span className="tag" style={{ fontSize: 'var(--rt-fs-micro)', color: 'var(--rt-t3)' }}>scope complete</span>
                  )}
                  {ws.muted && (
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
        Reserved capacity = engineers required × per-engineer velocity over the remaining sprints, up to each stream's code
        freeze. A stream with no items, no estimates, or no engineer count reads as <strong style={{ color: 'var(--rt-t2)' }}>un-judgeable</strong> —
        never on-track — because there's nothing to measure yet. <strong style={{ color: 'var(--rt-t2)' }}>Deferred</strong> silences the
        alarm (research pending) but keeps a stream un-judgeable; <strong style={{ color: 'var(--rt-t2)' }}>scope complete</strong> treats
        the created work as the whole scope, so leftover capacity reads as over-reserved and can be offered to at-risk streams.
      </div>
    </>
  );
}

/** Which sections currently hold a warning — drives the red tab tint + alert icon,
 *  matching the chip in the release chrome so problems are obvious on open. */
function sectionWarnings(r: Release, team: Team | undefined, items: WorkItem[]): Record<MetricsSection, boolean> {
  const assessment = assessStreams(r, team, items);
  const retro = assessRelease(r, team, items);
  return {
    velocity: velocityAttainment(r, team, items).verdict === 'under',
    capacity: assessment.contention.overAllocated,
    release: retro.contention.overAllocated || retro.overCommitted,
    runway: assessment.streams.some((s) => s.runway.alarm),
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
    { value: 'capacity', label: 'Capacity', icon: warn.capacity ? Icon.alert : Icon.users, warn: warn.capacity, title: 'Team allocation across streams, as things stand today' },
    { value: 'release', label: 'Whole release', icon: warn.release ? Icon.alert : Icon.release, warn: warn.release, title: 'How the release ran across its full cycle — unaffected by what has completed' },
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
      {tab === 'release' && <ReleaseSection r={r} team={team} items={items} />}
      {tab === 'runway' && <RunwaySection r={r} team={team} items={items} />}
    </Modal>
  );
}
