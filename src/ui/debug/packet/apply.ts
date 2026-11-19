// Puts a link's `#x` part on a booted page, through the app's own writers (settings, shell store, scene API). Returns what it could not apply, never throws.
// Runs once after boot on the preview copy (debug/mount.ts); the deep link (the talk, the patient) is the app's own load path and has been applied by then.
import { useSettings } from '../../../state/settings.ts';
import { useShell } from '../../shell/store.ts';
import { goToView } from '../../shell/view-actions.ts';
import { sceneApi } from '../../../scene/api.ts';
import { cleanExtras, type Extras } from './state.ts';
import type { LookChoice } from '../../../looks/looks.ts';
import type { LensId } from '../../../scene/lenses/model.ts';

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

/** On the preview copy, after boot: the `#x` of the address, if there is one. */
export function applyFromAddress(hash: string = location.hash): string[] | null {
  const m = String(hash || '').match(/#x=([\w-]+)/);
  if (!m) return null;
  let x: unknown = null;
  try { x = JSON.parse(decodeURIComponent(escape(atob(m[1]!.replace(/-/g, '+').replace(/_/g, '/'))))); } catch { return ['the link\'s #x part could not be read']; }
  return applyExtras(x);
}
