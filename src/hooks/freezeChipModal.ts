// Where an event chip's click lands. Shared by the release and sprint view models
// so the two screens can't drift: before this, only the release screen knew the
// code-freeze sentinel, and the sprint screen opened a blank event editor for it.

import type { ModalSpec } from '../app-context';
import { parseFreezeChipId } from '../lib/derive';

/** The modal an event chip opens: the release freeze editor, the work stream that
 *  owns the override, or the real ReleaseEvent behind an ordinary chip. */
export const freezeChipModal = (releaseId: string, eventId: string): ModalSpec => {
  const freeze = parseFreezeChipId(eventId);
  if (freeze?.kind === 'release') return { type: 'codeFreeze', releaseId };
  // The override is edited on the stream itself, so that's where the chip leads.
  if (freeze?.kind === 'stream') return { type: 'stream', releaseId, wsId: freeze.wsId };
  return { type: 'event', releaseId, eventId };
};
