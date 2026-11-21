// Puts a link's `#x` part on a booted page, through the app's own writers (settings, shell store, scene API). Returns what it could not apply, never throws.
// Runs once after boot on the preview copy (debug/mount.ts); the deep link (the talk, the patient) is the app's own load path and has been applied by then.
import { useSettings } from '../../../state/settings.ts';
import { useShell } from '../../shell/store.ts';
import { goToView } from '../../shell/view-actions.ts';
import { sceneApi } from '../../../scene/api.ts';
import { cleanExtras, type Extras } from './state.ts';
import { updateParams, presetBase } from '../../action/params.ts';
import { useEngine } from '../../../engine/index.ts';
import { flagValue } from '../flags.ts';
import type { LookChoice } from '../../../looks/looks.ts';
import type { LensId } from '../../../scene/lenses/model.ts';

import { clock } from '../../../clock/frame.ts';
export function applyExtras(raw: unknown): string[] {
  const x: Extras = cleanExtras(raw), skipped: string[] = [];
  const tryDo = (name: string, fn: () => void) => { try { fn(); } catch (e) { skipped.push(`${name}: ${(e as Error)?.message ?? e}`); } };
  if (x.look) tryDo('look', () => useSettings.getState().setLook(x.look as LookChoice));
  if (x.lens) tryDo('lens', () => sceneApi.setLens(x.lens as LensId, true));
  if (x.labels) tryDo('labels', () => useShell.getState().setFigure({ labelLevel: x.labels as 'key' | 'all' | 'none' }));
  if (x.figure) tryDo('figure', () => useShell.getState().setFigure(x.figure!));
  if (x.view && x.view !== useShell.getState().view) tryDo('view', () => { if (!goToView(x.view as 'anatomic' | 'lobule' | 'sinusoid')) skipped.push(`view: ${x.view} is not drawn yet`); });
  return skipped;
}

/** Polls `ready` every 150 ms until it is true or `ms` has passed; the answer is whether it was. (A debug-only wait on the page's own boot; nothing here runs per frame.) */
const until = (ready: () => boolean, ms: number): Promise<boolean> => new Promise((done) => {
  if (ready()) { done(true); return; }
  const t0 = Date.now(), t = clock.every(() => { if (ready()) { clock.cancel(t); done(true); } else if (Date.now() - t0 > ms) { clock.cancel(t); done(false); } }, 150);
});

/**
 * The parts of a state link that need the page to have finished loading what the deep link asked for: the sliders (the patient's own settings must be in first, or the
 * difference would be put on the wrong patient), then the camera (a shot's flight would take the hand's view back) and the picked vessel. Returns what it could not apply.
 */
export async function applyLate(raw: unknown, preset: string | null = null, waitMs = 20000): Promise<string[]> {
  const x: Extras = cleanExtras(raw), skipped: string[] = [];
  if (!x.params && !x.cam && !x.sel) return skipped;
  if (x.params) {
    const ok = await until(() => { const b = presetBase(), id = useEngine.getState().presetId; return !!b && (!preset || id === preset); }, waitMs);
    if (!ok) skipped.push('sliders: the patient was not loaded in time');
    else { try { if (!updateParams(x.params, { label: 'From the link', settle: true })) skipped.push('sliders: the model would not take them'); } catch (e) { skipped.push(`sliders: ${(e as Error)?.message ?? e}`); } }
  }
  if (x.cam || x.sel) {
    const settled = await until(() => sceneApi.placed && !sceneApi.cameraMoving, waitMs);
    if (!settled) skipped.push('camera: the figure was still moving');
    if (x.cam) { try { sceneApi.setCameraView({ orbit: (x.cam.orbit * Math.PI) / 180, k: x.cam.k, x: x.cam.x, y: x.cam.y }); } catch (e) { skipped.push(`camera: ${(e as Error)?.message ?? e}`); } }
    if (x.sel) { try { sceneApi.pick(x.sel); } catch (e) { skipped.push(`vessel: ${(e as Error)?.message ?? e}`); } }
  }
  return skipped;
}

/** On the preview copy, after boot: the `#x` of the address, if there is one. */
export function applyFromAddress(hash: string = location.hash): string[] | null {
  const m = String(hash || '').match(/#x=([\w-]+)/);
  if (!m) return null;
  let x: unknown = null;
  try { x = JSON.parse(decodeURIComponent(escape(atob(m[1]!.replace(/-/g, '+').replace(/_/g, '/'))))); } catch { return ['the link\'s #x part could not be read']; }
  const skipped = applyExtras(x);
  // the late parts run on their own: the deep link's patient and slide are still loading when this returns
  const preset = flagValue('preset');
  void applyLate(x, preset && /^[\w-]{1,40}$/.test(preset) ? preset : null).then((late) => { if (late.length) console.warn('[packet] not applied:', late.join('; ')); });
  return skipped;
}
