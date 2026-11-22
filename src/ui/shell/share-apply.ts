// Puts a link's figure state (`#x`: the look, the lens, the label level, the figure's switches, the view) on the page through the app's own writers (settings, shell store, scene API).
// Returns what it could not apply, never throws. The share link (share-wire.ts) opens a link with it in every build, so it lives here in the shell, NOT under ui/debug: the boot entry
// must never reach debug code (tests/boot-entry.test.ts). The debug packet (ui/debug/packet/apply.ts) re-exports it for the preview's own "apply a packet" path.
import { useSettings } from '../../state/settings.ts';
import { useShell } from './store.ts';
import { goToView } from './view-actions.ts';
import { sceneApi } from '../../scene/api.ts';
import { cleanExtras, type Extras } from '../debug/packet/state.ts';
import type { LookChoice } from '../../looks/looks.ts';
import type { LensId } from '../../scene/lenses/model.ts';

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
