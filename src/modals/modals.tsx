// Interactive modals wired to the store — ported from proto-modals.jsx.

import { useState, type ReactNode } from 'react';
import { LOCAL_ITEM_TYPES, STATUSES, type AttrValue, type Member, type Status } from '../types';
import { between, fmtShort, todayISO, workdaysInRange } from '../lib/dates';
import { capPct, fullCap, releaseCapacity, sprintVel, streamContention, streamForecast, streamHealth, sumPoints, velocityAttainment, velocitySuggestion } from '../lib/derive';
import { getActions, selItem, selItemsFor, selRelease, selTeam, useStore } from '../store/store';
import { buildPushPreview, type PushItemPreview } from '../sync/push';
import { attributeFields, CANONICAL_FIELDS, conceptWriteable, itemTypeFor, writeableAttributeFields, writeableLocalFields, type CanonicalView, type EditConcept } from '../lib/connectorFields';
import { displayValue, FieldControl } from '../components/fields/registry';
import { useConnectorMeta } from '../hooks/useConnectorMeta';
import type { SharePayload } from '../lib/shareRelease';
import { DirtyDot } from '../components/DirtyDot';
import { RichTextEditor } from '../components/RichTextEditor';
import { useApp } from '../app-context';
import { Icon } from '../components/Icon';
import { IconButton, Modal, PButton, PField, PInput, PointSeg, PSelect, PTextarea } from '../components/primitives';
import { SegBar } from '../components/badges';
import { StreamBurnChart, VelocityTrendChart } from '../components/trend';
import { VerdictBadge } from '../components/VerdictLine';
import { statusVars, verdictVars } from '../components/statusVars';

// ── Confirm / danger modal ─────────────────────────────────────────────
export function ConfirmModal({
  title,
  body,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const handleConfirm = () => { onConfirm(); onClose(); };
  return (
    <Modal
      title={title}
      icon={Icon.trash}
      onClose={onClose}
      width={420}
      footer={
        <>
          <PButton variant="subtle" onClick={onClose}>
            Cancel
          </PButton>
          <PButton variant="danger" onClick={handleConfirm}>
            {confirmLabel}
          </PButton>
        </>
      }
    >
      <span style={{ fontSize: 'var(--rt-fs-md)', color: 'var(--rt-t2)', lineHeight: 'var(--rt-lh-normal)' }}>{body}</span>
    </Modal>
  );
}

// ── Load shared release modal ──────────────────────────────────────────
// Shown when the app opens with a `?share=` link. Confirms loading a release
// from a decoded share payload (config + events + days off); work items and
// streams are not included and arrive when the user syncs.
export function LoadShareModal({
  payload,
  onConfirm,
  onClose,
}: {
  payload: SharePayload;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const meta = useConnectorMeta(payload.connector.type);
  const connName = meta?.label ?? payload.connector.type;
  const eventCount = payload.events.length;
  const sprintCount = payload.sprints.length;
  const handleConfirm = () => { onConfirm(); onClose(); };
  return (
    <Modal
      title="Load shared release"
      icon={Icon.release}
      onClose={onClose}
      width={460}
      footer={
        <>
          <PButton variant="subtle" onClick={onClose}>
            Cancel
          </PButton>
          <PButton onClick={handleConfirm}>
            Load release
          </PButton>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 'var(--rt-fs-md)', color: 'var(--rt-t2)', lineHeight: 'var(--rt-lh-normal)' }}>
        <span>
          Load <strong style={{ color: 'var(--rt-ink)' }}>{payload.name}</strong> as a new release connected to{' '}
          <strong style={{ color: 'var(--rt-ink)' }}>{connName}</strong>?
        </span>
        <span style={{ color: 'var(--rt-t3)', fontSize: 'var(--rt-fs-sm)' }}>
          This brings over the connector configuration{eventCount > 0 ? `, ${eventCount} event${eventCount !== 1 ? 's' : ''}` : ''}
          {sprintCount > 0 ? `, and ${sprintCount} sprint${sprintCount !== 1 ? 's' : ''} with days off` : ''}. Work items and
          work streams aren’t included — click Sync after loading to fetch them from your backend.
        </span>
      </div>
    </Modal>
  );
}

// ── Team create / edit modal ───────────────────────────────────────────
export function TeamModal({ teamId, onClose }: { teamId?: string; onClose: () => void }) {
  const editing = !!teamId;
  const existing = useStore((s) => (teamId ? selTeam(s, teamId) : undefined));

  // Track members as objects to preserve id + externalId + nonContributing on edit.
  type LocalMember = { id: string; name: string; externalId: string | null; nonContributing: boolean };
  const [name, setName] = useState(existing ? existing.name : '');
  const [velocity, setVelocity] = useState(existing ? String(existing.velocity) : '');
  const [members, setMembers] = useState<LocalMember[]>(
    existing && existing.members.length
      ? existing.members.map((m) => ({ id: m.id, name: m.name, externalId: m.externalId, nonContributing: m.nonContributing }))
      : [{ id: `m_${Math.random().toString(36).slice(2)}`, name: '', externalId: null, nonContributing: false }],
  );

  const setMemberName = (i: number, v: string) =>
    setMembers((ms) => ms.map((m, j) => (j === i ? { ...m, name: v } : m)));
  const toggleNonContrib = (i: number) =>
    setMembers((ms) => ms.map((m, j) => (j === i ? { ...m, nonContributing: !m.nonContributing } : m)));
  const addMember = () =>
    setMembers((ms) => [...ms, { id: `m_${Math.random().toString(36).slice(2)}`, name: '', externalId: null, nonContributing: false }]);
  const rmMember = (i: number) => setMembers((ms) => ms.filter((_, j) => j !== i));

  const canSave = name.trim().length > 0;
  const save = () => {
    const filteredMembers: Member[] = members
      .filter((m) => m.name.trim())
      .map((m) => ({ id: m.id, name: m.name.trim(), externalId: m.externalId, nonContributing: m.nonContributing }));
    if (editing && teamId) {
      getActions().updateTeam(teamId, {
        name: name.trim(),
        velocity: Number(velocity) || 0,
        members: filteredMembers,
      });
    } else {
      getActions().createTeam({ name, velocity, members: filteredMembers.map((m) => m.name) });
    }
    onClose();
  };

  const named = members.filter((m) => m.name.trim()).length;
  return (
    <Modal
      title={editing ? 'Edit team' : 'Create team'}
      icon={Icon.team}
      onClose={onClose}
      width={470}
      footer={
        <>
          <PButton variant="subtle" onClick={onClose}>
            Cancel
          </PButton>
          <PButton onClick={save} disabled={!canSave}>
            {editing ? 'Save team' : 'Create team'}
          </PButton>
        </>
      }
    >
      <PField label="Team name">
        <PInput autoFocus value={name} placeholder="e.g. Platform Core" onChange={(e) => setName(e.target.value)} />
      </PField>
      <PField label="Velocity (points / sprint)" hint="points the team finishes at full capacity">
        <PInput type="number" min="0" value={velocity} placeholder="e.g. 40" onChange={(e) => setVelocity(e.target.value)} />
      </PField>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span className="flabel">Members</span>
          <span style={{ fontSize: 'var(--rt-fs-sm)', color: 'var(--rt-t3)' }}>{named}</span>
        </div>
        {members.map((m, i) => {
          const isSynced = !!m.externalId;
          return (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span className="avatar">
                {m.name.trim() ? m.name.trim().split(' ').map((p) => p[0]).slice(0, 2).join('') : i + 1}
              </span>
              <PInput
                value={m.name}
                placeholder="Member name"
                disabled={isSynced}
                onChange={(e) => setMemberName(i, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addMember();
                  }
                }}
                style={{ flex: 1 }}
              />
              <IconButton
                icon={m.nonContributing ? Icon.memberOff : Icon.member}
                title={m.nonContributing ? 'Non-contributing (click to mark contributing)' : 'Contributing (click to mark non-contributing)'}
                onClick={() => toggleNonContrib(i)}
                style={{
                  border: 'none',
                  color: m.nonContributing ? 'var(--rt-t3)' : 'var(--rt-accent)',
                  opacity: m.nonContributing ? 0.5 : 1,
                }}
              />
              {isSynced ? (
                <span className="tag" style={{ flex: '0 0 auto', fontSize: 'var(--rt-fs-micro)', color: 'var(--rt-t3)' }}>
                  synced
                </span>
              ) : (
                <IconButton
                  icon={Icon.trash}
                  title="Remove"
                  onClick={() => rmMember(i)}
                  style={{ border: 'none', color: 'var(--rt-t3)', visibility: members.length > 1 ? 'visible' : 'hidden' }}
                />
              )}
            </div>
          );
        })}
        <PButton variant="subtle" sm onClick={addMember} style={{ alignSelf: 'flex-start' }}>
          {Icon.plus} Add member
        </PButton>
      </div>
    </Modal>
  );
}

