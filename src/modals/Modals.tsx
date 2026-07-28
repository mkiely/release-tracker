// The app's modals. Each reads what it needs from the store and commits through
// getActions(), so callers only supply ids and an onClose.

import { useState, type ReactNode } from 'react';
import { LOCAL_ITEM_TYPES, STATUSES, type AttrValue, type Member, type PlanningState, type Status } from '../types';
import { between, fmtShort, todayISO, workdaysInRange } from '../lib/dates';
import { capPct, effectiveCodeFreeze, effectiveStreamCodeFreeze, freezeOverrides, freezeSprintX, fullCap, sprintVel, sumPoints } from '../lib/derive';
import { getActions, selItem, selItemsFor, selRelease, selTeam, useStore } from '../store/store';
import { buildPushPreview, type PushItemPreview } from '../sync/push';
import { attributeFields, CANONICAL_FIELDS, canonicalChanged, conceptWriteable, itemTypeFor, writeableAttributeFields, writeableLocalFields, type CanonicalView, type EditConcept } from '../lib/connectorFields';
import { htmlToText } from '../lib/htmlNormalize';
import { displayValue, FieldControl } from '../components/fields/registry';
import { useConnectorMeta } from '../hooks/useConnectorMeta';
import type { SharePayload } from '../lib/shareRelease';
import { DirtyDot } from '../components/DirtyDot';
import { RichTextEditor } from '../components/RichTextEditor';
import { copyRich, linkClipboard } from '../lib/copyLink';
import { useApp } from '../app-context';
import { Icon } from '../components/Icon';
import { IconButton, Modal, PButton, PField, PInput, PointSeg, PSelect, PTextarea } from '../components/primitives';
import { CalcCard, Callout, MetaChip } from '../components/ui/Callout';
import { FreezeOverrideList } from '../components/ui/FreezeOverrideList';
import { assessStreams } from '../lib/streamAssessment';
import { SegBar } from '../components/Badges';
import { SegmentedToggle } from '../components/SegmentedToggle';
import { StreamBurnChart } from '../components/Trend';
import { RunwayBadge, VerdictBadge } from '../components/VerdictLine';
import { statusVars, verdictVars, warningVars } from '../components/statusVars';

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
  const [planning, setPlanning] = useState<PlanningState>(existing ? existing.planningState : 'open');
  const [codeFreeze, setCodeFreeze] = useState(existing?.codeFreezeISO ?? '');
  const parseEngineers = (): number | null => {
    const n = Number(engineers);
    return engineers.trim() && Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
  };
  const save = () => {
    if (!name.trim()) return;
    const codeFreezeISO = codeFreeze || null;
    if (editing && wsId) {
      getActions().updateWorkStream(releaseId, wsId, { name: name.trim(), engineersRequired: parseEngineers(), planningState: planning, codeFreezeISO });
    } else {
      const ws = getActions().createWorkStream(releaseId, name.trim());
      const er = parseEngineers();
      if (ws && (er != null || planning !== 'open' || codeFreezeISO)) {
        getActions().updateWorkStream(releaseId, ws.id, { engineersRequired: er, planningState: planning, codeFreezeISO });
      }
    }
    onClose();
  };
  return (
    <Modal
      title={editing ? 'Edit work stream' : 'New work stream'}
      icon={Icon.stream}
      onClose={onClose}
      width={520}
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
      <PField label="Planning status">
        <SegmentedToggle
          value={planning}
          onChange={setPlanning}
          ariaLabel="Planning status"
          options={[
            { value: 'open', label: 'Open', title: 'Planning in progress — under-planned capacity is flagged and can raise the alarm' },
            { value: 'deferred', label: 'Deferred', title: 'Tickets intentionally not written yet (e.g. research pending) — mutes the alarm only' },
            { value: 'complete', label: 'Scope complete', title: 'All work is defined — reserved capacity beyond the scope reads as over-reservation' },
          ]}
        />
        <span style={{ display: 'block', marginTop: 6, fontSize: 'var(--rt-fs-sm)', color: 'var(--rt-t3)', lineHeight: 1.45 }}>
          {planning === 'open'
            ? 'Planning in progress. Reserved capacity with little created work flags as under-planned.'
            : planning === 'deferred'
              ? 'Alarm muted (tickets deferred, e.g. research pending). Still reads un-judgeable, never on-track.'
              : 'Scope is fully defined — the created work is the whole scope. Reserved engineers beyond it read as over-reserved and feed the rebalancing suggestion.'}
        </span>
      </PField>
      <PField
        label="Code freeze override"
        hint={r ? `leave blank to inherit ${fmtShort(effectiveCodeFreeze(r))} from the release` : 'leave blank to inherit the release date'}
      >
        <PInput
          type="date"
          value={codeFreeze}
          min={r?.sprints.length ? r.sprints[0].startISO : undefined}
          onChange={(e) => setCodeFreeze(e.target.value)}
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
      <Callout tone={sp ? 'active' : 'neutral'}>
        <>
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
        </>
      </Callout>
    </Modal>
  );
}

