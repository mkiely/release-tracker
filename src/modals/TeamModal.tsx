// Part of the app's modal set. Reads what it needs from the store and commits
// through getActions(), so callers supply only ids and an onClose.

import { useState } from 'react';
import { type Member } from '../types';
import { getActions, selTeam, useStore } from '../store/store';
import { Icon } from '../components/Icon';
import { IconButton, Modal, PButton, PField, PInput } from '../components/primitives';

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
