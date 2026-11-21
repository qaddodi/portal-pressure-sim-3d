// What a tap on a view pill, the A key, Fit and the zoom buttons do, apart from the screen. Views the scene cannot draw yet say so (a line), and the pill stays where it was.
import { UI } from '../strings.generated.ts';
import { useShell } from './store.ts';
import { useUi } from '../ui-store.ts';
import type { ViewId } from './views.ts';
import { toggleKey } from './views.ts';
import { notYet } from './words.ts';
import { freeRoom, viewRoom } from './room.ts';
import { cutRoom } from '../tests/room.ts';
import { sceneApi } from '../../scene/api.ts';
import { useCircuitTurn, screenPortrait } from '../../scene/circuit/pref.ts';
import { registerFeature } from './features.ts';
import { dropSelectionForView } from '../action/selection.ts';

const label = (v: ViewId) => UI.views.find((x) => x.id === v)!.label;

/** Put the figure's view on the scene and fly the camera to it (the Circuit: the body's vessels fly onto the map, the camera on the same clock). */
export function showView(v: ViewId): void {
  const { vp, device } = useUi.getState();
  const room = cutRoom(viewRoom(v, vp, device));
  sceneApi.showView(v === 'lobule' ? 'lobule' : v === 'sinusoid' ? 'sinusoid' : v === 'circuit' ? 'circuit' : 'body', room);
}

export function goToView(v: ViewId): boolean {
  const s = useShell.getState();
  if (!s.ready[v]) { s.say(notYet(`The ${label(v)} view`)); return false; }
  useShell.setState({ view: v });
  dropSelectionForView(v);
  showView(v);
  return true;
}
/** Turn upright (the zoom group's and the Layers sheet's button, the circuit only): stand the map up (flow bottom to top) or lay it wide again, the camera on the same 480 ms. */
export function turnCircuit(): void {
  if (useShell.getState().view !== 'circuit') return;
  const { vp, device } = useUi.getState();
  sceneApi.setCircuitUpright(!useCircuitTurn.getState().upright, freeRoom(vp, device));
}
registerFeature('rotate', turnCircuit);
/** The screen turned (portrait <-> landscape): the Circuit follows, eased on the turn's own clock; off the map the turn is just laid for the next entry. */
export function followScreen(w: number, h: number, prev: { w: number; h: number } | null): void {
  const on = screenPortrait(w, h);
  if (prev && screenPortrait(prev.w, prev.h) === on) return;
  if (useShell.getState().view !== 'circuit') { useCircuitTurn.getState().set(on); return; }
  const { vp, device } = useUi.getState();
  sceneApi.setCircuitUpright(on, freeRoom(vp, device));
}
let lastVp: { w: number; h: number } | null = null;
useUi.subscribe((s) => { const v = s.vp; if (!v || (lastVp && lastVp.w === v.w && lastVp.h === v.h)) return; followScreen(v.w, v.h, lastVp); lastVp = { w: v.w, h: v.h }; });
/** A second tap on the active view, Fit, and the 0 key: ask the camera to fit the figure into its room again. In the sinusoid, Fit and zoom out back out to the lobule (2D). */
export function refitFigure(): void {
  if (useShell.getState().view === 'sinusoid') { goToView('lobule'); return; }
  useShell.setState({ refit: useShell.getState().refit + 1 });
}
export const ZOOM_IN = 1.4;
export function zoomFigure(dir: 'in' | 'out'): void {
  if (dir === 'out' && useShell.getState().view === 'sinusoid') { goToView('lobule'); return; }
  sceneApi.zoomStep(dir === 'in' ? ZOOM_IN : 1 / ZOOM_IN);
}
/** The A key. */
export function flipView(): boolean { const to = toggleKey(useShell.getState().view); return to ? goToView(to) : false; }