// ── Code freeze modal (release-level code check-in deadline) ───────────
export function CodeFreezeModal({ releaseId, onClose }: { releaseId: string; onClose: () => void }) {
  const r = useStore((s) => selRelease(s, releaseId))!;
  const { openModal } = useApp();
  const isOverride = r.codeFreezeISO != null;
  const [date, setDate] = useState(effectiveCodeFreeze(r));
  const sp = date ? r.sprints.find((s) => between(date, s.startISO, s.endISO)) : null;
  const overrides = freezeOverrides(r);

  const save = () => {
    if (!date) return;
    getActions().setCodeFreeze(releaseId, date);
    onClose();
  };
  const useDefault = () => {
    getActions().setCodeFreeze(releaseId, null);
    onClose();
  };

  const minDate = r.sprints.length ? r.sprints[0].startISO : undefined;

  return (
    <Modal
      title="Code freeze"
      icon={Icon.snowflake}
      onClose={onClose}
      width={560}
      footer={
        <>
          {isOverride && (
            <PButton variant="subtle" onClick={useDefault} style={{ marginRight: 'auto' }}>
              Use default (last sprint end)
            </PButton>
          )}
          <PButton variant="subtle" onClick={onClose}>
            Cancel
          </PButton>
          <PButton onClick={save} disabled={!date}>
            Save
          </PButton>
        </>
      }
    >
      <PField label="Code check-in deadline" hint="defaults to the release's last sprint end when not set explicitly">
        <PInput autoFocus type="date" value={date} min={minDate} onChange={(e) => setDate(e.target.value)} />
      </PField>
      <Callout tone={sp ? 'warning' : 'neutral'}>
        <>
          {!date ? (
            'Pick the date code must be checked in for this release.'
          ) : sp ? (
            <>
              Falls inside <strong style={{ color: 'var(--rt-ink)' }}>{sp.name}</strong> ({fmtShort(sp.startISO)} – {fmtShort(sp.endISO)}) — it'll
              show as a critical chip on that sprint and cap forward capacity for streams still working past it. Individual
              work streams can override this in their own settings.
            </>
          ) : (
            "That date falls outside the release's current sprints."
          )}
        </>
      </Callout>
      {/* The overriding streams are the first thing you need when editing this date:
          moving the release freeze doesn't move theirs. */}
      <FreezeOverrideList
        overrides={overrides}
        codeFreezeISO={effectiveCodeFreeze(r)}
        onOpenStream={(wsId) => openModal({ type: 'stream', releaseId, wsId })}
      />
    </Modal>
  );
}

