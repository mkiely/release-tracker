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
import { Row, GoneModal } from './parts';
import modalStyles from './modals.module.css';
import styles from './StreamHealthModal.module.css';

export function StreamHealthModal({ releaseId, wsId, onClose }: { releaseId: string; wsId: string; onClose: () => void }) {
  const r = useStore((s) => selRelease(s, releaseId));
  const team = useStore((s) => (r ? selTeam(s, r.teamId) : undefined));
  const allItems = useStore((s) => s.items);
  const { openModal } = useApp();

  const ws = r?.workStreams.find((w) => w.id === wsId);
  if (!r || !ws) {
    return (
      <GoneModal title="Work stream" icon={Icon.stream} noun="work stream" onClose={onClose} />
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
        <span className={`${modalStyles.row} ${modalStyles.rowLoose} ${modalStyles.grow}`}>
          <VerdictBadge verdict={forecast.verdict} />
          <span title={ws.name} className={`${modalStyles.grow} ${modalStyles.truncate}`}>
            {ws.name}
          </span>
        </span>
      }
      footer={
        <>
          <PButton variant="subtle" onClick={editStream} className={modalStyles.pushRight}>
            {Icon.stream} Edit stream
          </PButton>
          <PButton variant="subtle" onClick={onClose}>
            Close
          </PButton>
        </>
      }
    >
      {/* Plain-language verdict */}
      <div className={modalStyles.lede}>{forecast.summary}</div>

      {/* Current-state breakdown */}
      {health.totalPts > 0 && (
        <div className={`${modalStyles.stack} ${modalStyles.stackSnug}`}>
          <div className={`${modalStyles.row} ${modalStyles.rowBaseline} ${modalStyles.rowSplit}`}>
            <span className="tag">Progress</span>
            <span className={`mono ${modalStyles.footnoteXs}`}>{health.donePts} / {health.totalPts} pts · {health.pct}%</span>
          </div>
          <SegBar segs={health.pointsByStatus} height={10} radius={5} />
        </div>
      )}

      {/* The chart */}
      {canForecast ? (
        <div className={`card ${modalStyles.block} ${modalStyles.blockChart}`}>
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
          <span className={modalStyles.footnote}>
            Bars show planned points per sprint (x-axis = sprint assignment, not completion history — an approximation).
            The line burns the remaining {health.remainingPts} pts down by the stream's capacity up to the amber <strong style={{ color: warningVars().dot }}>code freeze</strong>;
            where it reaches zero is the projected finish, and any gap at the freeze is the shortfall. Sprints past the freeze are faded — no work can land there.
          </span>
        </div>
      ) : (
        <div className={`card dash ${modalStyles.emptyCard}`}>
          {!configured ? (
            <>Set <strong className="t2">engineers required</strong> for this stream to compute a capacity-fit forecast.</>
          ) : (
            <>Add <strong className="t2">points</strong> to this stream’s items to compute a capacity-fit forecast.</>
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
          <hr className={`divider ${modalStyles.rule}`} />
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
        <div className={`${modalStyles.row} ${modalStyles.rowLoose} ${modalStyles.rowWrap}`}>
          <RunwayBadge verdict={runway.verdict} planningState={ws.planningState} />
          <button
            type="button"
            onClick={editStream}
            title="Edit this stream's planning status"
            className={styles.inlineEdit}
          >
            planning {ws.planningState === 'complete' ? 'scope complete' : ws.planningState}
          </button>
        </div>
        <span className={modalStyles.summaryLine}>{runway.summary}</span>
        {runway.judgeable && (
          <>
            <hr className={`divider ${modalStyles.rule}`} />
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
            <strong className="ink">{Math.round(forecast.postFreezeRemainingPts)} pts</strong> are scheduled
            into sprints starting after this stream's code freeze ({fmtShort(effectiveStreamCodeFreeze(r, ws))}). That work sits
            outside both assessments above — as planned, it won't land by the freeze.
          </>
        </Callout>
      )}
    </Modal>
  );
}
