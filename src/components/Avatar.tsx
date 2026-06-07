import type { Member } from '../types';
import styles from './Avatar.module.css';

/** Soft status-token pairs cycled deterministically to tint member avatars. */
const AVATAR_PALETTES = [
  { bg: 'var(--rt-st-ac-soft)', color: 'var(--rt-st-ac-text)' },
  { bg: 'var(--rt-st-co-soft)', color: 'var(--rt-st-co-text)' },
  { bg: 'var(--rt-st-ur-soft)', color: 'var(--rt-st-ur-text)' },
  { bg: 'var(--rt-st-bl-soft)', color: 'var(--rt-st-bl-text)' },
  { bg: 'var(--rt-st-ns-soft)', color: 'var(--rt-st-ns-text)' },
];

/** Stable palette for a member id — same id always gets the same tint. */
export function avatarPalette(id: string): { bg: string; color: string } {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0;
  return AVATAR_PALETTES[Math.abs(h) % AVATAR_PALETTES.length];
}

/** First-letter initials from a name, up to two, uppercased. */
export function memberInitials(name: string): string {
  return name.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

/** Round, palette-tinted avatar showing a member's initials. */
export function Avatar({ member }: { member: Member }) {
  const pal = avatarPalette(member.id);
  return (
    <div className={styles.avatar} title={member.name} style={{ background: pal.bg, color: pal.color }}>
      {memberInitials(member.name)}
    </div>
  );
}
