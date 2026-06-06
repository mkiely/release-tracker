import type { ReactNode } from 'react';
import { TopBar } from './chrome';

/**
 * Generic screen shell: the `wf screen` frame + the shared TopBar, an optional
 * toolbar strip beneath it, and the screen body. Per-screen chrome wrappers
 * (ReleaseChrome, etc.) fill the TopBar slots and toolbar; presenters supply
 * only the body via `children`. This is the seam that lets card/table — and the
 * sprint/stream axis — share one chrome instead of duplicating it per presenter.
 */
export function ScreenScaffold({
  left,
  title,
  sub,
  right,
  toolbar,
  children,
}: {
  left?: ReactNode;
  title: ReactNode | null;
  sub?: ReactNode;
  right?: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="wf screen">
      <TopBar left={left} title={title} sub={sub} right={right} />
      {toolbar}
      {children}
    </div>
  );
}
