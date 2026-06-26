import type { HomeViewProps, ReleaseCardData } from '../hooks/useHomeView';
import { Brand, TopBar } from '../components/chrome';
import { Icon } from '../components/Icon';
import { Meter } from '../components/badges';
import { EmptyState } from '../components/EmptyState';
import { IconButton, PButton, PField, PInput, PSelect } from '../components/primitives';
import { capabilitySummary, missingCapabilities } from '../lib/connectorFields';
import { fmtShort } from '../lib/dates';
import styles from '../routes/Home.module.css';

function ReleaseCard({
  data,
  onNavigate,
  onDelete,
}: {
  data: ReleaseCardData;
  onNavigate: () => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  const { release: r, team, itemCount, doneRatio, connLabel } = data;
  return (
    <div
      className={`card ${styles.releaseCard}`}
      onClick={onNavigate}
      style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div
          style={{
            fontWeight: 'var(--rt-fw-bold)',
            fontSize: 'var(--rt-fs-lg)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            flex: '1 1 auto',
            minWidth: 0,
          }}
        >
          {r.name}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '0 0 auto' }}>
          <span style={{ fontSize: 'var(--rt-fs-sm)', fontWeight: 'var(--rt-fw-bold)', color: 'var(--rt-t2)' }}>{Math.round(doneRatio * 100)}%</span>
          <IconButton icon={Icon.trash} title="Delete release" onClick={onDelete} style={{ color: 'var(--rt-t3)' }} />
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--rt-t3)', fontSize: 'var(--rt-fs-base)', whiteSpace: 'nowrap' }}>
        {Icon.team}
        <span>{team ? team.name : '—'}</span>
        {connLabel && (
          <span className="tag" style={{ marginLeft: 'auto', flex: '0 0 auto' }}>
            {connLabel}
          </span>
        )}
      </div>
      <Meter v={doneRatio} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--rt-fs-sm)', color: 'var(--rt-t3)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {Icon.stream}
          {r.workStreams.length}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {Icon.item}
          {itemCount}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {Icon.cal}
          {fmtShort(r.startISO)}
        </span>
      </div>
    </div>
  );
}

