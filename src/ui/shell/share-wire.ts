// The share link on the real app: what it reads (the stores, the scene's camera) and what a link acts on (share.ts holds the rules, as the 2D share-flow.js does).
import { useShell } from './store.ts';
import { useUi } from '../ui-store.ts';
import { talkOn, talkId } from '../../state/deck.ts';
import { useEngine } from '../../engine/index.ts';
import { UI } from '../strings.generated.ts';
import { cel, sceneApi } from '../../scene/api.ts';
import { currentParams, updateParams } from '../action/params.ts';
import { selectStructure, useSelection } from '../action/selection.ts';
import { loadPatient } from '../patients/index.ts';
import { goToView } from './view-actions.ts';
import { hasShare, loadShared, readShare, shareUrl, SHARE_WORDS, type ShareDeps, type ShareNow, type FigureExtras } from './share.ts';
import type { Cam } from '../debug/packet/state.ts';
import { applyExtras } from '../debug/packet/apply.ts';
import { useLens } from '../../scene/lenses/store.ts';
import { DEFAULT_LENS } from '../../scene/lenses/model.ts';

import { clock } from '../../clock/frame.ts';
/** What the figure wears beyond its view (N4): the lens when it is not the default, the label level and the figure's switches. */
function figureNow(): FigureExtras {
  const f = useShell.getState().figure as unknown as Record<string, unknown>, lens = useLens.getState().lens;
  const flags: Record<string, boolean> = {};
  for (const k of ['chevrons', 'keyChevrons', 'chips', 'collaterals', 'labels', 'zones', 'lymph', 'bile']) if (typeof f[k] === 'boolean') flags[k] = f[k] as boolean;
  return { ...(lens !== DEFAULT_LENS ? { lens } : {}), ...(typeof f.labelLevel === 'string' ? { labels: f.labelLevel } : {}), figure: flags };
}
/** The scenario on the screen now. The camera rides only when the hand has moved it (a view frames itself). */
export function shareNow(): ShareNow {
  const sh = useShell.getState(), hand = cel.rig.handView, orbit = Math.round(((cel.rig.orbitAngle * 180) / Math.PI) * 10) / 10;
  const moved = orbit !== 0 || hand.k !== 1 || hand.x !== 0 || hand.y !== 0;
  const deckId = talkOn() ? talkId() : null;
  return {
    preset: useEngine.getState().presetId ?? sh.patientId, params: currentParams(), view: sh.view, sel: useSelection.getState().sel,
    cam: moved ? { orbit, k: hand.k, x: hand.x, y: hand.y } : null,
    deck: deckId ? { id: deckId, slide: useUi.getState().pos.stop + 1 } : null,
    fig: figureNow(),
  };
}
/** The address that reopens what is on the screen (2D share(): the page's own path and `#s=`; in a talk, the talk and its slide). */
export const shareLinkNow = (): string => shareUrl(shareNow(), `${location.origin}${location.pathname}`);

let camGen = 0;
/** The hand's view goes back on once the figure has landed (a view's flight would take it home again). A newer link, or 20 s, ends the wait. */
function cameraWhenLanded(cam: Cam): void {
  const gen = ++camGen, t0 = Date.now();
  const put = () => sceneApi.setCameraView({ orbit: (cam.orbit * Math.PI) / 180, k: cam.k, x: cam.x, y: cam.y });
  const ready = () => sceneApi.placed && !sceneApi.cameraMoving;
  const t = clock.every(() => {
    if (gen !== camGen) { clock.cancel(t); return; }
    if (ready() || Date.now() - t0 > 20000) { clock.cancel(t); put(); }
  }, 150);
}

const deps: ShareDeps = {
  loadPatient,
  currentParams,
  setParams: (params) => { updateParams(() => params, { settle: true, history: false, label: 'From the link' }); },
  view: () => useShell.getState().view,
  goToView: (v) => { goToView(v); },
  select: (sel) => selectStructure(sel),
  setCamera: cameraWhenLanded,
  say: (text, tone) => useShell.getState().say(text, tone),
  setFigure: (fig) => { applyExtras(fig); },
};
const presetIds = () => UI.presets.map((p) => p.id);

/** On load: open the address's shared scenario. True when the address carried one (read or not), so the plain deep link is not applied over it. */
export async function openSharedFromAddress(hash: string = location.hash): Promise<boolean> {
  if (!hasShare(hash)) return false;
  const s = readShare(hash, presetIds());
  if (!s) { useShell.getState().say(SHARE_WORDS.unread, 'bad'); return false; }
  await loadShared(s, deps);
  return true;
}

/** A share link pasted into the open tab (the address changes, the page does not reload) is applied as at start (2D main.js, B6). Returns the remover. */
export function watchSharedAddress(): () => void {
  let last = location.hash;
  const on = () => {
    if (!hasShare(location.hash) || location.hash === last) return;
    last = location.hash;
    const s = readShare(location.hash, presetIds());
    if (!s) { useShell.getState().say(SHARE_WORDS.unreadOpen, 'bad'); return; }
    if (talkOn()) return;   // (a talk is running: the link waits for the next load, the talk is not thrown away)
    void loadShared(s, deps);
  };
  window.addEventListener('hashchange', on);
  return () => window.removeEventListener('hashchange', on);
}
