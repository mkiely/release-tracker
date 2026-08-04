import type { SnapshotPayload, SnapshotStream } from '../lib/releaseSnapshot';
import type { Status, StatusSeg } from '../types';
import { SegBar } from '../components/Badges';
import { VerdictBadge, RunwayBadge } from '../components/VerdictLine';
import { StreamBurnChart, VelocityTrendChart } from '../components/Trend';
import { statusVars, warningVars } from '../components/statusVars';
import { Icon } from '../components/Icon';
import { fmtLong } from '../lib/dates';
import styles from './summary.module.css';

/** Human date from the snapshot's ISO timestamp (date part only). */
function generatedOn(iso: string): string {
  return fmtLong(iso.slice(0, 10));
}

const STATUS_ORDER: Status[] = ['Not Started', 'In Progress', 'Under Review', 'Blocked', 'Complete'];

/** A work stream's name — an external-link to the connector's stream when the
 *  snapshot carries one (`externalUrl`), plain text otherwise. Opening the link is
 *  a plain new-tab navigation, not a backend data call, so it keeps the viewer's
 *  "local only" promise. Pre-v5 payloads have no `externalUrl` and render as text. */
function StreamName({ s }: { s: SnapshotStream }) {
  if (!s.externalUrl) return <span className={styles.streamName}>{s.name}</span>;
  return (
    <a
      className={styles.streamLink}
      href={s.externalUrl}
      target="_blank"
      rel="noopener noreferrer"
      title="Open this work stream in the external system (new tab)"
    >
      <span className={styles.streamName}>{s.name}</span>
      {Icon.external}
    </a>
  );
}

/** Legend mapping status colors, shown once under the stream status board. */
function StatusLegend({ streams }: { streams: SnapshotStream[] }) {
  const present = new Set<Status>();
  for (const s of streams) for (const seg of s.segs) present.add(seg.k);
  const shown = STATUS_ORDER.filter((k) => present.has(k));
  if (shown.length === 0) return null;
  return (
    <div className={styles.legend}>
      {shown.map((k) => (
        <span key={k} className={styles.legendItem}>
          <span className={styles.legendDot} style={{ background: statusVars(k).dot }} />
          {k}
        </span>
      ))}
    </div>
  );
}

type Tone = 'ok' | 'warn' | 'risk' | 'neutral';

/** Value color per health tone, reusing the app's status tokens (green/amber/red). */
const TONE_COLOR: Record<Tone, string | undefined> = {
  ok: 'var(--rt-st-co-text)',
  warn: 'var(--rt-st-wn-text)',
  risk: 'var(--rt-st-bl-text)',
  neutral: undefined,
};

