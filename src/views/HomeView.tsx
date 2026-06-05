import type { HomeViewProps, ReleaseCardData } from '../hooks/useHomeView';
import { Brand, TopBar } from '../components/chrome';
import { Icon } from '../components/Icon';
import { Meter } from '../components/badges';
import { IconButton, PButton, PField, PInput, PSelect } from '../components/primitives';
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
            fontWeight: 700,
            fontSize: 16,
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
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--rt-t2)' }}>{Math.round(doneRatio * 100)}%</span>
          <IconButton icon={Icon.trash} title="Delete release" onClick={onDelete} style={{ color: 'var(--rt-t3)' }} />
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--rt-t3)', fontSize: 13, whiteSpace: 'nowrap' }}>
        {Icon.team}
        <span>{team ? team.name : '—'}</span>
        {connLabel && (
          <span className="tag" style={{ marginLeft: 'auto', flex: '0 0 auto' }}>
            {connLabel}
          </span>
        )}
      </div>
      <Meter v={doneRatio} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--rt-t3)' }}>
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
  canCreate,
  isDev,
  onSetName,
  onSetStart,
  onSetTeamId,
  onSetConnType,
  onSetConfig,
  onSetSprintCount,
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
            <div style={{ fontSize: 26, fontWeight: 750, letterSpacing: '-0.02em' }}>New release</div>
            <div style={{ fontSize: 14.5, color: 'var(--rt-t3)', marginTop: 5 }}>Start tracking a release cycle.</div>
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
              <PField label="Number of sprints" hint="2-week sprints; default is 8">
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
            <div className="card dash" style={{ padding: 30, textAlign: 'center', color: 'var(--rt-t3)', fontSize: 14 }}>
              No releases yet — create one above.
            </div>
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
