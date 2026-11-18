// Consolidated release metrics surface. Gathers the release-level metrics that
// used to live in scattered chips/modals into one tabbed modal:
//   · Velocity   — backward attainment (delivered vs. planned) + the safe Apply.
//   · Capacity   — team allocation / over-allocation explainer, as of today.
//   · Whole release — the same allocation question over the release's full cycle,
//                  plus the scope/capacity ledger. Completion-invariant.
//   · Runway     — forward planning-runway (is enough work created to fill held
//                  capacity?), per stream, with the proactive-creation alarm.
//   · History    — what was recorded sprint by sprint (Sprint.opening/closing):
//                  scope growth, each sprint's review, chronic carry-over. The only
//                  tab that reads the record rather than today's plan.
// Backward attainment + forward runway are the spine; the two allocation readings
// sit between them, adjacent on purpose — Capacity answers "can we finish from
// here", Whole release answers "how did this run", and the pair is only legible
// side by side. See docs/metrics.md (Phase 4) and docs/capacity-history.md.

import { useState, type CSSProperties, type ReactNode } from 'react';
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
import { todayISO } from '../lib/dates';
import { carryOver, historicContention, scopeSeries, sprintReview } from '../lib/sprintHistory';
import { readingCaveats, scopeGrowthSentence } from '../lib/historyReadouts';
import { statusVars, warningVars } from '../components/statusVars';
import { Row, GoneModal } from './parts';
import modalStyles from './modals.module.css';
import styles from './MetricsModal.module.css';

