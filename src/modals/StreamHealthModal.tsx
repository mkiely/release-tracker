// Part of the app's modal set. Reads what it needs from the store and commits
// through getActions(), so callers supply only ids and an onClose.

import { between, fmtShort, todayISO } from '../lib/dates';
import { effectiveStreamCodeFreeze, freezeSprintX, sumPoints } from '../lib/derive';
import { selRelease, selTeam, useStore } from '../store/store';
import { useApp } from '../app-context';
import { Icon } from '../components/Icon';
import { Modal, PButton } from '../components/primitives';
import { CalcCard, Callout } from '../components/ui/Callout';
import { assessStreams } from '../lib/streamAssessment';
import { SegBar } from '../components/Badges';
import { StreamBurnChart } from '../components/Trend';
import { RunwayBadge, VerdictBadge } from '../components/VerdictLine';
import { verdictVars, warningVars } from '../components/statusVars';
import { Row } from './parts';

export function StreamHealthModal({ releaseId, wsId, onClose }: { releaseId: string; wsId: string; onClose: () => void }) {
  const r = useStore((s) => selRelease(s, releaseId));
  const team = useStore((s) => (r ? selTeam(s, r.teamId) : undefined));
  const allItems = useStore((s) => s.items);
  const { openModal } = useApp();

  const ws = r?.workStreams.find((w) => w.id === wsId);
  if (!r || !ws) {
    return (
      <Modal title="Work stream" icon={Icon.stream} onClose={onClose} width={520}>
        <span style={{ color: 'var(--rt-t3)' }}>This work stream no longer exists.</span>
      </Modal>
    );
  }

  const items = allItems.filter((i) => i.releaseId === releaseId);
  const today = todayISO();
  // One assessment for the whole release, so this modal, the stream row that opened
  // it and the metrics tab can't disagree about the same stream.
  const assessment = assessStreams(r, team, items, { today });
  const { contention } = assessment;
  const { items: streamItems, health, ctx, forecast, runway } = assessment.byId.get(wsId)!;
  const v = verdictVars(forecast.verdict);

  const series = r.sprints.map((sp) => sumPoints(streamItems.filter((i) => i.sprintId === sp.id)));
  const friRaw = r.sprints.findIndex((sp) => sp.endISO >= today);
  const firstRemainingIndex = friRaw < 0 ? r.sprints.length : friRaw;
  const activeIndex = r.sprints.findIndex((sp) => between(today, sp.startISO, sp.endISO));
  const freezeX = freezeSprintX(r.sprints, effectiveStreamCodeFreeze(r, ws));

  const n1 = (x: number) => (Math.round(x * 10) / 10).toString();
  const shortfall = forecast.shortfallPts;
  const configured = ws.engineersRequired != null;
  // A capacity-fit forecast needs both an engineer count and estimated work.
  const canForecast = configured && health.totalPts > 0;

  const editStream = () => openModal({ type: 'stream', releaseId, wsId });

  return (
    <Modal
      onClose={onClose}
      width={720}
      title={
        // The badge holds its size; the name truncates (the shell's title styling
        // covers the whole node, so this span only needs the ellipsis rules).
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <VerdictBadge verdict={forecast.verdict} />
          <span title={ws.name} style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {ws.name}
          </span>
        </span>
      }
      footer={
        <>
          <PButton variant="subtle" onClick={editStream} style={{ marginRight: 'auto' }}>
            {Icon.stream} Edit stream
          </PButton>
          <PButton variant="subtle" onClick={onClose}>
            Close
          </PButton>
        </>
      }
    >
      {/* Plain-language verdict */}
      <div style={{ fontSize: 'var(--rt-fs-md)', color: 'var(--rt-t2)', lineHeight: 1.5 }}>{forecast.summary}</div>

      {/* Current-state breakdown */}
      {health.totalPts > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <span className="tag">Progress</span>
            <span className="mono" style={{ fontSize: 'var(--rt-fs-xs)', color: 'var(--rt-t3)' }}>{health.donePts} / {health.totalPts} pts · {health.pct}%</span>
          </div>
          <SegBar segs={health.pointsByStatus} height={10} radius={5} />
        </div>
      )}

      {/* The chart */}
      {canForecast ? (
        <div className="card" style={{ background: 'var(--rt-bg)', padding: '14px 14px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="tag">Remaining work burndown vs capacity</span>
          <StreamBurnChart
            series={series}
            firstRemainingIndex={firstRemainingIndex}
            freezeX={freezeX}
            activeIndex={activeIndex}
            remainingPts={health.remainingPts}
            effectiveCap={forecast.effectiveCap}
            tone={v.tone === 'risk' ? 'risk' : 'ok'}
          />
          <span style={{ fontSize: 'var(--rt-fs-micro)', color: 'var(--rt-t3)', lineHeight: 1.4 }}>
            Bars show planned points per sprint (x-axis = sprint assignment, not completion history — an approximation).
            The line burns the remaining {health.remainingPts} pts down by the stream's capacity up to the amber <strong style={{ color: warningVars().dot }}>code freeze</strong>;
            where it reaches zero is the projected finish, and any gap at the freeze is the shortfall. Sprints past the freeze are faded — no work can land there.
          </span>
        </div>
      ) : (
        <div className="card dash" style={{ padding: '18px 16px', color: 'var(--rt-t3)', fontSize: 'var(--rt-fs-sm)', lineHeight: 1.5 }}>
          {!configured ? (
            <>Set <strong style={{ color: 'var(--rt-t2)' }}>engineers required</strong> for this stream to compute a capacity-fit forecast.</>
          ) : (
            <>Add <strong style={{ color: 'var(--rt-t2)' }}>points</strong> to this stream’s items to compute a capacity-fit forecast.</>
          )}
        </div>
      )}

      {/* The calculation */}
      {canForecast && (
        <CalcCard label="The calculation">
          <Row
            k="Code freeze"
            v={`${fmtShort(effectiveStreamCodeFreeze(r, ws))}${ws.codeFreezeISO != null ? ' (stream override)' : ' (release default)'}`}
          />
          <Row k="Remaining points" v={`${health.remainingPts} pts`} />
          <Row k="Engineers required" v={`${ws.engineersRequired}`} />
          <Row k="Per-engineer capacity" v={`${n1(ctx.perEngineerCap)} pts (over ${ctx.remainingSprintCount} sprint${ctx.remainingSprintCount !== 1 ? 's' : ''})`} />
          {forecast.contended ? (
            <>
              <Row k="Team overbooked" v={`${contention.totalRequired} req / ${ctx.contributingCount} avail`} />
              <Row k="Effective engineers" v={`${ws.engineersRequired} × ${n1(contention.scale)} = ${n1(forecast.effectiveEngineers)}`} />
            </>
          ) : null}
          <Row k="Stream capacity" v={`${n1(forecast.effectiveEngineers)} × ${n1(ctx.perEngineerCap)} = ${Math.round(forecast.effectiveCap)} pts`} />
          {/* "Burn-down runway", not the planning runway below — this is how many
              sprints the EXISTING work takes to clear, not how much held capacity
              has no work against it. Two different questions, one word. */}
          <Row k="Burn-down runway" v={Number.isFinite(forecast.runwaySprints) ? `~${n1(forecast.runwaySprints)} sprints` : '—'} />
          <hr className="divider" style={{ margin: '3px 0' }} />
          <Row
            k={shortfall > 0.5 ? 'Shortfall' : 'Surplus'}
            v={`${shortfall > 0.5 ? '' : '+'}${Math.round(Math.abs(shortfall))} pts`}
            big
          />
        </CalcCard>
      )}

      {/* Planning runway — the inverse question, and the one the row's planning chip
          raises. Without this the chip had nowhere to explain itself. */}
      <CalcCard label="Planning runway">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <RunwayBadge verdict={runway.verdict} planningState={ws.planningState} />
          <button
            type="button"
            onClick={editStream}
            title="Edit this stream's planning status"
            style={{
              appearance: 'none', background: 'transparent', border: 'none', padding: 0,
              font: 'inherit', fontSize: 'var(--rt-fs-xs)', color: 'var(--rt-t3)', cursor: 'pointer', textDecoration: 'underline',
            }}
          >
            planning {ws.planningState === 'complete' ? 'scope complete' : ws.planningState}
          </button>
        </div>
        <span style={{ fontSize: 'var(--rt-fs-sm)', color: 'var(--rt-t2)', lineHeight: 1.45 }}>{runway.summary}</span>
        {runway.judgeable && (
          <>
            <hr className="divider" style={{ margin: '3px 0' }} />
            <Row k="Reserved capacity" v={`${Math.round(runway.availableCap)} pts`} />
            <Row k="Created work remaining" v={`${Math.round(runway.createdRemainingPts)} pts`} />
            <Row k="Unclaimed" v={`${Math.round(runway.unclaimedRunway)} pts (~${n1(runway.unclaimedSprints)} sprints)`} big />
          </>
        )}
      </CalcCard>

      {/* Work parked past the freeze is measured by neither verdict above — it can't
          land in the window they assess — so it states itself rather than hiding. */}
      {forecast.postFreezeRemainingPts > 0 && (
        <Callout tone="warning">
          <>
            <strong style={{ color: 'var(--rt-ink)' }}>{Math.round(forecast.postFreezeRemainingPts)} pts</strong> are scheduled
            into sprints starting after this stream's code freeze ({fmtShort(effectiveStreamCodeFreeze(r, ws))}). That work sits
            outside both assessments above — as planned, it won't land by the freeze.
          </>
        </Callout>
      )}
    </Modal>
  );
}