// ── Work Stream create / edit modal ────────────────────────────────────
export function WorkStreamModal({ releaseId, wsId, onClose }: { releaseId: string; wsId?: string; onClose: () => void }) {
  const r = useStore((s) => selRelease(s, releaseId));
  const existing = wsId ? r?.workStreams.find((w) => w.id === wsId) : undefined;
  const editing = !!existing;
  // The connector owns the names of synced streams — keep the field read-only so a
  // local rename can't be silently overwritten on the next sync. engineersRequired is
  // app-owned and stays editable regardless.
  const nameLocked = !!existing?.externalId;
  const [name, setName] = useState(existing ? existing.name : '');
  const [engineers, setEngineers] = useState(
    existing && existing.engineersRequired != null ? String(existing.engineersRequired) : '',
  );
  const parseEngineers = (): number | null => {
    const n = Number(engineers);
    return engineers.trim() && Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
  };
  const save = () => {
    if (!name.trim()) return;
    if (editing && wsId) {
      getActions().updateWorkStream(releaseId, wsId, { name: name.trim(), engineersRequired: parseEngineers() });
    } else {
      const ws = getActions().createWorkStream(releaseId, name.trim());
      const er = parseEngineers();
      if (ws && er != null) getActions().updateWorkStream(releaseId, ws.id, { engineersRequired: er });
    }
    onClose();
  };
  return (
    <Modal
      title={editing ? 'Edit work stream' : 'New work stream'}
      icon={Icon.stream}
      onClose={onClose}
      width={440}
      footer={
        <>
          <PButton variant="subtle" onClick={onClose}>
            Cancel
          </PButton>
          <PButton onClick={save} disabled={!name.trim()}>
            {editing ? 'Save' : 'Create'}
          </PButton>
        </>
      }
    >
      <PField label="Name" hint={nameLocked ? 'managed by the connector' : undefined}>
        <PInput
          autoFocus={!nameLocked}
          value={name}
          disabled={nameLocked}
          placeholder="e.g. Checkout API"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
          }}
        />
      </PField>
      <PField label="Engineers required" hint="drives the capacity-fit health forecast">
        <PInput
          autoFocus={nameLocked}
          type="number"
          min="0"
          step="1"
          value={engineers}
          placeholder="e.g. 2"
          onChange={(e) => setEngineers(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
          }}
        />
      </PField>
      <span style={{ fontSize: 'var(--rt-fs-sm)', color: 'var(--rt-t3)' }}>
        {nameLocked
          ? "This stream's name is managed by the connector. Engineers required is kept locally and survives sync."
          : "A work stream groups related work items across the release's sprints. Engineers required is kept locally and survives connector sync."}
      </span>
    </Modal>
  );
}

