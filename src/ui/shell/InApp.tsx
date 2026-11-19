// The 2D app's cards (the Tests dock, the Treat card, the action card) are children of `.app` there, and its stylesheets are written for that: 234 lifted rules start `.app.` or `#app.` and
// reach the card through it (`.app.dock-open .instrument-workspace { display: flex }` is the only rule that shows the dock). The 3D shell keeps `.app` for the top bar and the figure and puts
// its other pieces beside it in `.sh-root`, so a card made there would sit outside every one of those rules (computed display: none, a blank card). A card that wears the 2D sheets is mounted
// through this, inside `#app`, where those rules reach it.
import { useLayoutEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function InApp({ children }: { children: ReactNode }) {
  const [app, setApp] = useState<HTMLElement | null>(() => (typeof document === 'undefined' ? null : document.getElementById('app')));
  useLayoutEffect(() => { setApp((o) => document.getElementById('app') ?? o); }, []);
  return app ? createPortal(children, app) : null;
}
