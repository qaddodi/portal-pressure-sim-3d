// B9's wiring, once at start: Treat answers its button and the T key, the scene's picks select a structure, and the loaded patient's own settings are kept as the base the
// Changes list measures against. Returns the remover (a test or hot reload undoes it all).
import { registerFeature } from '../shell/features.ts';
import { useShell } from '../shell/store.ts';
import { useTreat } from '../treat/store.ts';
import { useEngine } from '../../engine/index.ts';
import { patient } from '../../engine/store.ts';
import { usePick, sceneApi } from '../../scene/api.ts';
import { bindScene, scenePicked, useSelection } from './selection.ts';
import { onParamsChange, presetBase, presetStarted } from './params.ts';
import { activeInterventions } from './changes.ts';
import { setInterventionLabels, timeline } from '../timeline/index.ts';
import { useUi } from '../ui-store.ts';
import { isPhone } from '../layout/device.ts';
import { injectDye } from './dye.ts';
import { startShunting } from './shunt.ts';
import './stent/StentPanel.tsx';   // (registers the stent editor as the card's 'stent' panel)
import { goToView } from '../shell/view-actions.ts';

export function startActions(): () => void {
  const off: (() => void)[] = [];
  // Treat: its button, the T key, the thumb tab's second tap. Opening it puts the sheets away; a phone has room for one card, so opening Treat puts a structure's card away too.
  off.push(registerFeature('treat', () => {
    const t = useTreat.getState();
    if (!t.open) { useShell.getState().close(); if (isPhone(useUi.getState().device)) useSelection.setState({ sel: null }); }
    t.toggle();
  }));
  // the card buttons the other batches own: Inject dye (the J key too), and the lobule and sinusoid views a liver card opens
  off.push(registerFeature('dye', () => injectDye({})));
  off.push(registerFeature('view:lobule', () => { goToView('lobule'); }));
  off.push(registerFeature('view:sinusoid', () => { goToView('sinusoid'); }));
  off.push(registerFeature('view:circuit', () => { goToView('circuit'); }));
  // History: a change is named as the 2D app names it (activeInterventions), and every learner change is one entry (a slider drag is one: the timeline debounces it)
  setInterventionLabels((p) => new Map(activeInterventions(p as never).map((a) => [a.key, a.label])));
  off.push(onParamsChange(({ label, history }) => { if (history) timeline.noteChange(label); }));
  off.push(startShunting());   // Add shunt: the targets glow, a tap on one makes the shunt (shunt.ts)
  bindScene((id) => { if (usePick.getState().picked !== id) sceneApi.pick(id); });
  off.push(usePick.subscribe((s) => scenePicked(s.picked)));
  // a structure selected on a phone puts Treat away (2D onSelect)
  off.push(useSelection.subscribe((s, prev) => { if (s.sel && s.sel !== prev.sel && isPhone(useUi.getState().device) && useTreat.getState().open) useTreat.getState().setOpen(false); }));
  // the loaded patient's own settings: what it came with is a fact about it, not a change
  const keepBase = () => { const s = useEngine.getState(); if (s.status === 'ready' && s.presetId && patient.params && !presetBase()) presetStarted(s.presetId, patient.params); };
  keepBase();
  off.push(useEngine.subscribe(keepBase));
  return () => { for (const f of off) f(); };
}