// ── Sprint edit modal (name + days off → capacity) ─────────────────────
export function Row({ k, v, big }: { k: ReactNode; v: ReactNode; big?: boolean }) {
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
      <CalcCard label="Expected velocity">
        <Row k="Team velocity" v={`${team ? team.velocity : 0} pts`} />
        <Row k="Full capacity" v={`${memberCount} × ${workdays} = ${full} person-days`} />
        <Row k="Days off" v={`− ${off}`} />
        <Row k="% of capacity" v={`${full - off} / ${full} = ${pct}%`} />
        <hr className="divider" style={{ margin: '3px 0' }} />
        <Row k="Sprint velocity" v={`${team ? team.velocity : 0} × ${pct}% = ${vel} pts`} big />
      </CalcCard>
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
            <option value="">No sprint</option>
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
  const { notify } = useApp();

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
        if (canonicalChanged(c, c.read(nextView), c.read(it)) && !nextDirty.includes(c.field)) nextDirty.push(c.field);
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

  // Copy a clickable link to the item's backend record, so a paste lands as a
  // live link in docs/chat and as readable text everywhere else.
  const copyLink = async () => {
    if (!it.externalUrl) return;
    const ok = await copyRich(linkClipboard(it.key, it.subject, it.externalUrl));
    notify(ok ? 'Link copied' : 'Copy failed');
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
            <MetaChip title="Item type (connector-assigned, read-only)">{it.itemType.label}</MetaChip>
          )}
          {it.build && (
            <MetaChip title={`Build: ${it.build}`}>
              <span className="dot" style={{ width: 5, height: 5, borderRadius: 1, background: 'var(--rt-t3)' }} />
              {it.build}
            </MetaChip>
          )}
          {/* <span style={{ fontSize: 'var(--rt-fs-lg)', fontWeight: 'var(--rt-fw-heading)' }}>Work item</span> */}
          {isDirty && <DirtyDot size={7} />}
          {it.externalUrl && (
            <MetaChip
              accent
              href={it.externalUrl}
              title={`Open ${it.key} in ${meta?.label ?? 'the external system'} (new tab)`}
            >
              {Icon.external}
              Open in {meta?.label ?? 'external'}
            </MetaChip>
          )}
          {it.externalUrl && (
            <MetaChip
              accent
              onClick={copyLink}
              title={`Copy a link to ${it.key} (${it.key} ${it.subject})`}
              ariaLabel={`Copy a link to ${it.key}`}
            >
              {Icon.link}
              Copy link
            </MetaChip>
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
            <option value="">No sprint</option>
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
    id == null ? 'No sprint' : (r.sprints.find((s) => s.id === id)?.name ?? 'Unknown sprint');
  const streamName = (id: string | null): string =>
    id == null ? 'No stream' : (r.workStreams.find((w) => w.id === id)?.name ?? 'Unknown stream');
  const statusVocab = meta?.statuses?.length ? meta.statuses : (r.catalog?.statuses ?? []);
  const valueText = (d: PushItemPreview['diffs'][number], v: AttrValue): string => {
    if (d.field === 'sprint') return sprintName(v as string | null);
    if (d.field === 'status') return statusVocab.find((sd) => sd.id === v)?.label ?? (v == null ? '—' : String(v));
    // Descriptions are long rich-text HTML; show a plain-text projection (clipped
    // at render). The point of the row is to flag that description is included,
    // not to render the whole document.
    if (d.field === 'description') return htmlToText(v == null ? '' : String(v)) || '—';
    if (d.spec) return displayValue(d.spec, v); // vocabulary: enum labels, Yes/No, em-dash
    return v == null ? '—' : String(v);
  };

  const previews = buildPushPreview(items, meta?.itemTypes);
  // Queued creates (pendingCreate) ride the same push. They have no old→new diff — the
  // whole item is new — so they render as their own row kind above the edits.
  const creates = items.filter((i) => i.pendingCreate);
  const total = previews.length + creates.length;

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
            <strong style={{ color: 'var(--rt-t2)', fontWeight: 'var(--rt-fw-semibold)' }}>{r.name}</strong>
            {creates.length > 0 && (
              <> — including <strong style={{ color: 'var(--rt-t2)', fontWeight: 'var(--rt-fw-semibold)' }}>{creates.length} new item{creates.length !== 1 ? 's' : ''}</strong> to create</>
            )}
            . Review each change, or remove one to drop it from the push.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '52vh', overflowY: 'auto' }}>
            {creates.map((c) => (
              <div
                key={c.id}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                  padding: '10px 12px',
                  border: '1.5px solid var(--rt-line)', borderRadius: 9, background: 'var(--rt-paper)',
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span
                      style={{
                        fontSize: 'var(--rt-fs-xs)', fontWeight: 'var(--rt-fw-semibold)',
                        color: statusVars('In Progress').text, background: statusVars('In Progress').soft,
                        padding: '2px 6px', borderRadius: 5, flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.04em',
                      }}
                    >
                      New
                    </span>
                    {c.itemType && (
                      <span style={{ fontSize: 'var(--rt-fs-xs)', color: 'var(--rt-t3)', flexShrink: 0 }}>{c.itemType.label}</span>
                    )}
                    <span
                      title={c.subject}
                      style={{ fontSize: 'var(--rt-fs-sm)', color: 'var(--rt-t1)', fontWeight: 'var(--rt-fw-semibold)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {c.subject}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 14px', fontSize: 'var(--rt-fs-sm)', color: 'var(--rt-t2)' }}>
                    <span><span style={{ color: 'var(--rt-t3)' }}>Stream</span> {streamName(c.workStreamId)}</span>
                    <span><span style={{ color: 'var(--rt-t3)' }}>Sprint</span> {sprintName(c.sprintId)}</span>
                    {c.points != null && <span><span style={{ color: 'var(--rt-t3)' }}>Points</span> {c.points}</span>}
                  </div>
                </div>
                <PButton
                  variant="subtle"
                  sm
                  onClick={() => getActions().discardPendingCreate(c.id)}
                  disabled={busy}
                  title="Remove this queued item from the push"
                  style={{ flexShrink: 0 }}
                >
                  Remove
                </PButton>
              </div>
            ))}
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
                    {p.diffs.map((d) => {
                      // Long free-text values (description) clip to one ellipsized
                      // line so a row stays a single line; the full text is on the
                      // title tooltip.
                      const clip = d.field === 'description';
                      const clipStyle = clip
                        ? { maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block', verticalAlign: 'middle' as const }
                        : undefined;
                      const fromText = valueText(d, d.from);
                      const toText = valueText(d, d.to);
                      return (
                        <div key={d.field} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--rt-fs-sm)' }}>
                          <span style={{ color: 'var(--rt-t3)', minWidth: 52, flexShrink: 0 }}>{d.label}</span>
                          <span title={clip ? fromText : undefined} style={{ color: 'var(--rt-t3)', textDecoration: 'line-through', ...clipStyle }}>{fromText}</span>
                          {arrow}
                          <span title={clip ? toText : undefined} style={{ color: 'var(--rt-t1)', fontWeight: 'var(--rt-fw-semibold)', ...clipStyle }}>{toText}</span>
                        </div>
                      );
                    })}
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