// ── Verdict badge (shared by the health modal + stream table) ───────────
// ── Work-stream health detail modal (read-only) ─────────────────────────
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
  const streamItems = items.filter((i) => i.workStreamId === wsId);
  const health = streamHealth(streamItems);
  const ctx = releaseCapacity(r, team);
  const contention = streamContention(
    r.workStreams
      .filter((w) => w.engineersRequired != null && streamHealth(items.filter((i) => i.workStreamId === w.id)).remainingPts > 0)
      .map((w) => w.engineersRequired!),
    ctx.contributingCount,
  );
  const forecast = streamForecast(health, ws.engineersRequired, ctx, contention);
  const v = verdictVars(forecast.verdict);

  const series = r.sprints.map((sp) => sumPoints(streamItems.filter((i) => i.sprintId === sp.id)));
  const today = todayISO();
  const friRaw = r.sprints.findIndex((sp) => sp.endISO >= today);
  const firstRemainingIndex = friRaw < 0 ? r.sprints.length : friRaw;
  const activeIndex = r.sprints.findIndex((sp) => between(today, sp.startISO, sp.endISO));

  const n1 = (x: number) => (Math.round(x * 10) / 10).toString();
  const shortfall = forecast.shortfallPts;
  const configured = ws.engineersRequired != null;
  // A capacity-fit forecast needs both an engineer count and estimated work.
  const canForecast = configured && health.totalPts > 0;

  const editStream = () => openModal({ type: 'stream', releaseId, wsId });

  return (
    <Modal
      onClose={onClose}
      width={640}
      title={
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <VerdictBadge verdict={forecast.verdict} />
          <span style={{ fontSize: 'var(--rt-fs-lg)', fontWeight: 'var(--rt-fw-heading)' }}>{ws.name}</span>
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
            activeIndex={activeIndex}
            remainingPts={health.remainingPts}
            effectiveCap={forecast.effectiveCap}
            tone={v.tone === 'risk' ? 'risk' : 'ok'}
          />
          <span style={{ fontSize: 'var(--rt-fs-micro)', color: 'var(--rt-t3)', lineHeight: 1.4 }}>
            Bars show planned points per sprint (x-axis = sprint assignment, not completion history — an approximation).
            The line burns the remaining {health.remainingPts} pts down by the stream's capacity; where it reaches zero is the projected finish.
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
        <div className="card" style={{ background: 'var(--rt-bg)', padding: '15px 16px', display: 'flex', flexDirection: 'column', gap: 9 }}>
          <span className="tag" style={{ marginBottom: 2 }}>The calculation</span>
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
          <Row k="Runway" v={Number.isFinite(forecast.runwaySprints) ? `~${n1(forecast.runwaySprints)} sprints` : '—'} />
          <hr className="divider" style={{ margin: '3px 0' }} />
          <Row
            k={shortfall > 0.5 ? 'Shortfall' : 'Surplus'}
            v={`${shortfall > 0.5 ? '' : '+'}${Math.round(Math.abs(shortfall))} pts`}
            big
          />
        </div>
      )}
    </Modal>
  );
}

// ── Velocity attainment detail (read-only) ──────────────────────────────
export function VelocityModal({ releaseId, onClose }: { releaseId: string; onClose: () => void }) {
  const r = useStore((s) => selRelease(s, releaseId));
  const team = useStore((s) => (r ? selTeam(s, r.teamId) : undefined));
  const allItems = useStore((s) => s.items);
  const { notify } = useApp();

  if (!r) {
    return (
      <Modal title="Velocity" icon={Icon.sprint} onClose={onClose} width={560}>
        <span style={{ color: 'var(--rt-t3)' }}>This release no longer exists.</span>
      </Modal>
    );
  }

  const items = allItems.filter((i) => i.releaseId === releaseId);
  const v = velocityAttainment(r, team, items);
  const suggestion = velocitySuggestion(r, team, items);
  const under = v.verdict === 'under';
  const none = v.verdict === 'none';
  const tone = statusVars(under ? 'Blocked' : 'Complete');

  // Applying is safe only because started sprints carry a frozen plannedVelocity
  // baseline (see docs/metrics.md): lowering team.velocity moves future sprints
  // but never rewrites the elapsed/active attainment this suggestion came from.
  const onApply = () => {
    if (!suggestion || !r.teamId) return;
    getActions().updateTeam(r.teamId, { velocity: suggestion.recentAvg });
    notify(`Team velocity set to ${suggestion.recentAvg} pts — started sprints keep their baselines`);
  };

  return (
    <Modal
      onClose={onClose}
      width={620}
      title={
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 'var(--rt-fs-lg)', fontWeight: 'var(--rt-fw-heading)' }}>Velocity attainment</span>
          {!none && (
            <span style={{ fontSize: 'var(--rt-fs-lg)', fontWeight: 'var(--rt-fw-display)', color: tone.dot }}>{v.attainmentPct}%</span>
          )}
        </span>
      }
      footer={
        <PButton variant="subtle" onClick={onClose}>
          Close
        </PButton>
      }
    >
      {none ? (
        <div className="card dash" style={{ padding: '18px 16px', color: 'var(--rt-t3)', fontSize: 'var(--rt-fs-sm)', lineHeight: 1.5 }}>
          No sprint has fully elapsed yet — attainment appears once the first sprint ends.
        </div>
      ) : (
        <>
          <div style={{ fontSize: 'var(--rt-fs-md)', color: 'var(--rt-t2)', lineHeight: 1.5 }}>
            The team delivered <strong style={{ color: tone.dot }}>{v.totalActual}</strong> of{' '}
            <strong>{v.totalPlanned}</strong> planned points across {v.perSprint.length} elapsed sprint
            {v.perSprint.length !== 1 ? 's' : ''} — {under ? 'below' : 'meeting'} the set velocity.
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
              return (
                <Row
                  key={s.sprint.id}
                  k={s.sprint.name}
                  v={`${s.actual} / ${s.planned} pts${pct !== null ? ` · ${pct}%` : ''}`}
                />
              );
            })}
            <hr className="divider" style={{ margin: '3px 0' }} />
            <Row k="Total" v={`${v.totalActual} / ${v.totalPlanned} pts · ${v.attainmentPct}%`} big />
          </div>
        </>
      )}
    </Modal>
  );
}