export type MetricsSection = 'velocity' | 'capacity' | 'release' | 'runway' | 'history';

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
      <div className={`card dash ${modalStyles.emptyCard}`}>
        No sprint has fully elapsed yet — attainment appears once the first sprint ends.
      </div>
    );
  }

  // Sprints have elapsed, but there's no planned baseline to divide by — the team
  // has no velocity set (0, the connector default). Show what was delivered and let
  // the user seed a velocity from it, rather than the false "no sprint elapsed" copy.
  if (noBaseline) {
    return (
      <div className={`card dash ${modalStyles.emptyCardAction}`}>
        <div className={modalStyles.ledeSm}>
          The team delivered <strong className="ink">{v.totalActual}</strong> point
          {v.totalActual !== 1 ? 's' : ''} across {v.perSprint.length} elapsed sprint
          {v.perSprint.length !== 1 ? 's' : ''}, but <strong className="ink">{team ? team.name : 'the team'}</strong> has
          no velocity set — so there's no planned baseline to measure attainment against yet.
        </div>
        {suggestion && suggestion.recentAvg > 0 ? (
          <div className={`${modalStyles.row} ${modalStyles.rowWide} ${modalStyles.rowWrap}`}>
            <PButton sm onClick={onApply} disabled={!r.teamId}>
              Set velocity to {suggestion.recentAvg}
            </PButton>
            <span className={modalStyles.footnote}>
              ~{suggestion.recentAvg} pts / sprint, the average delivered over the last {suggestion.sampleSize} elapsed
              sprint{suggestion.sampleSize !== 1 ? 's' : ''}. Attainment then measures against it.
            </span>
          </div>
        ) : (
          <span className={modalStyles.note}>
            Set a team velocity to measure attainment.
          </span>
        )}
      </div>
    );
  }

  return (
    <>
      <div className={modalStyles.lede}>
        The team delivered <strong style={{ color: tone.dot }}>{v.totalActual}</strong> of{' '}
        <strong>{v.totalPlanned}</strong> planned points across {v.perSprint.length} elapsed sprint
        {v.perSprint.length !== 1 ? 's' : ''} — {under ? 'below' : 'meeting'} the set velocity (
        <strong style={{ color: tone.dot }}>{v.attainmentPct}%</strong>).
      </div>

      {suggestion && suggestion.meaningful && (
        <div className={`card ${modalStyles.block} ${modalStyles.blockLoose}`}>
          <span className="tag">Suggestion</span>
          <div className={modalStyles.ledeSm}>
            The last {suggestion.sampleSize} sprint{suggestion.sampleSize !== 1 ? 's' : ''} delivered{' '}
            ~<strong>{suggestion.recentAvg}</strong> pts on average against a set velocity of{' '}
            <strong>{suggestion.currentVelocity}</strong> — consider {suggestion.delta < 0 ? 'lowering' : 'raising'} it.
          </div>
          <div className={`${modalStyles.row} ${modalStyles.rowWide}`}>
            <PButton sm onClick={onApply} disabled={!r.teamId}>
              Set velocity to {suggestion.recentAvg}
            </PButton>
            <span className={modalStyles.footnote}>
              Affects only sprints not yet started; elapsed and active sprints keep their frozen
              baselines, so attainment history is unchanged.
            </span>
          </div>
        </div>
      )}

      <div className={`card ${modalStyles.block} ${modalStyles.blockChart}`}>
        <span className="tag">Delivered vs. planned per sprint</span>
        <VelocityTrendChart
          series={v.perSprint.map((s) => ({ label: s.sprint.name.replace(/^Sprint\s*/i, 'S'), planned: s.planned, actual: s.actual }))}
          tone={under ? 'under' : 'ok'}
        />
        <span className={modalStyles.footnote}>
          Faint bars are each sprint's planned velocity (capacity-adjusted); the bold bars + line are points completed.
          Only fully-elapsed sprints are counted.
        </span>
      </div>

      <div className={`card ${modalStyles.block} ${modalStyles.blockRoomy}`}>
        <span className={`tag ${modalStyles.blockLabel}`}>By sprint</span>
        {v.perSprint.map((s) => {
          const pct = s.planned > 0 ? Math.round((s.actual / s.planned) * 100) : null;
          return <Row key={s.sprint.id} k={s.sprint.name} v={`${s.actual} / ${s.planned} pts${pct !== null ? ` · ${pct}%` : ''}`} />;
        })}
        <hr className={`divider ${modalStyles.rule}`} />
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
  // Muted streams are informational, not this team's work (see WorkStream.muted).
  const awaiting = streams
    .filter((s) => s.ws != null && !s.muted && s.health.unpointedCount > 0)
    .map((s) => ({ ws: s.ws!, n: s.health.unpointedCount, of: s.health.openCount }))
    .sort((a, b) => b.n - a.n);
  const over = contention.totalRequired - ctx.contributingCount;
  const isOver = contention.overAllocated;
  const headroom = ctx.contributingCount - contention.totalRequired;

  return (
    <>
      <div className={modalStyles.lede}>
        {isOver ? (
          <>
            The active work streams collectively ask for <strong className="ink">{contention.totalRequired} engineers</strong>, but{' '}
            {team ? team.name : 'the team'} has only <strong className="ink">{ctx.contributingCount} contributing</strong>
            {over > 0 ? <> — over by <strong className="ink">{over}</strong>.</> : '.'} Everyone can't be on everything at once, so
            each stream's <em>effective</em> staffing is scaled down and its forecast reflects that contention.
          </>
        ) : (
          <>
            The active work streams collectively ask for{' '}
            <strong className="ink">{contention.totalRequired} engineer{contention.totalRequired === 1 ? '' : 's'}</strong>, and{' '}
            {team ? team.name : 'the team'} has <strong className="ink">{ctx.contributingCount} contributing</strong>
            {headroom > 0 ? <> — <strong className="ink">{headroom}</strong> to spare.</> : ' — fully allocated, with no contention.'} Each
            stream can be staffed at its full request.
          </>
        )}
      </div>

      <div className={`card ${modalStyles.block}`}>
        <span className={`tag ${modalStyles.blockLabel}`}>Engineers requested · active streams</span>
        {active.length === 0 ? (
          <span className={modalStyles.noteBare}>No active streams have a configured engineer requirement.</span>
        ) : (
          active.map((s) => <Row key={s.ws.id} k={s.ws.name} v={`${s.eng} eng · ${s.remainingPts} pts left`} />)
        )}
        <hr className={`divider ${modalStyles.rule}`} />
        <Row k="Total requested" v={`${contention.totalRequired} eng`} />
      </div>

      {awaiting.length > 0 && (
        <div className={`card ${modalStyles.block}`}>
          <span className={`tag ${modalStyles.blockLabel}`}>
            Awaiting estimate · {awaiting.reduce((a, s) => a + s.n, 0)} open items across {awaiting.length} stream{awaiting.length === 1 ? '' : 's'}
          </span>
          {awaiting.map((s) => <Row key={s.ws.id} k={s.ws.name} v={`${s.n} of ${s.of} unpointed`} />)}
          <span className={modalStyles.noteBare}>
            Unpointed items count as zero in every figure here, so these streams are judged on less work than they hold.
          </span>
        </div>
      )}

      <div className={`card ${modalStyles.block} ${modalStyles.blockRoomy}`}>
        <span className={`tag ${modalStyles.blockLabel}`}>The math</span>
        <Row k="Engineers available" v={`${ctx.contributingCount} contributing`} />
        <Row k="Engineers requested" v={`${contention.totalRequired}`} />
        {isOver ? (
          <>
            <Row k="Allocation factor" v={`${ctx.contributingCount} ÷ ${contention.totalRequired} = ×${contention.scale.toFixed(2)}`} />
            <hr className={`divider ${modalStyles.rule}`} />
            <Row k="Effect" v={`each stream runs at ${Math.round(contention.scale * 100)}% staffing`} big />
          </>
        ) : (
          <>
            <hr className={`divider ${modalStyles.rule}`} />
            <Row k="Headroom" v={headroom > 0 ? `${headroom} eng` : 'none'} big />
          </>
        )}
      </div>

      <div className={modalStyles.note}>
        {isOver
          ? "To clear the over-allocation, lower some streams' engineers required, add contributing team members, or move work out of the release."
          : 'Open any stream to see its individual capacity-fit detail.'}
      </div>

      {team && (
        <PButton variant="subtle" onClick={() => openModal({ type: 'team', teamId: team.id })} className={modalStyles.selfStart}>
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
  // The strip reads each sprint from its record where one exists; the release-level
  // figures above it stay the final-plan reading (they are whole-cycle sums, and a
  // record only exists for the sprints someone observed).
  const historic = historicContention(r, retro);
  // "Estimated" covers two different things the copy must not blur: a past sprint
  // nobody observed (a gap in the record) and a sprint still to come (no record yet).
  const today = todayISO();
  const upcoming = historic.perSprint.filter((s) => s.source === 'estimated' && s.sprint.startISO > today).length;
  const missed = historic.perSprint.length - historic.recordedSprints - upcoming;
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
      <div className={modalStyles.lede}>
        {ledger.contributingCount === 0 ? (
          <>This release has no team set, so there is no headcount to measure its streams against.</>
        ) : isOver ? (
          <>
            Across the whole release, the streams that carried work reserved{' '}
            <strong className="ink">{contention.totalRequired} engineers</strong> against{' '}
            <strong className="ink">{ledger.contributingCount} contributing</strong>
            {over > 0 ? <> — over by <strong className="ink">{over}</strong>.</> : '.'} Completed streams are counted
            here, so this figure can't improve just because work landed.
          </>
        ) : (
          <>
            Across the whole release, the streams that carried work reserved{' '}
            <strong className="ink">
              {contention.totalRequired} engineer{contention.totalRequired === 1 ? '' : 's'}
            </strong>{' '}
            against <strong className="ink">{ledger.contributingCount} contributing</strong>
            {headroom > 0 ? <> — <strong className="ink">{headroom}</strong> to spare.</> : ' — fully allocated throughout.'}
          </>
        )}
      </div>

      <div className={`card ${modalStyles.block}`}>
        <span className={`tag ${modalStyles.blockLabel}`}>Scope vs. capacity · whole release</span>
        <Row k="Total scope" v={`${retro.totalPts} pts · ${retro.donePts} done`} />
        <Row k="Release capacity" v={`${Math.round(ledger.totalCap)} pts across ${ledger.sprintCount} sprint${ledger.sprintCount === 1 ? '' : 's'}`} />
        <hr className={`divider ${modalStyles.rule}`} />
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

      <div className={`card ${modalStyles.block}`}>
        <span className={`tag ${modalStyles.blockLabel}`}>Allocation by sprint</span>
        <div className={modalStyles.ledeSm}>
          {historic.judgedSprints === 0
            ? 'No sprint in this release has a work stream holding work.'
            : historic.overbookedSprints === 0
              ? `Within capacity in all ${historic.judgedSprints} sprint${historic.judgedSprints === 1 ? '' : 's'} that carried work`
              : `Overbooked in ${historic.overbookedSprints} of ${historic.judgedSprints} sprint${historic.judgedSprints === 1 ? '' : 's'} that carried work`}
          {historic.judgedSprints > 0 &&
            (historic.recordedSprints === historic.perSprint.length
              ? ', every one as recorded.'
              : ` — ${[
                  historic.recordedSprints ? `${historic.recordedSprints} as recorded` : 'none recorded',
                  missed ? `${missed} not observed` : '',
                  upcoming ? `${upcoming} still to come` : '',
                ]
                  .filter(Boolean)
                  .join(', ')}${historic.recordedSprints === historic.perSprint.length ? '' : '; hatched sprints are read from today’s plan'}.`)}
        </div>
        <div className={styles.sprintStrip} role="group" aria-label="Allocation by sprint">
          {historic.perSprint.map((s, i) => {
            const seg = s.idle
              ? { bg: statusVars('Not Started').soft, fg: 'var(--rt-t3)' }
              : s.contention.overAllocated
                ? { bg: statusVars('Blocked').soft, fg: statusVars('Blocked').text }
                : { bg: statusVars('Complete').soft, fg: statusVars('Complete').text };
            return (
              <div
                key={s.sprint.id}
                title={
                  (s.idle
                    ? `${s.sprint.name} — no work stream held work`
                    : `${s.sprint.name} — ${s.contention.totalRequired} reserved across ${s.streamCount} stream${s.streamCount === 1 ? '' : 's'}, ${s.contributingCount} contributing`) +
                  (s.source === 'recorded'
                    ? ' (as recorded)'
                    : s.sprint.startISO > today
                      ? ' (still to come: read from today’s plan)'
                      : ' (not observed while it ran: read from today’s plan)')
                }
                className={`${styles.sprintSeg} ${s.source === 'estimated' ? styles.sprintSegEstimated : ''}`}
                style={{ '--seg-bg': seg.bg, '--seg-fg': seg.fg } as CSSProperties}
              >
                {i + 1}
              </div>
            );
          })}
        </div>
      </div>

      <div className={`card ${modalStyles.block}`}>
        <span className={`tag ${modalStyles.blockLabel}`}>Reserved vs. what the scope needed</span>
        {carried.length === 0 ? (
          <span className={modalStyles.noteBare}>No work streams carried any work in this release.</span>
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

      <div className={modalStyles.note}>
        The scope and reservation figures are a final-plan reading: reservations, the roster and each item's sprint are taken at
        today's values, so a change made mid-release reads as though it had always been so. The sprint strip uses each sprint's own
        record where one exists — the streams, reservations and roster as they were — and hatches the sprints without one
        (not observed while they ran, or still to come), which fall back to today's plan. Elapsed sprints contribute the velocity they actually committed.
      </div>
    </>
  );
}

// ── History (recorded) ──────────────────────────────────────────────────
// The record, not the plan. Every other tab derives from current state; this one
// reads only the sprint readings, so a sprint nobody observed is a labelled gap
// rather than a figure, and growth is measured from where recording began.
function HistorySection({ r, items }: SectionProps) {
  const { openModal } = useApp();
  const today = todayISO();
  const scope = scopeSeries(r);
  const started = r.sprints.filter((sp) => sp.startISO <= today);
  const carried = carryOver(r, items, today);
  const subjectOf = new Map(items.map((i) => [i.id, i.subject]));

  if (!scope.baseline) {
    return (
      <div className={`card dash ${modalStyles.emptyCard}`}>
        Nothing has been recorded for this release yet. Each sprint's commitment and progress are read while it runs,
        whenever the app is open — the first reading lands the next time a sprint is underway.
      </div>
    );
  }

  return (
    <>
      <div className={modalStyles.lede}>{scopeGrowthSentence(r, scope)}</div>

      <div className={`card ${modalStyles.block}`}>
        <span className={`tag ${modalStyles.blockLabel}`}>Sprint by sprint, as recorded</span>
        <div className={styles.historyTable} role="table" aria-label="Recorded sprint reviews">
          <div className={`${styles.historyRow} ${styles.historyHead}`} role="row">
            {['Sprint', 'Committed', 'Added', 'Moved out', 'Done', 'Carried', 'Met'].map((h) => (
              <span key={h} role="columnheader">{h}</span>
            ))}
          </div>
          {started.map((sp) => {
            const review = sprintReview(r, sp, today);
            if (!review) {
              return (
                <div key={sp.id} className={styles.historyRow} role="row">
                  <span role="cell" className={styles.historySprint}>{sp.name}</span>
                  <span role="cell" className={`t3 ${styles.historyGap}`}>not observed</span>
                </div>
              );
            }
            const caveats = readingCaveats(sp, today);
            const { pts } = review;
            return (
              <div
                key={sp.id}
                role="row"
                className={`${styles.historyRow} ${styles.historyRowLinked}`}
                title={caveats.length ? caveats.join(' ') : undefined}
              >
                <span role="cell" className={styles.historySprint}>
                  {/* Stretched over the row (CSS), so the whole row opens the review
                      while the table keeps real rows and one real button. */}
                  <button
                    type="button"
                    className={styles.rowLink}
                    onClick={() => openModal({ type: 'sprintReview', releaseId: r.id, sprintId: sp.id })}
                  >
                    {sp.name}
                  </button>
                  {!review.final && <span className={`tag ${styles.tagMicro}`}>so far</span>}
                  {caveats.length > 0 && <span className={`tag ${styles.tagMicro} ${styles.caveatTag}`}>incomplete</span>}
                </span>
                <span role="cell" className="mono">{pts.committed}</span>
                <span role="cell" className="mono">{review.added.length ? `+${pts.added}` : '—'}</span>
                <span role="cell" className="mono">{review.removed.length ? `\u2212${pts.removed}` : '—'}</span>
                <span role="cell" className="mono">{pts.completed}</span>
                <span role="cell" className="mono">{review.final ? pts.unfinished : '—'}</span>
                <span role="cell" className="mono">{review.commitmentMetPct === null ? '—' : `${review.commitmentMetPct}%`}</span>
              </div>
            );
          })}
        </div>
        <span className={modalStyles.footnote}>Points as recorded. Carried counts only sprints that have ended.</span>
      </div>

      <div className={`card ${modalStyles.block}`}>
        <span className={`tag ${modalStyles.blockLabel}`}>Carried over · still open</span>
        {carried.length === 0 ? (
          <span className={modalStyles.noteBare}>Nothing still open has ended a sprint unfinished.</span>
        ) : (
          carried.map((c) => (
            <button key={c.id} type="button" className={modalStyles.itemRow} onClick={() => openModal({ type: 'itemDetail', itemId: c.id })}>
              <span className="mono t3">{c.key}</span>
              <span className={modalStyles.itemRowSubject}>{subjectOf.get(c.id)}</span>
              <span className={`mono ${c.chronic ? styles.chronic : 't3'}`}>
                {c.slips} sprint{c.slips === 1 ? '' : 's'}
              </span>
            </button>
          ))
        )}
      </div>

      <div className={modalStyles.note}>
        Recorded while each sprint ran: its commitment on the first day the app saw it, the rest as last seen. A sprint
        nobody opened the app during is shown as not observed — it is never reconstructed, because nothing records when an
        item was actually completed.
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
      <div className={modalStyles.lede}>
        Forward planning health: is enough work <em>created</em> to fill the capacity each stream is holding for the
        remaining sprints? A large unclaimed runway means a stream is under-planned — and, until work is created, can't be
        measured at all. A stream marked <em>scope complete</em> flips that reading: leftover capacity is over-reservation.
      </div>

      {alarms > 0 && (
        <div className={`card ${styles.toneCard}`} style={{ '--tone-soft': alertTone.soft } as CSSProperties}>
          <span className={styles.calloutIcon} style={{ color: alertTone.text }}>{Icon.alert}</span>
          <span className={styles.calloutText} style={{ color: alertTone.text }}>
            {alarms} stream{alarms === 1 ? '' : 's'} {alarms === 1 ? 'holds' : 'hold'} capacity but {alarms === 1 ? 'has' : 'have'} nothing created beyond the next sprint.
          </span>
        </div>
      )}

      {balance.rebalanceable && (
        <div className={`card ${styles.toneCard}`} style={{ '--tone-soft': warnTone.soft } as CSSProperties}>
          <span className={styles.calloutIcon} style={{ color: warnTone.text }}>{Icon.alert}</span>
          <span className={styles.calloutText} style={{ color: warnTone.text }}>
            {balance.summary}.
          </span>
        </div>
      )}

      <div className={`card ${modalStyles.block} ${modalStyles.blockCompact}`}>
        <span className={`tag ${modalStyles.blockLabelWide}`}>Per-stream planning runway</span>
        {ordered.length === 0 ? (
          <span className={modalStyles.noteBare}>No work streams yet.</span>
        ) : (
          ordered.map(({ ws, runway }) => (
            <button
              key={ws.id}
              type="button"
              onClick={() => openModal({ type: 'stream', releaseId: r.id, wsId: ws.id })}
              title="Edit this stream — set engineers required or its planning status"
              className={styles.streamRow}
            >
              <div className={styles.calloutBody}>
                <span className={`${modalStyles.row} ${modalStyles.rowTight} ${modalStyles.rowWrap}`}>
                  <span className={styles.streamName}>{ws.name}</span>
                  <RunwayBadge verdict={runway.verdict} />
                  {/* "deferred", not "muted": WorkStream.muted is now a separate flag
                      meaning "not this team's work at all", and this list would
                      otherwise show the same word for two near-opposite states one
                      row apart. The prose below already calls this state Deferred. */}
                  {ws.planningState === 'deferred' && (
                    <span className={`tag ${styles.tagMicro}`}>deferred</span>
                  )}
                  {ws.planningState === 'complete' && (
                    <span className={`tag ${styles.tagMicro}`}>scope complete</span>
                  )}
                  {ws.muted && (
                    <span className={`tag ${styles.tagMicro}`}>muted</span>
                  )}
                </span>
                <span className={styles.calloutFootnote} style={{ color: runway.alarm ? alertTone.text : 'var(--rt-t3)' }}>
                  {runway.summary}
                </span>
              </div>
              <span className={styles.calloutIconMuted}>{Icon.chevRight}</span>
            </button>
          ))
        )}
      </div>

      <div className={modalStyles.note}>
        Reserved capacity = engineers required × per-engineer velocity over the remaining sprints, up to each stream's code
        freeze. A stream with no items, no estimates, or no engineer count reads as <strong className="t2">un-judgeable</strong> —
        never on-track — because there's nothing to measure yet. <strong className="t2">Deferred</strong> silences the
        alarm (research pending) but keeps a stream un-judgeable; <strong className="t2">scope complete</strong> treats
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
    history: carryOver(r, items).some((c) => c.chronic),
  };
}

export function MetricsModal({ releaseId, section, onClose }: { releaseId: string; section?: MetricsSection; onClose: () => void }) {
  const r = useStore((s) => selRelease(s, releaseId));
  const team = useStore((s) => (r ? selTeam(s, r.teamId) : undefined));
  const allItems = useStore((s) => s.items);
  const [tab, setTab] = useState<MetricsSection>(section ?? 'velocity');

  if (!r) {
    return (
      <GoneModal title="Release analysis" icon={Icon.sprint} noun="release" onClose={onClose} width={620} />
    );
  }

  const items = allItems.filter((i) => i.releaseId === releaseId);
  const warn = sectionWarnings(r, team, items);
  const options: { value: MetricsSection; label: string; icon: ReactNode; title: string; warn: boolean }[] = [
    { value: 'velocity', label: 'Velocity', icon: warn.velocity ? Icon.alert : Icon.sprint, warn: warn.velocity, title: 'Delivered vs. planned across elapsed sprints' },
    { value: 'capacity', label: 'Capacity', icon: warn.capacity ? Icon.alert : Icon.users, warn: warn.capacity, title: 'Team allocation across streams, as things stand today' },
    { value: 'release', label: 'Whole release', icon: warn.release ? Icon.alert : Icon.release, warn: warn.release, title: 'How the release ran across its full cycle — unaffected by what has completed' },
    { value: 'runway', label: 'Runway', icon: warn.runway ? Icon.alert : Icon.stream, warn: warn.runway, title: 'Is enough work created to fill held capacity?' },
    { value: 'history', label: 'History', icon: warn.history ? Icon.alert : Icon.timeline, warn: warn.history, title: 'What was recorded sprint by sprint — scope growth, sprint reviews, carry-over' },
  ];

  return (
    <Modal
      onClose={onClose}
      width={640}
      title={<span className={modalStyles.figure}>Release analysis</span>}
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
      {tab === 'history' && <HistorySection r={r} team={team} items={items} />}
    </Modal>
  );
}