export function HomeView({
  releases,
  teams,
  name,
  start,
  teamId,
  connectors,
  connType,
  meta,
  config,
  sprintCount,
  sprintWeeks,
  canCreate,
  isDev,
  onSetName,
  onSetStart,
  onSetTeamId,
  onSetConnType,
  onSetConfig,
  onSetSprintCount,
  onSetSprintWeeks,
  onCreate,
  onLoadDemo,
  onDeleteRelease,
  onNavigateToRelease,
  onNavigateToTeams,
  onNewTeam,
}: HomeViewProps) {
  return (
    <div className="wf screen">
      <TopBar
        left={<Brand />}
        title={null}
        right={
          <div style={{ display: 'flex', gap: 8 }}>
            {isDev && (
              <PButton variant="subtle" sm onClick={onLoadDemo}>
                Load demo data
              </PButton>
            )}
            <PButton variant="subtle" sm icon={Icon.team} onClick={onNavigateToTeams}>
              Teams
            </PButton>
          </div>
        }
      />
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '40px 28px',
          gap: 40,
        }}
      >
        <div style={{ width: 440, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 'var(--rt-fs-display)', fontWeight: 'var(--rt-fw-heading)', letterSpacing: '-0.02em' }}>New release</div>
            <div style={{ fontSize: 'var(--rt-fs-md)', color: 'var(--rt-t3)', marginTop: 5 }}>Start tracking a release cycle.</div>
          </div>
          <div className="card" style={{ width: '100%', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <PField label="Release name">
              <PInput
                value={name}
                placeholder="e.g. Orion 2.0"
                onChange={(e) => onSetName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && canCreate) onCreate();
                }}
              />
            </PField>
            <PField label="Start date">
              <PInput type="date" value={start} onChange={(e) => onSetStart(e.target.value)} />
            </PField>
            {!meta && (
              <div style={{ display: 'flex', gap: 12 }}>
                <PField label="Number of sprints" hint="default is 8" style={{ flex: 1 }}>
                  <PInput
                    type="number"
                    value={sprintCount}
                    min={1}
                    max={26}
                    step={1}
                    onChange={(e) =>
                      onSetSprintCount(Math.max(1, Math.min(26, parseInt(e.target.value, 10) || sprintCount)))
                    }
                  />
                </PField>
                <PField label="Sprint length" style={{ flex: 1 }}>
                  <PSelect value={sprintWeeks} onChange={(e) => onSetSprintWeeks(parseInt(e.target.value, 10))}>
                    <option value={1}>1 week</option>
                    <option value={2}>2 weeks</option>
                    <option value={3}>3 weeks</option>
                    <option value={4}>4 weeks</option>
                  </PSelect>
                </PField>
              </div>
            )}
            <PField label="Team" hint={meta ? 'optional — team arrives from connector on first sync' : undefined}>
              <div style={{ display: 'flex', gap: 9 }}>
                <PSelect value={teamId} onChange={(e) => onSetTeamId(e.target.value)} style={{ flex: 1 }}>
                  {!meta && teams.length === 0 && <option value="">No teams yet</option>}
                  {meta && <option value="">From connector</option>}
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </PSelect>
                <IconButton icon={Icon.plus} title="New team" onClick={onNewTeam} style={{ minHeight: 46, width: 46 }} />
              </div>
            </PField>
            {connectors.length > 0 && (
              <PField label="Connector" hint="pull work from an external system">
                <PSelect value={connType} onChange={(e) => onSetConnType(e.target.value)}>
                  <option value="">Local (no sync)</option>
                  {connectors.map((c) => (
                    <option key={c.type} value={c.type}>
                      {c.label}
                    </option>
                  ))}
                </PSelect>
              </PField>
            )}
            {meta && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 14,
                  padding: '14px 14px 2px',
                  borderLeft: '2px solid var(--rt-line)',
                  marginLeft: 2,
                }}
              >
                {/* Bind-time capability handshake: what this connector supports,
                    and which app features will degrade if its catalog misses a
                    semantic concept. */}
                {(capabilitySummary(meta) || missingCapabilities(meta.itemTypes).length > 0) && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 'var(--rt-fs-xs)', lineHeight: 'var(--rt-lh-normal)' }}>
                    {capabilitySummary(meta) && <span style={{ color: 'var(--rt-t3)' }}>{capabilitySummary(meta)}</span>}
                    {missingCapabilities(meta.itemTypes).map((m) => (
                      <span key={m.concept} style={{ color: 'var(--rt-st-bl-text)' }}>
                        {m.impact}
                      </span>
                    ))}
                  </div>
                )}
                {meta.configFields.map((f) => (
                  <PField key={f.key} label={f.label} hint={f.required ? undefined : 'optional'}>
                    <PInput
                      type={f.type ?? 'text'}
                      value={config[f.key] ?? ''}
                      placeholder={f.hint}
                      onChange={(e) => onSetConfig(f.key, e.target.value)}
                    />
                  </PField>
                ))}
              </div>
            )}
            <PButton onClick={onCreate} disabled={!canCreate} style={{ justifyContent: 'center', marginTop: 4 }}>
              Create release
            </PButton>
          </div>
        </div>
        <div style={{ width: '100%', maxWidth: 920 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <span className="tag">Your releases · {releases.length}</span>
          </div>
          {releases.length === 0 ? (
            <EmptyState style={{ padding: 30 }}>No releases yet — create one above.</EmptyState>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              {releases.map((d) => (
                <ReleaseCard
                  key={d.release.id}
                  data={d}
                  onNavigate={() => onNavigateToRelease(d.release.id)}
                  onDelete={(e) => onDeleteRelease(e, d.release)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
