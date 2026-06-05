import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { todayISO } from '../lib/dates';
import { DEFAULT_SPRINT_COUNT } from '../types';
import { selItemsFor, selTeam, useStore, getActions } from '../store/store';
import { connectorLabel, syncClient, type ConnectorMeta } from '../sync/client';
import { useApp } from '../app-context';
import type { Release, Team } from '../types';
import type React from 'react';

export interface ReleaseCardData {
  release: Release;
  team: Team | undefined;
  itemCount: number;
  doneRatio: number;
  connLabel: string | null;
}

export interface HomeViewProps {
  releases: ReleaseCardData[];
  teams: Team[];
  name: string;
  start: string;
  teamId: string;
  connectors: ConnectorMeta[];
  connType: string;
  meta: ConnectorMeta | undefined;
  config: Record<string, string>;
  sprintCount: number;
  canCreate: boolean;
  isDev: boolean;
  onSetName: (v: string) => void;
  onSetStart: (v: string) => void;
  onSetTeamId: (v: string) => void;
  onSetConnType: (v: string) => void;
  onSetConfig: (key: string, value: string) => void;
  onSetSprintCount: (v: number) => void;
  onCreate: () => void;
  onLoadDemo: () => void;
  onDeleteRelease: (e: React.MouseEvent, release: Release) => void;
  onNavigateToRelease: (id: string) => void;
  onNavigateToTeams: () => void;
  onNewTeam: () => void;
}

export function useHomeView(): HomeViewProps {
  const st = useStore();
  const navigate = useNavigate();
  const { openModal } = useApp();

  const [name, setName] = useState('');
  const [start, setStart] = useState(todayISO());
  const [teamId, setTeamId] = useState(st.teams[0] ? st.teams[0].id : '');
  const [connectors, setConnectors] = useState<ConnectorMeta[]>([]);
  const [connType, setConnType] = useState('');
  const [config, setConfig] = useState<Record<string, string>>({});
  const [sprintCount, setSprintCount] = useState(DEFAULT_SPRINT_COUNT);

  useEffect(() => {
    let alive = true;
    syncClient
      .listConnectors()
      .then((cs) => alive && setConnectors(cs))
      .catch(() => alive && setConnectors([]));
    return () => {
      alive = false;
    };
  }, []);

  const meta = connectors.find((c) => c.type === connType);
  const configComplete = !meta || meta.configFields.every((f) => !f.required || config[f.key]?.trim());
  const canCreate = !!name.trim() && !!start && (!!teamId || !!meta) && configComplete;

  const releases: ReleaseCardData[] = st.releases.map((r) => {
    const team = selTeam(st, r.teamId);
    const items = selItemsFor(st, r.id);
    const done = items.length ? items.filter((i) => i.status === 'Complete').length / items.length : 0;
    return {
      release: r,
      team,
      itemCount: items.length,
      doneRatio: done,
      connLabel: r.connector ? connectorLabel(r.connector.type) : null,
    };
  });

  const onCreate = () => {
    const connector = meta ? { type: connType, config } : null;
    const effectiveTeamId = teamId || '';
    const r = getActions().createRelease({
      name: name.trim(),
      startISO: start,
      teamId: effectiveTeamId,
      connector,
      sprintCount: connector ? undefined : sprintCount,
    });
    navigate(`/releases/${r.id}`);
  };

  return {
    releases,
    teams: st.teams,
    name,
    start,
    teamId,
    connectors,
    connType,
    meta,
    config,
    sprintCount,
    canCreate,
    isDev: import.meta.env.DEV,
    onSetName: setName,
    onSetStart: setStart,
    onSetTeamId: setTeamId,
    onSetConnType: setConnType,
    onSetConfig: (key, value) => setConfig((c) => ({ ...c, [key]: value })),
    onSetSprintCount: setSprintCount,
    onCreate,
    onLoadDemo: () => getActions().reset(),
    onDeleteRelease: (e, r) => {
      e.stopPropagation();
      openModal({
        type: 'confirm',
        title: 'Delete release',
        body: `Delete "${r.name}"? All work items will be removed. This cannot be undone.`,
        confirmLabel: 'Delete release',
        onConfirm: () => getActions().deleteRelease(r.id),
      });
    },
    onNavigateToRelease: (id) => navigate(`/releases/${id}`),
    onNavigateToTeams: () => navigate('/teams'),
    onNewTeam: () => openModal({ type: 'team' }),
  };
}