// ── Team over-allocation explainer (read-only) ──────────────────────────
export function TeamAllocationsModal({ releaseId, onClose }: { releaseId: string; onClose: () => void }) {
  const r = useStore((s) => selRelease(s, releaseId));
  const team = useStore((s) => (r ? selTeam(s, r.teamId) : undefined));
  const allItems = useStore((s) => s.items);
  const { openModal } = useApp();

  if (!r) {
    return (
      <Modal title="Team capacity" icon={Icon.alert} onClose={onClose} width={520}>
        <span style={{ color: 'var(--rt-t3)' }}>This release no longer exists.</span>
      </Modal>
    );
  }

  const items = allItems.filter((i) => i.releaseId === releaseId);
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
  const sv = isOver ? statusVars('Blocked') : statusVars('Complete');

  return (
    <Modal
      onClose={onClose}
      width={560}
      title={
        <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={{ display: 'inline-flex', color: sv.text }}>{isOver ? Icon.alert : Icon.check}</span>
          <span style={{ fontSize: 'var(--rt-fs-lg)', fontWeight: 'var(--rt-fw-heading)' }}>
            {isOver ? 'Team over-allocated' : 'Team allocations'}
          </span>
        </span>
      }
      footer={
        <PButton variant="subtle" onClick={onClose}>
          Close
        </PButton>
      }
    >
      <div style={{ fontSize: 'var(--rt-fs-md)', color: 'var(--rt-t2)', lineHeight: 1.5 }}>
        {isOver ? (
          <>
            The active work streams collectively ask for <strong style={{ color: 'var(--rt-ink)' }}>{contention.totalRequired} engineers</strong>, but{' '}
            {team ? team.name : 'the team'} has only <strong style={{ color: 'var(--rt-ink)' }}>{ctx.contributingCount} contributing</strong>
            {over > 0 ? <> — over by <strong style={{ color: 'var(--rt-ink)' }}>{over}</strong>.</> : '.'} Everyone can't be on everything at once, so
            each stream's <em>effective</em> staffing is scaled down and its forecast below reflects that contention.
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

      {/* Per-stream demand */}
      <div className="card" style={{ background: 'var(--rt-bg)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 9 }}>
        <span className="tag" style={{ marginBottom: 2 }}>Engineers requested · active streams</span>
        {active.length === 0 ? (
          <span style={{ fontSize: 'var(--rt-fs-sm)', color: 'var(--rt-t3)' }}>No active streams have a configured engineer requirement.</span>
        ) : (
          active.map((s) => (
            <Row key={s.ws.id} k={s.ws.name} v={`${s.ws.engineersRequired} eng · ${s.remainingPts} pts left`} />
          ))
        )}
        <hr className="divider" style={{ margin: '3px 0' }} />
        <Row k="Total requested" v={`${contention.totalRequired} eng`} />
      </div>

      {/* The math */}
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
        {isOver ? (
          <>
            To clear the over-allocation, lower some streams' <strong style={{ color: 'var(--rt-t2)' }}>engineers required</strong>, add contributing
            team members, or move work out of the release. Open any stream's verdict to see its individual capacity-fit detail.
          </>
        ) : (
          <>Open any stream's verdict to see its individual capacity-fit detail.</>
        )}
      </div>

      {team && (
        <PButton variant="subtle" onClick={() => openModal({ type: 'team', teamId: team.id })} style={{ alignSelf: 'flex-start' }}>
          {Icon.team} View team
        </PButton>
      )}
    </Modal>
  );
}

// ── Event create / edit modal ───────────────────────────────────────────
export function EventModal({ releaseId, eventId, onClose }: { releaseId: string; eventId?: string; onClose: () => void }) {
  const r = useStore((s) => selRelease(s, releaseId))!;
  const existing = eventId ? r.events.find((e) => e.id === eventId) : null;
  const editing = !!existing;
  const [label, setLabel] = useState(existing ? existing.label : '');
  const [date, setDate] = useState(existing ? existing.dateISO : '');
  const sp = date ? r.sprints.find((s) => between(date, s.startISO, s.endISO)) : null;
  const save = () => {
    if (!label.trim() || !date) return;
    if (editing) {
      getActions().updateEvent(releaseId, eventId!, { label: label.trim(), dateISO: date });
    } else {
      getActions().createEvent(releaseId, { label: label.trim(), dateISO: date });
    }
    onClose();
  };
  const remove = () => {
    getActions().deleteEvent(releaseId, eventId!);
    onClose();
  };
  const minDate = r.sprints.length ? r.sprints[0].startISO : undefined;
  const maxDate = r.sprints.length ? r.sprints[r.sprints.length - 1].endISO : undefined;
  return (
    <Modal
      title={editing ? 'Edit event' : 'New event'}
      icon={Icon.event}
      onClose={onClose}
      width={460}
      footer={
        <>
          {editing && (
            <PButton variant="danger" onClick={remove} style={{ marginRight: 'auto' }}>
              Delete
            </PButton>
          )}
          <PButton variant="subtle" onClick={onClose}>
            Cancel
          </PButton>
          <PButton onClick={save} disabled={!label.trim() || !date}>
            {editing ? 'Save event' : 'Add event'}
          </PButton>
        </>
      }
    >
      <PField label="Label">
        <PInput autoFocus value={label} placeholder="e.g. Code freeze" onChange={(e) => setLabel(e.target.value)} />
      </PField>
      <PField label="Date">
        <PInput
          type="date"
          value={date}
          min={minDate}
          max={maxDate}
          onChange={(e) => setDate(e.target.value)}
        />
      </PField>
      <div className="card" style={{ background: 'var(--rt-bg)', padding: '13px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 9, height: 9, borderRadius: 2, background: sp ? 'var(--rt-st-ac-dot)' : 'var(--rt-line-strong)', flex: '0 0 auto' }} />
        <span style={{ fontSize: 'var(--rt-fs-base)', color: 'var(--rt-t2)', lineHeight: 1.45 }}>
          {!date ? (
            'Pick a date within the release to place this event on a sprint.'
          ) : sp ? (
            <>
              Falls inside <strong style={{ color: 'var(--rt-ink)' }}>{sp.name}</strong> ({fmtShort(sp.startISO)} – {fmtShort(sp.endISO)}) — it'll
              show on that sprint row.
            </>
          ) : (
            'That date is outside the release range.'
          )}
        </span>
      </div>
    </Modal>
  );
}

// ── Sprint edit modal (name + days off → capacity) ─────────────────────
function Row({ k, v, big }: { k: ReactNode; v: ReactNode; big?: boolean }) {
  return (
    <div className="calc" style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, fontSize: big ? 15 : 13 }}>
      <span title={typeof k === 'string' ? k : undefined} style={{ color: big ? 'var(--rt-ink)' : 'var(--rt-t2)', fontWeight: big ? 700 : 400, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k}</span>
      <span className="mono" style={{ fontWeight: 'var(--rt-fw-semibold)', color: big ? statusVars('In Progress').text : 'var(--rt-ink)', whiteSpace: 'nowrap', fontSize: big ? 15 : 13 }}>
        {v}
      </span>
    </div>
  );
}

export function SprintModal({ releaseId, sprintId, onClose }: { releaseId: string; sprintId: string; onClose: () => void }) {
  const r = useStore((s) => selRelease(s, releaseId))!;
  const team = useStore((s) => selTeam(s, r.teamId));
  const sp = r.sprints.find((s) => s.id === sprintId)!;
  const isConnector = !!r.connector;
  const [name, setName] = useState(sp.name);
  const [daysOff, setDaysOff] = useState(String(sp.daysOff));
  const off = Math.max(0, Number(daysOff) || 0);
  const workdays = workdaysInRange(sp.startISO, sp.endISO);
  const full = fullCap(team, sp);
  const pct = Math.round(capPct(team, sp, off) * 100);
  const vel = sprintVel(team, sp, off);
  // Capacity counts only contributing members — must match fullCap()'s filter so
  // the displayed "members × workdays = full" equation is internally consistent.
  const memberCount = team ? team.members.filter((m) => !m.nonContributing).length : 0;
  const save = () => {
    getActions().updateSprint(releaseId, sprintId, { name: name.trim() || sp.name, daysOff: off });
    onClose();
  };
  return (
    <Modal
      title={isConnector ? `${sp.name} · Days off` : `Edit ${sp.name}`}
      icon={isConnector ? Icon.cal : Icon.sprint}
      onClose={onClose}
      width={500}
      footer={
        <>
          <PButton variant="subtle" onClick={onClose}>
            Cancel
          </PButton>
          <PButton onClick={save}>{isConnector ? 'Save' : 'Save sprint'}</PButton>
        </>
      }
    >
      {isConnector && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', marginBottom: 4, fontSize: 'var(--rt-fs-xs)', color: 'var(--rt-t3)', background: 'var(--rt-fill)', border: `1.5px solid ${'var(--rt-line)'}`, borderRadius: 7 }}>
          {Icon.sync}
          <span>Sprint details are managed by the connector. <strong style={{ color: 'var(--rt-t2)', fontWeight: 'var(--rt-fw-semibold)' }}>Days off</strong> is stored locally.</span>
        </div>
      )}
      {!isConnector && (
        <PField label="Sprint name">
          <PInput autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </PField>
      )}
      <div style={{ display: 'flex', gap: 12 }}>
        <PField label="Days off (person-days)" style={{ flex: 1 }}>
          <PInput autoFocus={isConnector} type="number" min="0" value={daysOff} onChange={(e) => setDaysOff(e.target.value)} />
        </PField>
        <PField label="Sprint dates" style={{ flex: 1 }}>
          <span style={{
            display: 'flex', alignItems: 'center',
            width: '100%', border: '1.5px solid var(--rt-line-strong)',
            background: 'var(--rt-paper)', borderRadius: 9,
            padding: '11px 13px', fontSize: 'var(--rt-fs-md)', fontFamily: 'inherit',
            color: 'var(--rt-t2)', minHeight: 46,
          }}>
            {fmtShort(sp.startISO)} – {fmtShort(sp.endISO)}
          </span>
        </PField>
      </div>
      <span style={{ fontSize: 'var(--rt-fs-xs)', color: 'var(--rt-t3)', marginTop: -4 }}>
        One holiday for a team of {memberCount} = {memberCount} days off.
      </span>
      <div className="card" style={{ background: 'var(--rt-bg)', padding: '15px 16px', display: 'flex', flexDirection: 'column', gap: 9 }}>
        <span className="tag" style={{ marginBottom: 2 }}>
          Expected velocity
        </span>
        <Row k="Team velocity" v={`${team ? team.velocity : 0} pts`} />
        <Row k="Full capacity" v={`${memberCount} × ${workdays} = ${full} person-days`} />
        <Row k="Days off" v={`− ${off}`} />
        <Row k="% of capacity" v={`${full - off} / ${full} = ${pct}%`} />
        <hr className="divider" style={{ margin: '3px 0' }} />
        <Row k="Sprint velocity" v={`${team ? team.velocity : 0} × ${pct}% = ${vel} pts`} big />
      </div>
    </Modal>
  );
}

// ── Work Item create modal ──────────────────────────────────────────────
export function WorkItemModal({
  releaseId,
  presetStreamId,
  presetSprintId,
  onClose,
}: {
  releaseId: string;
  presetStreamId?: string;
  presetSprintId?: string;
  onClose: () => void;
}) {
  const r = useStore((s) => selRelease(s, releaseId))!;
  const team = useStore((s) => selTeam(s, r.teamId));
  const defaultSprintId = (() => {
    const a = r.sprints.find((s) => between(new Date().toISOString().slice(0, 10), s.startISO, s.endISO));
    return a ? a.id : (r.sprints[0]?.id ?? null); // active sprint, else first, else backlog
  })();
  const [subject, setSubject] = useState('');
  const [desc, setDesc] = useState('');
  const [wsId, setWsId] = useState<string | null>(presetStreamId || (r.workStreams[0] && r.workStreams[0].id) || null);
  const [sprintId, setSprintId] = useState<string | null>(presetSprintId ?? defaultSprintId);
  const [status, setStatus] = useState<Status>('Not Started');
  const [points, setPoints] = useState<number | null>(null);
  const [assignedMemberId, setAssignedMemberId] = useState<string | null>(null);
  const [typeLabel, setTypeLabel] = useState<string>('');
  const canSave = !!subject.trim();
  const save = () => {
    const itemType = (!r.connector && typeLabel) ? { id: null, label: typeLabel } : null;
    getActions().createItem(releaseId, { workStreamId: wsId, sprintId, subject: subject.trim(), description: desc, status, points, assignedMemberId, itemType });
    onClose();
  };
  return (
    <Modal
      title="New work item"
      icon={Icon.item}
      onClose={onClose}
      width="var(--rt-modal-w-work-item)"
      footer={
        <>
          <PButton variant="subtle" onClick={onClose}>
            Cancel
          </PButton>
          <PButton onClick={save} disabled={!canSave}>
            Create work item
          </PButton>
        </>
      }
    >
      <PField label="Subject">
        <PInput autoFocus value={subject} placeholder="Short summary of the work" onChange={(e) => setSubject(e.target.value)} />
      </PField>
      <PField label="Description" hint="supports markdown pasted content">
        <RichTextEditor value={desc} onChange={setDesc} />
      </PField>
      <div style={{ display: 'flex', gap: 12 }}>
        <PField label="Work stream" style={{ flex: 1 }}>
          <PSelect value={wsId ?? ''} onChange={(e) => setWsId(e.target.value || null)}>
            <option value="">None (unassigned)</option>
            {r.workStreams.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </PSelect>
        </PField>
        <PField label="Sprint" style={{ flex: 1 }}>
          <PSelect value={sprintId ?? ''} onChange={(e) => setSprintId(e.target.value || null)}>
            <option value="">Backlog</option>
            {r.sprints.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </PSelect>
        </PField>
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        <PField label="Assignee" style={{ flex: 1 }}>
          <PSelect value={assignedMemberId ?? ''} onChange={(e) => setAssignedMemberId(e.target.value || null)}>
            <option value="">Unassigned</option>
            {(team?.members ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </PSelect>
        </PField>
        <PField label="Status" style={{ flex: 1 }}>
          <PSelect value={status} onChange={(e) => setStatus(e.target.value as Status)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </PSelect>
        </PField>
      </div>
      {!r.connector && (
        <PField label="Type">
          <PSelect value={typeLabel} onChange={(e) => setTypeLabel(e.target.value)}>
            <option value="">None</option>
            {LOCAL_ITEM_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </PSelect>
        </PField>
      )}
      <PField label="Points" hint="approximate effort">
        <PointSeg value={points} onChange={setPoints} />
      </PField>
    </Modal>
  );
}

// ── Work Item detail / edit modal ───────────────────────────────────────
export function WorkItemDetailModal({ itemId, onClose }: { itemId: string; onClose: () => void }) {
  const it = useStore((s) => selItem(s, itemId));
  const r = useStore((s) => (it ? selRelease(s, it.releaseId) : undefined));
  const team = useStore((s) => (r ? selTeam(s, r.teamId) : undefined));
  const meta = useConnectorMeta(r?.connector?.type);

  const [subject, setSubject] = useState(it ? it.subject : '');
  const [desc, setDesc] = useState(it ? it.description : '');
  const [wsId, setWsId] = useState<string | null>(it ? it.workStreamId : null);
  const [sprintId, setSprintId] = useState<string | null>(it?.sprintId ?? null);
  const [status, setStatus] = useState<Status>(it ? it.status : 'Not Started');
  const [statusNativeId, setStatusNativeId] = useState<string>(it?.statusNative?.id ?? '');
  const [points, setPoints] = useState<number | null>(it ? it.points : null);
  const [assignedMemberId, setAssignedMemberId] = useState<string | null>(it?.assignedMemberId ?? null);
  const [typeLabel, setTypeLabel] = useState<string>(it?.itemType?.label ?? '');
  const [attrs, setAttrs] = useState<Record<string, AttrValue>>(it?.attributes ?? {});

  if (!it || !r) {
    return (
      <Modal title="Work item" icon={Icon.item} onClose={onClose} width={520}>
        <span style={{ color: 'var(--rt-t3)' }}>This item no longer exists.</span>
      </Modal>
    );
  }

  const synced = !!it.externalId;
  const connectorRelease = !!r.connector;
  // Lock state derives from the connector's itemTypes catalog: a synced field is
  // editable only where its type marks it writeable. Unknown/local items fall back —
  // local (never-synced) items are fully editable; unknown synced types allow
  // points + sprint (see conceptWriteable). One declared source, no hand-coded rules.
  // Live meta when the service is reachable; the release's sync-time catalog
  // snapshot otherwise, so synced items stay interpretable offline.
  const itype = itemTypeFor(it.itemType?.id, meta?.itemTypes ?? r.catalog?.itemTypes);
  // The connector's status vocabulary (native workflow states). Empty = the
  // backend uses the canonical five directly.
  const statusVocab = meta?.statuses?.length ? meta.statuses : (r.catalog?.statuses ?? []);
  const vocabStatus = synced && statusVocab.length > 0;
  const canWrite = (c: EditConcept) => !synced || conceptWriteable(itype, c);
  const isDirty = it.dirtyFields.length > 0;
  // Connector vocabulary (e.g. a Bug's severity): declared by the catalog, stored
  // in it.attributes. Writeable fields edit + push back; the rest render read-only.
  const attrFields = synced ? attributeFields(itype) : [];
  const writeableLocal = writeableLocalFields(itype);
  const editableAttrKeys = new Set(writeableAttributeFields(itype).map((f) => f.key));
  const attrEditable = (key: string) => editableAttrKeys.has(key);

  // Resolve the chosen status: in vocabulary mode the select carries a native id
  // whose category becomes the canonical status; otherwise the canonical select
  // value is used directly.
  const chosenDef = vocabStatus ? statusVocab.find((sd) => sd.id === statusNativeId) : undefined;
  const nextStatus: Status = chosenDef ? chosenDef.category : status;
  const nextStatusNative = chosenDef ? { id: chosenDef.id, label: chosenDef.label } : (it.statusNative ?? null);

  const save = () => {
    const nextDirty = [...it.dirtyFields];
    const nextAttrs = { ...it.attributes };
    if (synced) {
      // Accumulate dirty flags for any writeable canonical field whose value
      // changed — derived from the registry, so every connector-writeable field
      // (description, subject, assignee, … not just points/sprint/status) is
      // tracked and will be pushed.
      const nextView: CanonicalView = {
        points,
        sprintId,
        workStreamId: wsId,
        assignedMemberId,
        status: nextStatus,
        statusNative: nextStatusNative,
        subject: subject.trim() || it.subject,
        description: desc,
      };
      for (const c of CANONICAL_FIELDS) {
        if (!writeableLocal.has(c.field)) continue;
        if (c.read(nextView) !== c.read(it) && !nextDirty.includes(c.field)) nextDirty.push(c.field);
      }
      for (const f of attrFields) {
        if (!attrEditable(f.key)) continue;
        const v = attrs[f.key] ?? null;
        if (v === (it.attributes?.[f.key] ?? null)) continue;
        nextAttrs[f.key] = v;
        if (!nextDirty.includes(f.key)) nextDirty.push(f.key);
      }
    }
    getActions().updateItem(itemId, {
      subject: subject.trim() || it.subject,
      description: desc,
      workStreamId: wsId,
      sprintId,
      status: nextStatus,
      statusNative: nextStatusNative,
      points,
      assignedMemberId,
      attributes: nextAttrs,
      dirtyFields: nextDirty,
      ...(!connectorRelease && { itemType: typeLabel ? { id: null, label: typeLabel } : null }),
    });
    onClose();
  };

  // Connector context banner — rendered in the footer (left of the buttons) so it
  // doesn't eat vertical space the description can use.
  const bannerStyle = {
    display: 'flex', alignItems: 'center', gap: 6, marginRight: 'auto',
    padding: '5px 10px', fontSize: 'var(--rt-fs-xs)', color: 'var(--rt-t3)',
    background: 'var(--rt-fill)', border: '1.5px solid var(--rt-line)', borderRadius: 7,
    flex: '0 1 auto', minWidth: 0,
  } as const;
  // The writeable field names for the banner, derived from the catalog (legacy
  // fallback: points + sprint). Vocabulary keys show their catalog label.
  const writeableLabels = [...writeableLocal].map((key) =>
    key === 'points' ? 'Points' : key === 'sprint' ? 'Sprint' : key === 'status' ? 'Status' : (attrFields.find((f) => f.key === key)?.label ?? key),
  );
  const syncBanner = synced ? (
    <div style={bannerStyle}>
      {Icon.sync}
      <span>
        Synced — most fields refresh on sync. Writeable:{' '}
        <strong style={{ color: 'var(--rt-t2)', fontWeight: 'var(--rt-fw-semibold)' }}>{writeableLabels.join(', ')}</strong>.
      </span>
    </div>
  ) : connectorRelease ? (
    <div style={bannerStyle}>
      {Icon.sync}
      <span>Connector release — <strong style={{ color: 'var(--rt-t2)', fontWeight: 'var(--rt-fw-semibold)' }}>status</strong> editing is coming soon.</span>
    </div>
  ) : null;

  return (
    <Modal
      onClose={onClose}
      width="var(--rt-modal-w-work-item)"
      title={
        <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span className="mono" style={{ fontSize: 'var(--rt-fs-sm)', fontWeight: 'var(--rt-fw-semibold)', color: 'var(--rt-st-ac-text)', background: 'var(--rt-st-ac-soft)', padding: '3px 7px', borderRadius: 5 }}>
            {it.key}
          </span>
          {it.itemType && (
            <span
              title="Item type (connector-assigned, read-only)"
              style={{
                display: 'inline-flex', alignItems: 'center',
                fontSize: 'var(--rt-fs-xs)', fontWeight: 'var(--rt-fw-semibold)', color: 'var(--rt-t2)',
                background: 'var(--rt-fill)', border: `1.5px solid ${'var(--rt-line)'}`,
                borderRadius: 5, padding: '2px 8px',
              }}
            >
              {it.itemType.label}
            </span>
          )}
          {it.build && (
            <span
              title={`Build: ${it.build}`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                fontSize: 'var(--rt-fs-xs)', fontWeight: 'var(--rt-fw-semibold)', color: 'var(--rt-t3)',
                background: 'var(--rt-fill)', border: `1.5px solid ${'var(--rt-line)'}`,
                borderRadius: 5, padding: '2px 8px',
              }}
            >
              <span style={{ width: 5, height: 5, borderRadius: 1, background: 'var(--rt-t3)', flexShrink: 0 }} />
              {it.build}
            </span>
          )}
          {/* <span style={{ fontSize: 'var(--rt-fs-lg)', fontWeight: 'var(--rt-fw-heading)' }}>Work item</span> */}
          {isDirty && <DirtyDot size={7} />}
          {it.externalUrl && (
            <a
              href={it.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              title={`Open ${it.key} in ${meta?.label ?? 'the external system'} (new tab)`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                fontSize: 'var(--rt-fs-xs)', fontWeight: 'var(--rt-fw-semibold)', color: 'var(--rt-accent)',
                background: 'var(--rt-fill)', border: '1.5px solid var(--rt-line)',
                borderRadius: 5, padding: '2px 8px', textDecoration: 'none',
              }}
            >
              {Icon.external}
              Open in {meta?.label ?? 'external'}
            </a>
          )}
        </span>
      }
      footer={
        <>
          {syncBanner}
          <PButton variant="subtle" onClick={onClose}>
            Close
          </PButton>
          <PButton onClick={save}>Save changes</PButton>
        </>
      }
    >
      <PField label="Subject">
        <PInput value={subject} disabled={!canWrite('subject')} onChange={(e) => setSubject(e.target.value)} />
      </PField>
      <PField label="Description">
        {it.descriptionFormat === 'html' ? (
          <RichTextEditor value={desc} editable={canWrite('description')} onChange={setDesc} />
        ) : (
          <PTextarea
            value={desc}
            disabled={!canWrite('description')}
            placeholder="No description yet — add detail, acceptance criteria, links…"
            onChange={(e) => setDesc(e.target.value)}
            style={{ minHeight: 140 }}
          />
        )}
      </PField>
      <div style={{ display: 'flex', gap: 12 }}>
        <PField label="Work stream" style={{ flex: 1 }}>
          <PSelect value={wsId ?? ''} disabled={!canWrite('workStream')} onChange={(e) => setWsId(e.target.value || null)}>
            <option value="">None (unassigned)</option>
            {r.workStreams.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </PSelect>
        </PField>
        <PField label="Sprint" style={{ flex: 1 }}>
          <PSelect value={sprintId ?? ''} disabled={!canWrite('sprint')} onChange={(e) => setSprintId(e.target.value || null)}>
            <option value="">Backlog</option>
            {r.sprints.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </PSelect>
        </PField>
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        <PField label="Assignee" style={{ flex: 1 }}>
          <PSelect value={assignedMemberId ?? ''} disabled={!canWrite('assignee')} onChange={(e) => setAssignedMemberId(e.target.value || null)}>
            <option value="">Unassigned</option>
            {(team?.members ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </PSelect>
        </PField>
        <PField label="Status" style={{ flex: 1 }}>
          {vocabStatus ? (
            <PSelect value={statusNativeId} disabled={!canWrite('status')} onChange={(e) => setStatusNativeId(e.target.value)}>
              {/* Pre-vocabulary item: show its bare category until a native state is chosen. */}
              {!statusNativeId && <option value="">{it.status}</option>}
              {statusVocab.map((sd) => (
                <option key={sd.id} value={sd.id}>
                  {sd.label}
                </option>
              ))}
            </PSelect>
          ) : (
            <PSelect value={status} disabled={!canWrite('status')} onChange={(e) => setStatus(e.target.value as Status)}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </PSelect>
          )}
        </PField>
      </div>
      {!connectorRelease && (
        <PField label="Type">
          <PSelect value={typeLabel} onChange={(e) => setTypeLabel(e.target.value)}>
            <option value="">None</option>
            {LOCAL_ITEM_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </PSelect>
        </PField>
      )}
      <PField label="Points">
        <PointSeg value={points} onChange={setPoints} disabled={!canWrite('points')} />
      </PField>
      {attrFields.length > 0 && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {attrFields.map((f) =>
            attrEditable(f.key) ? (
              <PField key={f.key} label={f.label ?? f.key} style={{ flex: 1, minWidth: 140 }}>
                <FieldControl
                  field={f}
                  value={attrs[f.key] ?? null}
                  onChange={(v) => setAttrs((a) => ({ ...a, [f.key]: (v === '' ? null : v) as AttrValue }))}
                  ctx={{ workStreams: [], sprints: [], members: [] }}
                />
              </PField>
            ) : (
              <PField key={f.key} label={f.label ?? f.key} style={{ flex: 1, minWidth: 140 }}>
                <PInput value={displayValue(f, it.attributes?.[f.key])} disabled title="Connector field (read-only)" />
              </PField>
            ),
          )}
        </div>
      )}
    </Modal>
  );
}

// ── Push review / confirm modal ─────────────────────────────────────────
// Summarizes the pending push: per item, which writeable fields are changing
// (synced → local) before anything is sent. Writeability is derived per item from
// the connector's itemTypes catalog. Each row can be removed, which reverts that
// item's dirty fields back to its synced value.

export function PushReviewModal({
  releaseId,
  onConfirm,
  onClose,
}: {
  releaseId: string;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}) {
  const r = useStore((s) => selRelease(s, releaseId));
  const items = useStore((s) => selItemsFor(s, releaseId));
  const meta = useConnectorMeta(r?.connector?.type);
  const [busy, setBusy] = useState(false);

  if (!r) {
    return (
      <Modal title="Push changes" icon={Icon.sync} onClose={onClose} width={520}>
        <span style={{ color: 'var(--rt-t3)' }}>This release no longer exists.</span>
      </Modal>
    );
  }

  const sprintName = (id: string | null): string =>
    id == null ? 'Backlog' : (r.sprints.find((s) => s.id === id)?.name ?? 'Unknown sprint');
  const statusVocab = meta?.statuses?.length ? meta.statuses : (r.catalog?.statuses ?? []);
  const valueText = (d: PushItemPreview['diffs'][number], v: AttrValue): string => {
    if (d.field === 'sprint') return sprintName(v as string | null);
    if (d.field === 'status') return statusVocab.find((sd) => sd.id === v)?.label ?? (v == null ? '—' : String(v));
    if (d.spec) return displayValue(d.spec, v); // vocabulary: enum labels, Yes/No, em-dash
    return v == null ? '—' : String(v);
  };

  const previews = buildPushPreview(items, meta?.itemTypes);
  const total = previews.length;

  const doPush = async () => {
    if (busy || total === 0) return;
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const arrow = (
    <span style={{ color: 'var(--rt-t3)', fontWeight: 'var(--rt-fw-semibold)' }} aria-label="changes to">→</span>
  );

  return (
    <Modal
      title="Push changes"
      icon={Icon.sync}
      onClose={onClose}
      width={560}
      footer={
        <>
          <PButton variant="subtle" onClick={onClose}>
            Cancel
          </PButton>
          <PButton
            onClick={doPush}
            disabled={busy || total === 0}
            style={total > 0 ? { color: statusVars('In Progress').text } : undefined}
          >
            {busy ? 'Pushing…' : total > 0 ? `Push ${total} change${total !== 1 ? 's' : ''}` : 'Nothing to push'}
          </PButton>
        </>
      }
    >
      {total === 0 ? (
        <span style={{ color: 'var(--rt-t2)', fontSize: 'var(--rt-fs-md)', lineHeight: 'var(--rt-lh-normal)' }}>
          No pending changes to push — everything is in sync with the external system.
        </span>
      ) : (
        <>
          <div style={{ marginBottom: 12, fontSize: 'var(--rt-fs-sm)', color: 'var(--rt-t3)', lineHeight: 'var(--rt-lh-normal)' }}>
            {total} item{total !== 1 ? 's' : ''} will be written back to{' '}
            <strong style={{ color: 'var(--rt-t2)', fontWeight: 'var(--rt-fw-semibold)' }}>{r.name}</strong>. Review each change, or
            remove one to revert it to its synced value.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '52vh', overflowY: 'auto' }}>
            {previews.map((p) => (
              <div
                key={p.itemId}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                  padding: '10px 12px',
                  border: '1.5px solid var(--rt-line)', borderRadius: 9, background: 'var(--rt-paper)',
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span
                      className="mono"
                      style={{ fontSize: 'var(--rt-fs-xs)', color: 'var(--rt-t3)', background: 'var(--rt-fill)', padding: '2px 6px', borderRadius: 5, flexShrink: 0 }}
                    >
                      {p.key}
                    </span>
                    <span
                      title={p.subject}
                      style={{ fontSize: 'var(--rt-fs-sm)', color: 'var(--rt-t2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {p.subject}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {p.diffs.map((d) => (
                      <div key={d.field} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--rt-fs-sm)' }}>
                        <span style={{ color: 'var(--rt-t3)', minWidth: 52 }}>{d.label}</span>
                        <span style={{ color: 'var(--rt-t3)', textDecoration: 'line-through' }}>{valueText(d, d.from)}</span>
                        {arrow}
                        <span style={{ color: 'var(--rt-t1)', fontWeight: 'var(--rt-fw-semibold)' }}>{valueText(d, d.to)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <PButton
                  variant="subtle"
                  sm
                  onClick={() => getActions().revertItem(p.itemId)}
                  disabled={busy}
                  title="Revert this item to its synced value"
                  style={{ flexShrink: 0 }}
                >
                  Remove
                </PButton>
              </div>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}
