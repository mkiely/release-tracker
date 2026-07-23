import type { SnapshotPayload, SnapshotStream } from '../lib/releaseSnapshot';
import type { Status, StatusSeg } from '../types';
import { SegBar } from '../components/badges';
import { VerdictBadge, RunwayBadge } from '../components/VerdictLine';
import { StreamBurnChart, VelocityTrendChart } from '../components/trend';
import { statusVars, warningVars } from '../components/statusVars';
import { Icon } from '../components/Icon';
import { fmtLong } from '../lib/dates';
import styles from './summary.module.css';

/** Human date from the snapshot's ISO timestamp (date part only). */
function generatedOn(iso: string): string {
  return fmtLong(iso.slice(0, 10));
}

const STATUS_ORDER: Status[] = ['Not Started', 'In Progress', 'Under Review', 'Blocked', 'Complete'];

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
 *  and (when over-allocated) how each stream's effective staffing is scaled down. */
function ReleaseCapacity({ cap, teamName }: { cap: SnapshotPayload['capacity']; teamName: string | null }) {
  const team = teamName ?? 'the team';
  const over = cap.overAllocated;
  return (
    <>
      <h2 className={styles.sectionTitle}>Release capacity</h2>
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
              The streams with work remaining collectively need{' '}
              <strong>{cap.totalRequired} engineers</strong>, but {team} has only{' '}
              <strong>{cap.contributingCount} contributing</strong> — over by <strong>{cap.over}</strong>. No one can be
              on everything at once, so each stream is effectively staffed at{' '}
              <strong>{Math.round(cap.scale * 100)}%</strong> and its forecast reflects that.
            </>
          ) : (
            <>
              The streams with work remaining need <strong>{cap.totalRequired} engineer{cap.totalRequired === 1 ? '' : 's'}</strong>,
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
                <span className={styles.capStreamName}>{s.name}</span>
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

/** One stream's state — verdict, progress, the plain-language "why", and meta.
 *  No chart: the burndown lives in its own section further down. */
function StreamStatusCard({ s }: { s: SnapshotStream }) {
  const blocked = s.segs.find((x) => x.k === 'Blocked')?.v ?? 0;
  const doneItems = s.doneItems ?? 0; // v1 payloads lack it
  const openItems = Math.max(0, s.itemCount - doneItems);
  return (
    <div className={`card ${styles.streamCard}`}>
      <div className={styles.streamHead}>
        <span className={styles.streamName}>{s.name}</span>
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

      <div className={styles.why}>{s.forecast.summary}</div>

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
        <span className={styles.streamName}>{s.name}</span>
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
        {Icon.snowflake} Point-in-time summary · generated {generatedOn(snapshot.generatedAtISO)} · localy only view no backend
      </span>

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
      {snapshot.capacity && <ReleaseCapacity cap={snapshot.capacity} teamName={snapshot.teamName} />}

      {/* 2 · Work-stream status. */}
      <h2 className={styles.sectionTitle}>Work stream status</h2>
      <div className={styles.streamGrid}>
        {snapshot.streams.map((s, i) => (
          <StreamStatusCard key={i} s={s} />
        ))}
      </div>
      <StatusLegend streams={snapshot.streams} />

      {/* 3 · Sprints. */}
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
                  {sp.planned} / {sp.vel} pts{sp.daysOff > 0 ? ` · ${sp.daysOff}d off` : ''}
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

      {/* 4 · Work-stream burndown charts. */}
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

      {/* 5 · Velocity. */}
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