function Stat({ value, label, tone = 'neutral' }: { value: string; label: string; tone?: Tone }) {
  return (
    <div className={`card ${styles.stat}`} data-tone={tone}>
      <span className={styles.statVal} style={{ color: TONE_COLOR[tone] }}>
        {value}
      </span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}

function velocityLabel(v: SnapshotPayload['velocity']): string {
  if (v.verdict === 'none') return '—';
  if (v.verdict === 'no-baseline') return `${v.totalActual} pts`;
  return `${v.attainmentPct}%`;
}

/** Health tone for the velocity-attainment stat. */
function velocityTone(v: SnapshotPayload['velocity']): Tone {
  if (v.verdict === 'under') return 'risk';
  if (v.verdict === 'on-track') return 'ok';
  return 'neutral'; // none / no-baseline — nothing to grade yet
}

/** Release capacity analysis — the highest-level signal, shown first: how the
 *  streams with work left collectively demand engineers vs. the team's headcount,
 *  and (when over-allocated) how each stream's effective staffing is scaled down.
 *
 *  The title names its own date because this is a *current-state* reading sitting
 *  directly above a whole-release one. Undated, the two are actively confusable —
 *  and this is the section that improves as streams finish, so it is the one that
 *  has to say when it was taken. */
function ReleaseCapacity({
  cap,
  teamName,
  asOfISO,
}: {
  cap: SnapshotPayload['capacity'];
  teamName: string | null;
  asOfISO: string;
}) {
  const team = teamName ?? 'the team';
  const over = cap.overAllocated;
  return (
    <>
      <h2 className={styles.sectionTitle}>Release capacity as of {generatedOn(asOfISO)}</h2>
      <div className={`card ${styles.capCard} ${over ? styles.capRisk : styles.capOk}`}>
        <div className={styles.capHead}>
          <span className={over ? styles.capBadgeRisk : styles.capBadgeOk}>
            {over ? 'Over capacity' : 'Within capacity'}
          </span>
          <span className={styles.capNumsLg}>
            {cap.totalRequired} required / {cap.contributingCount} available
          </span>
        </div>
        <div className={styles.capLede}>
          {over ? (
            <>
              The streams with work remaining <strong>today</strong> collectively need{' '}
              <strong>{cap.totalRequired} engineers</strong>, but {team} has only{' '}
              <strong>{cap.contributingCount} contributing</strong> — over by <strong>{cap.over}</strong>. No one can be
              on everything at once, so each stream is effectively staffed at{' '}
              <strong>{Math.round(cap.scale * 100)}%</strong> and its forecast reflects that.
            </>
          ) : (
            <>
              The streams with work remaining <strong>today</strong> need{' '}
              <strong>{cap.totalRequired} engineer{cap.totalRequired === 1 ? '' : 's'}</strong>,
              and {team} has <strong>{cap.contributingCount} contributing</strong>
              {cap.headroom > 0 ? (
                <> — <strong>{cap.headroom}</strong> to spare.</>
              ) : (
                <> — fully allocated, with no contention.</>
              )}{' '}
              Each stream can be staffed at its full request.
            </>
          )}
        </div>
        {cap.activeStreams.length > 0 && (
          <div className={styles.capTable}>
            <div className={`${styles.capRow} ${styles.capRowHead}`}>
              <span>Stream</span>
              <span>Requested</span>
              <span>{over ? 'Effective' : 'Points left'}</span>
            </div>
            {cap.activeStreams.map((s, i) => (
              <div key={i} className={styles.capRow}>
                <span className={styles.capStreamCell}>
                  <span className={styles.capStreamName}>{s.name}</span>
                  {s.verdict && <VerdictBadge verdict={s.verdict} />}
                </span>
                <span className={styles.capNum}>{s.engineersRequired} eng</span>
                <span className={styles.capNum}>
                  {over ? (
                    <>
                      <span style={{ color: 'var(--rt-st-wn-text)' }}>{s.effectiveEngineers} eng</span>{' '}
                      <span className={styles.dim}>· {s.remainingPts} pts left</span>
                    </>
                  ) : (
                    `${s.remainingPts} pts left`
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

/**
 * Whole-release (retrospective) analysis — the counterpart to ReleaseCapacity above.
 * That section reads remaining work against remaining sprints, so it improves as
 * streams finish; this one counts every stream that carried work and every sprint
 * that ran, and so cannot be flattered by completion. The two sit adjacent on purpose:
 * neither is legible about the other's absence.
 *
 * `sprintNames` comes from the payload's `sprints`, which `perSprint` is index-aligned
 * with — the strip carries no names of its own to keep the URL-borne payload lean.
 */
function WholeRelease({
  wr,
  sprintNames,
  teamName,
}: {
  wr: NonNullable<SnapshotPayload['wholeRelease']>;
  sprintNames: string[];
  teamName: string | null;
}) {
  const team = teamName ?? 'the team';
  const over = wr.overAllocated;
  return (
    <>
      <h2 className={styles.sectionTitle}>Whole release</h2>
      <div className={`card ${styles.capCard} ${over || wr.overCommitted ? styles.capRisk : styles.capOk}`}>
        <div className={styles.capHead}>
          <span className={over ? styles.capBadgeRisk : styles.capBadgeOk}>
            {over ? 'Over capacity all cycle' : 'Within capacity all cycle'}
          </span>
          <span className={styles.capNumsLg}>
            {wr.totalRequired} reserved / {wr.contributingCount} available
          </span>
        </div>

        <div className={styles.capLede}>
          {wr.contributingCount === 0 ? (
            <>This release has no team set, so there is no headcount to measure its streams against.</>
          ) : over ? (
            <>
              Across the whole release, the streams that carried work reserved <strong>{wr.totalRequired} engineers</strong>,
              but {team} has only <strong>{wr.contributingCount} contributing</strong>
              {wr.over > 0 ? <> — over by <strong>{wr.over}</strong>.</> : '.'} Completed streams are counted here, so this
              figure cannot improve just because work landed.
              {wr.outOfScopeRequired > 0 && (
                <> Including <strong>{wr.outOfScopeRequired}</strong> reserved by streams outside this view.</>
              )}
            </>
          ) : (
            <>
              Across the whole release, the streams that carried work reserved{' '}
              <strong>{wr.totalRequired} engineer{wr.totalRequired === 1 ? '' : 's'}</strong>, and {team} has{' '}
              <strong>{wr.contributingCount} contributing</strong>
              {wr.headroom > 0 ? <> — <strong>{wr.headroom}</strong> to spare.</> : ' — fully allocated throughout.'}
              {wr.outOfScopeRequired > 0 && (
                <> Including <strong>{wr.outOfScopeRequired}</strong> reserved by streams outside this view.</>
              )}
            </>
          )}
        </div>

        <div className={styles.capTable}>
          <div className={`${styles.capRow} ${styles.capRowHead}`}>
            <span>Scope vs. capacity</span>
            <span />
            <span />
          </div>
          <div className={styles.capRow}>
            <span className={styles.capStreamName}>Total scope</span>
            <span className={styles.capNum}>{wr.totalPts} pts</span>
            <span className={styles.capNum}>
              <span className={styles.dim}>{wr.donePts} done</span>
            </span>
          </div>
          <div className={styles.capRow}>
            <span className={styles.capStreamName}>Release capacity</span>
            <span className={styles.capNum}>{wr.totalCap} pts</span>
            <span className={styles.capNum}>
              <span className={styles.dim}>
                across {wr.sprintCount} sprint{wr.sprintCount === 1 ? '' : 's'}
              </span>
            </span>
          </div>
          <div className={styles.capRow}>
            <span className={styles.capStreamName}>{wr.overCommitted ? 'Over-committed by' : 'Headroom'}</span>
            <span className={styles.capNum}>
              <span style={{ color: wr.overCommitted ? 'var(--rt-st-bl-text)' : 'var(--rt-st-co-text)' }}>
                {wr.totalCap === 0 ? '—' : `${Math.abs(wr.scopeGap)} pts`}
              </span>
            </span>
            <span className={styles.capNum}>
              {wr.totalCap === 0 && <span className={styles.dim}>no velocity baseline</span>}
            </span>
          </div>
        </div>

        {wr.perSprint.length > 0 && (
          <>
            <div className={styles.capLede}>
              {wr.judgedSprints === 0
                ? 'No sprint in this release has a work stream holding work.'
                : wr.overbookedSprints === 0
                  ? `Within capacity in all ${wr.judgedSprints} sprint${wr.judgedSprints === 1 ? '' : 's'} that carried work.`
                  : `Overbooked in ${wr.overbookedSprints} of ${wr.judgedSprints} sprint${wr.judgedSprints === 1 ? '' : 's'} that carried work.`}
            </div>
            <div className={styles.allocStrip} role="group" aria-label="Allocation by sprint">
              {wr.perSprint.map((s, i) => (
                <div
                  key={i}
                  className={`${styles.allocSeg} ${s.idle ? styles.allocIdle : s.overAllocated ? styles.allocOver : styles.allocOk}`}
                  title={
                    s.idle
                      ? `${sprintNames[i] ?? `Sprint ${i + 1}`} — no work stream held work`
                      : `${sprintNames[i] ?? `Sprint ${i + 1}`} — ${s.totalRequired} reserved across ${s.streamCount} stream${s.streamCount === 1 ? '' : 's'}, ${wr.contributingCount} contributing`
                  }
                >
                  {i + 1}
                </div>
              ))}
            </div>
          </>
        )}

        {wr.streams.length > 0 && (
          <div className={styles.capTable}>
            <div className={`${styles.capRow} ${styles.capRowHead}`}>
              <span>Stream</span>
              <span>Reserved</span>
              <span>Scope needed</span>
            </div>
            {wr.streams.map((s, i) => (
              <div key={i} className={styles.capRow}>
                <span className={styles.capStreamCell}>
                  <span className={styles.capStreamName}>{s.name}</span>
                </span>
                <span className={styles.capNum}>
                  {s.engineersRequired == null ? <span className={styles.dim}>none</span> : `${s.engineersRequired} eng`}
                </span>
                <span className={styles.capNum}>
                  {s.engineersImplied.toFixed(1)} eng <span className={styles.dim}>· {s.totalPts} pts</span>
                </span>
              </div>
            ))}
          </div>
        )}

        <span className={styles.caption}>
          A final-plan reading: reservations, the roster and each item’s sprint are taken at the values they held when this
          summary was generated, so a change made mid-release reads as though it had always been so. Elapsed sprints do
          contribute the velocity they actually committed.
        </span>
      </div>
    </>
  );
}

/** Split a forecast "why" line into its clauses (comma / middot separated) so it
 *  renders as scannable bullets instead of one dense run-on string. */
function whyLines(summary: string): string[] {
  return summary
    .split(/\s*[,·]\s*/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/** One stream's state — verdict, progress, the plain-language "why", and meta.
 *  No chart: the burndown lives in its own section further down. */
function StreamStatusCard({ s }: { s: SnapshotStream }) {
  const blocked = s.segs.find((x) => x.k === 'Blocked')?.v ?? 0;
  const doneItems = s.doneItems ?? 0; // v1 payloads lack it
  const openItems = Math.max(0, s.itemCount - doneItems);
  return (
    <div className={`card ${styles.streamCard}`}>
      <div className={styles.streamHead}>
        <StreamName s={s} />
        <VerdictBadge verdict={s.forecast.verdict} />
      </div>

      {s.totalPts > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <div className={styles.streamProgress}>
            <span className="tag">Progress</span>
            <span className={styles.progNums}>
              {s.donePts} / {s.totalPts} pts · {s.pct}%
            </span>
          </div>
          <SegBar segs={s.segs as StatusSeg[]} height={10} radius={5} />
        </div>
      )}

      {s.itemCount > 0 && (
        <div className={styles.streamProgress}>
          <span className="tag">Work items</span>
          <span className={styles.progNums}>
            {doneItems} done · {openItems} open
          </span>
        </div>
      )}

      {(() => {
        const lines = whyLines(s.forecast.summary);
        return lines.length > 1 ? (
          <ul className={styles.whyList}>
            {lines.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        ) : (
          <div className={styles.why}>{s.forecast.summary}</div>
        );
      })()}

      <div className={styles.streamMeta}>
        <RunwayBadge verdict={s.runway.verdict} />
        {s.engineersRequired != null && <span>{s.engineersRequired} eng required</span>}
        {blocked > 0 && (
          <>
            {s.engineersRequired != null && <span className={styles.dot}>·</span>}
            <span style={{ color: 'var(--rt-st-bl-text)' }}>{blocked} blocked</span>
          </>
        )}
      </div>
    </div>
  );
}

/** One stream's remaining-work burndown vs. capacity. Rendered only for streams
 *  that can be forecast (an engineer count and estimated work). */
function StreamChartCard({ s }: { s: SnapshotStream }) {
  if (!s.burn) return null;
  return (
    <div className={`card ${styles.chartCard}`}>
      <div className={styles.chartHead}>
        <StreamName s={s} />
        <VerdictBadge verdict={s.forecast.verdict} />
      </div>
      <StreamBurnChart
        series={s.burn.series}
        firstRemainingIndex={s.burn.firstRemainingIndex}
        freezeX={s.burn.freezeX}
        activeIndex={s.burn.activeIndex}
        remainingPts={s.burn.remainingPts}
        effectiveCap={s.burn.effectiveCap}
        tone={s.burn.tone}
      />
    </div>
  );
}

/** The velocity-modification recommendation, when recent delivery diverges enough
 *  from the set velocity to warrant a change. Read-only — the viewer can't apply it. */
function VelocityRecommendation({ v, teamName }: { v: SnapshotPayload['velocity']; teamName: string | null }) {
  const s = v.suggestion;
  if (!s) return null;
  const team = teamName ?? 'The team';

  // No velocity baseline yet, but recent delivery gives one to seed from.
  if (v.verdict === 'no-baseline' && s.recentAvg > 0) {
    return (
      <div className={`card ${styles.reco}`}>
        <span className="tag">Recommendation</span>
        <div className={styles.recoBody}>
          {team} has no velocity set. Recent delivery averages{' '}
          <strong>~{s.recentAvg} pts</strong> over the last {s.sampleSize} elapsed sprint
          {s.sampleSize !== 1 ? 's' : ''} — a reasonable starting velocity.
        </div>
      </div>
    );
  }

  if (!s.meaningful) return null;
  return (
    <div className={`card ${styles.reco}`}>
      <span className="tag">Recommendation</span>
      <div className={styles.recoBody}>
        The last {s.sampleSize} sprint{s.sampleSize !== 1 ? 's' : ''} delivered ~<strong>{s.recentAvg} pts</strong> on
        average against a set velocity of <strong>{s.currentVelocity}</strong> — consider{' '}
        {s.delta < 0 ? 'lowering' : 'raising'} {team}’s velocity toward <strong>{s.recentAvg}</strong>.
      </div>
    </div>
  );
}

export function SummaryView({ snapshot, onBack }: { snapshot: SnapshotPayload; onBack: () => void }) {
  const o = snapshot.overall;
  const chartStreams = snapshot.streams.filter((s) => s.burn);

  return (
    <>
      <button type="button" className={styles.linkBtn} onClick={onBack}>
        {Icon.chevLeft} All summaries
      </button>

      <div className={styles.header}>
        <h1 className="t-title">{snapshot.name}</h1>
        <div className={styles.headerMeta}>
          {snapshot.teamName && <span>{snapshot.teamName}</span>}
          {snapshot.teamName && <span className={styles.dot}>·</span>}
          <span>{snapshot.dateRange}</span>
          {snapshot.connectorLabel && (
            <>
              <span className={styles.dot}>·</span>
              <span>{snapshot.connectorLabel}</span>
            </>
          )}
        </div>
      </div>

      <span className={styles.frozen} title="A point-in-time snapshot. It does not update on its own.">
        {Icon.snowflake} Point-in-time summary · generated {generatedOn(snapshot.generatedAtISO)} · local only view - no backend data calls
      </span>

      {snapshot.contributingMembers && snapshot.contributingMembers.length > 0 && (
        <p className={styles.contributors}>
          <span className={styles.contributorsLabel}>Contributing team</span>
          {snapshot.contributingMembers.join(', ')}
        </p>
      )}

      <div className={styles.stats}>
        <Stat value={`${o.completionPct}%`} label="Release complete" />
        <Stat value={`${o.donePts} / ${o.totalPts}`} label="Points done / total" />
        <Stat value={velocityLabel(snapshot.velocity)} label="Velocity attainment" tone={velocityTone(snapshot.velocity)} />
        <Stat
          value={String(o.teamVelocity)}
          label="Team velocity (pts/sprint)"
          tone={snapshot.velocity.suggestion?.meaningful ? 'warn' : 'neutral'}
        />
        <Stat
          value={`${o.engineersRequiredTotal} / ${o.contributingCount}`}
          label="Engineers req / available"
          tone={o.overAllocated ? 'risk' : 'ok'}
        />
      </div>

      {/* 1 · Release capacity — the highest-level signal, first. */}
      {snapshot.capacity && (
        <ReleaseCapacity cap={snapshot.capacity} teamName={snapshot.teamName} asOfISO={snapshot.generatedAtISO} />
      )}

      {/* 2 · Whole release — the retrospective counterpart, adjacent on purpose: the
          section above reads remaining work against remaining sprints and improves as
          streams finish, this one cannot. Absent on pre-v6 payloads. */}
      {snapshot.wholeRelease && (
        <WholeRelease
          wr={snapshot.wholeRelease}
          sprintNames={snapshot.sprints.map((sp) => sp.name)}
          teamName={snapshot.teamName}
        />
      )}

      {/* 3 · Work-stream status. */}
      <h2 className={styles.sectionTitle}>Work stream status</h2>
      <div className={styles.streamGrid}>
        {snapshot.streams.map((s, i) => (
          <StreamStatusCard key={i} s={s} />
        ))}
      </div>
      <StatusLegend streams={snapshot.streams} />

      {/* 4 · Sprints. */}
      <h2 className={styles.sectionTitle}>Sprints</h2>
      <div className={styles.sprintList}>
        {snapshot.sprints.map((sp, i) => {
          const frac = sp.vel > 0 ? Math.min(1, sp.planned / sp.vel) : sp.planned > 0 ? 1 : 0;
          const over = sp.vel > 0 && sp.planned > sp.vel;
          return (
            <div
              key={i}
              className={`card ${styles.sprintRow} ${sp.isActive ? styles.active : ''} ${sp.isPast ? styles.past : ''}`}
            >
              <div>
                <div className={styles.sprintName}>{sp.name}</div>
                <div className={styles.sprintDates}>{sp.dateRange}</div>
              </div>
              <div className={styles.capWrap}>
                <div className={styles.capBar}>
                  <div
                    className={styles.capFill}
                    style={{ width: `${Math.round(frac * 100)}%`, background: over ? 'var(--rt-st-bl-dot)' : 'var(--rt-st-ac-dot)' }}
                  />
                </div>
                <span className={styles.capNums}>
                  {sp.planned} / {sp.vel} pts
                  {sp.daysOff > 0 &&
                    (sp.capacityPct != null
                      ? ` · ${sp.daysOff} days off — effective capacity ${sp.capacityPct}%`
                      : ` · ${sp.daysOff}d off`)}
                </span>
              </div>
              <div className={styles.sprintDates}>
                {sp.isPast ? `${sp.donePts} pts completed` : `${sp.itemCount} item${sp.itemCount === 1 ? '' : 's'} planned`}
              </div>
              <div className={styles.events}>
                {sp.events.map((e, j) => (
                  <span
                    key={j}
                    className={styles.evChip}
                    style={e.critical ? { background: warningVars().soft, color: warningVars().text } : undefined}
                  >
                    {e.critical && Icon.snowflake}
                    {e.label}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* 5 · Work-stream burndown charts. */}
      {chartStreams.length > 0 && (
        <>
          <h2 className={styles.sectionTitle}>Work stream burndown</h2>
          <p className={styles.caption} style={{ marginTop: -8 }}>
            Remaining work burned down by each stream’s capacity, up to its code freeze. Where the line reaches zero is
            the projected finish; a gap at the freeze is the shortfall.
          </p>
          <div className={styles.streamGrid}>
            {chartStreams.map((s, i) => (
              <StreamChartCard key={i} s={s} />
            ))}
          </div>
        </>
      )}

      {/* 6 · Velocity. */}
      {snapshot.velocity.series.length > 0 && (
        <>
          <h2 className={styles.sectionTitle}>Velocity</h2>
          <div className={`card ${styles.chartCard}`}>
            <span className="tag">Delivered vs. planned per elapsed sprint</span>
            <VelocityTrendChart
              series={snapshot.velocity.series}
              tone={snapshot.velocity.verdict === 'under' ? 'under' : 'ok'}
            />
            <span className={styles.caption}>
              Faint bars are each sprint's planned velocity (capacity-adjusted); bold bars + line are points completed.
            </span>
          </div>
          <VelocityRecommendation v={snapshot.velocity} teamName={snapshot.teamName} />
        </>
      )}
    </>
  );
}
