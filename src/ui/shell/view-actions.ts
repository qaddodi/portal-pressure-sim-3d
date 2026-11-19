// What a tap on a view pill, the A key and Fit do, apart from the screen. Views the scene cannot draw yet say so (a line), and the pill stays where it was.
import { UI } from '../strings.generated.ts';
import { useShell } from './store.ts';
import type { ViewId } from './views.ts';
import { toggleKey } from './views.ts';
import { notYet } from './words.ts';

const label = (v: ViewId) => UI.views.find((x) => x.id === v)!.label;

export function goToView(v: ViewId): boolean {
  const s = useShell.getState();
  if (!s.ready[v]) { s.say(notYet(`The ${label(v)} view`)); return false; }
  useShell.setState({ view: v });
  return true;
}
/** A second tap on the active view, Fit, and the 0 key: ask the camera to fit the figure into its room again. */
export const refitFigure = () => useShell.setState({ refit: useShell.getState().refit + 1 });
/** The A key. */
export function flipView(): boolean { const to = toggleKey(useShell.getState().view); return to ? goToView(to) : false; }
