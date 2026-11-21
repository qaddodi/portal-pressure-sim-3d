// What the Tests card tells the page around it (2D main.js setPanelTab / dock.js layout and putWidth): `.app` wears `dock-open` while the card is up, `instrument-focus` while an instrument fills the screen,
// `tests-grad` while a pane that shows the HVPG and the PPG itself is open (the play bar then does not repeat the two: styles/app-11-deck-visuals.css), and `--side-ws-w`, the width of the card on the
// right, so a phone held sideways has its play bar end at the card (app-09-tests.css). The 2D stylesheet also asks `:has(#dock.side)` of .app; the card is not inside .app here, so .app wears
// `dock-side` for that (dock-side.generated.css, made from those rules by scripts/copy-b11-shell.mjs).
import { useTests } from '../store.ts';
import { useShell } from '../../shell/store.ts';
import { useTestsRoom } from '../room.ts';
import type { PaneId } from '../panes.ts';
import { useTalkOn } from '../../../state/deck.ts';

/** The Tests panes that show the HVPG and the PPG themselves (the Over time chart's readings, the HVPG procedure's, the Readouts tiles): 2D dock.js GRADIENT_PANES. */
export const GRADIENT_PANES: ReadonlySet<PaneId> = new Set<PaneId>(['scope', 'hvpg', 'readouts']);

/** The classes `.app` wears for the card, as one string with a leading space ('' when the card is down). */
export function appClasses(s: { open: boolean; pane: PaneId; second: PaneId | null; focus: boolean; side: boolean }): string {
  if (!s.open) return '';
  return ' dock-open' + (s.focus ? ' instrument-focus' : '') + ([s.pane, s.second].some((id) => id && GRADIENT_PANES.has(id)) ? ' tests-grad' : '') + (s.side ? ' dock-side' : '');
}

/** The Shell's hook: the string above for the card as it stands (re-renders only when the string changes). */
export function useTestsAppClasses(): string {
  const free = !useTalkOn();
  const open = useTests((s) => s.open && free), pane = useTests((s) => s.pane), second = useTests((s) => s.second), focus = useTests((s) => s.state === 'focus');
  const side = useTestsRoom((s) => s.place?.kind === 'side');
  return appClasses({ open, pane, second, focus, side });
}

/** Writes `--side-ws-w` on `.app` (the card's width when it is on the right; taken off otherwise). */
export function publishSideWidth(app: HTMLElement | null, w: number | null): void {
  if (!app) return;
  if (w == null) app.style.removeProperty('--side-ws-w'); else app.style.setProperty('--side-ws-w', `${Math.round(w)}px`);
}
