// B9's wiring, once at start: Treat answers its button and the T key, the scene's picks select a structure, and the loaded patient's own settings are kept as the base the
// Changes list measures against. Returns the remover (a test or hot reload undoes it all).
import { registerFeature } from '../shell/features.ts';
import { useShell } from '../shell/store.ts';
import { useTreat } from '../treat/store.ts';
import { useTests } from '../tests/store.ts';
import { useEngine } from '../../engine/index.ts';
import { patient } from '../../engine/store.ts';
import { usePick, sceneApi } from '../../scene/api.ts';
import { bindScene, scenePicked, selectStructure, useSelection } from './selection.ts';
import { useLobulePick } from '../../scene/lobule/pick-store.ts';
import { onParamsChange, presetBase, presetStarted } from './params.ts';
import { activeInterventions } from './changes.ts';
import { setInterventionLabels, timeline } from '../timeline/index.ts';
import { MESHES_OF } from '../../scene/organs/pick.ts';
import { useUi } from '../ui-store.ts';
import { isPhone } from '../layout/device.ts';
import { usesBottomBar } from '../shell/room.ts';
import { startShunting } from './shunt.ts';
import { goToView } from '../shell/view-actions.ts';
import { logInput } from '../../scene/intent-log.ts';

/** The shell sheets that take the column Treat stands in. */
export const CARD_SHEETS: ReadonlySet<string> = new Set(['settings', 'menu', 'history', 'compare', 'help', 'guide', 'timeline']);

export function startActions(): () => void {
  const off: (() => void)[] = [];
  // Treat: its button, the T key, the thumb tab's second tap. Opening it puts the sheets away; a phone has room for one card, so opening Treat puts a structure's card away too.
  off.push(registerFeature('treat', () => {
    const t = useTreat.getState();
    if (!t.open) { useShell.getState().close(); if (isPhone(useUi.getState().device)) useSelection.setState({ sel: null }); }
    t.toggle();
  }));
  // the card buttons the other batches own: the lobule and sinusoid views a liver card opens
  off.push(registerFeature('view:lobule', () => { goToView('lobule'); }));
  off.push(registerFeature('view:sinusoid', () => { goToView('sinusoid'); }));
  off.push(registerFeature('view:circuit', () => { goToView('circuit'); }));
  // History: a change is named as the 2D app names it (activeInterventions), and every learner change is one entry (a slider drag is one: the timeline debounces it)
  setInterventionLabels((p) => new Map(activeInterventions(p as never).map((a) => [a.key, a.label])));
  off.push(onParamsChange(({ label, history }) => { if (history) timeline.noteChange(label); }));
  // the inputs that go with what the figure was asked (src/scene/intent-log.ts: the last 60 s ride in a bug report)
  off.push(useShell.subscribe((s, p) => { if (s.view !== p.view) logInput(`view ${s.view}`); if (s.sheet !== p.sheet) logInput(`sheet ${s.sheet ?? 'closed'}`); }));
  off.push(useUi.subscribe((s, p) => { if (s.pos.stop !== p.pos.stop) logInput(`stop ${s.pos.stop}`); }));
  off.push(usePick.subscribe((s, p) => { if (s.picked !== p.picked) logInput(`pick ${s.picked ?? 'none'}`); }));
  off.push(startShunting());   // Add shunt: the targets glow, a tap on one makes the shunt (shunt.ts)
  bindScene((id) => { if (usePick.getState().picked !== id) sceneApi.pick(id); });
  off.push(usePick.subscribe((s) => scenePicked(s.picked)));
  // a tapped organ is outlined heavily on the figure while it is the selection (the vessel's own glow is the pick's)
  const outline = (sel: ReturnType<typeof useSelection.getState>['sel']) => sceneApi.selectOrgans(sel?.type === 'organ' ? MESHES_OF[sel.id] ?? [] : []);
  outline(useSelection.getState().sel);
  off.push(useSelection.subscribe((s, prev) => { if (s.sel !== prev.sel) outline(s.sel); }));
  // the lobule's tapped part is marked while its card is the selection (and let go when the card goes)
  const mark = () => sceneApi.markLobule(useSelection.getState().sel?.type === 'lobule' ? useLobulePick.getState().hit : null);
  off.push(useSelection.subscribe((s, prev) => { if (s.sel !== prev.sel) mark(); }));
  // (two sinusoids are one card, so a tap from one to the other changes the mark but not the selection)
  const markTap = useLobulePick.subscribe(() => mark());
  // a tap on the lobule: its part's card (2D hitInto), and a second tap on the same part puts it away; a tap on nothing clears a lobule card
  off.push(useLobulePick.subscribe((s) => {
    const cur = useSelection.getState().sel, p = s.picked;
    if (!p) { if (cur?.type === 'lobule') selectStructure(null); return; }
    selectStructure(cur?.type === 'lobule' && cur.part === p.part && cur.zone === p.zone ? null : p);
  }));
  off.push(markTap);
  // a structure selected on a phone puts Treat away (2D onSelect)
  off.push(useSelection.subscribe((s, prev) => { if (s.sel && s.sel !== prev.sel && isPhone(useUi.getState().device) && useTreat.getState().open) useTreat.getState().setOpen(false); }));
  // a phone has room for one sheet (2D openPanel, openTreat): the Tests card coming up puts Treat away (Treat's Paracentesis opens Ascites), and Treat coming up puts Tests away
  // (every layout whose cards are sheets over the dock has that one slot, an upright iPad's too: both up drew one sheet over the other)
  off.push(useTests.subscribe((s, prev) => { if (s.open && !prev.open && usesBottomBar(useUi.getState().device) && useTreat.getState().open) useTreat.getState().setOpen(false); }));
  off.push(useTreat.subscribe((s, prev) => { if (s.open && !prev.open && usesBottomBar(useUi.getState().device) && useTests.getState().open) useTests.getState().close(); }));
  // a wide screen has room for both in the right-hand column, Treat standing beside the Tests card (treat/beside.ts); an instrument in focus fills the screen, so Treat and
  // focus give way to each other
  off.push(useTests.subscribe((s, prev) => { if (s.open && s.state === 'focus' && prev.state !== 'focus' && useTreat.getState().open) useTreat.getState().setOpen(false); }));
  off.push(useTreat.subscribe((s, prev) => { if (s.open && !prev.open && useTests.getState().open && useTests.getState().state === 'focus') useTests.getState().setState('open'); }));
  // the right-hand column holds one card: Settings, the main menu, History, Compare and Help coming up put Treat away, as Treat coming up puts them away (above); both open together drew Settings over
  // Treat's rows (walk of 20 Nov, issue 7). The speed, lens and other popovers are not cards, and leave it be.
  off.push(useShell.subscribe((s, prev) => { if (s.sheet && s.sheet !== prev.sheet && CARD_SHEETS.has(s.sheet) && useTreat.getState().open) useTreat.getState().setOpen(false); }));
  // the loaded patient's own settings: what it came with is a fact about it, not a change
  const keepBase = () => { const s = useEngine.getState(); if (s.status === 'ready' && s.presetId && patient.params && !presetBase()) presetStarted(s.presetId, patient.params); };
  keepBase();
  off.push(useEngine.subscribe(keepBase));
  return () => { for (const f of off) f(); };
}
