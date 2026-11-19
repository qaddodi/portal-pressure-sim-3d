// The search's commands: the 2D app's list (parity/inventory.json, through strings.generated.ts) with the work behind each. A command whose work is not in the 3D app yet
// stays in the list (type "tips 8" and it is there) and says so when run; the empty field offers only what works.
import { UI } from '../strings.generated.ts';
import { norm, type Command } from './match.ts';
import { useShell, LENS_IDS } from '../shell/store.ts';
import { sceneApi } from '../../scene/api.ts';
import type { LensId } from '../../scene/lenses/model.ts';
import { isWiredCommand, TESTS_PANE } from './wired.ts';
import { useSettings } from '../../state/settings.ts';
import { LOOK_IDS, type LookId } from '../../looks/looks.ts';
import { runFeature, type FeatureId } from '../shell/features.ts';
import { goToView } from '../shell/view-actions.ts';
import { jump, restart } from '../shell/transport.ts';
import { loadPatient } from '../menu/patients.ts';
import { PLAYABLE } from '../menu/library.ts';
import { lensToast } from '../shell/words.ts';
import { notYet } from '../shell/words.ts';
import { useTests } from '../tests/store.ts';
import { BUILT_PANES } from '../tests/panes.ts';
import { commandWork, commandOffered } from '../treat/palette-orders.ts';
import { appEnv } from '../treat/env.ts';
import { shareView } from '../talk/library.ts';
import { selectStructure, type Sel } from '../action/selection.ts';
import { goToSel } from './wired.ts';

export interface Extra extends Command { wired: boolean }

const DAYS: Record<string, number> = { '+1 week': 7, '+1 month': 30, '+6 months': 180, '+1 year': 365 };
const FEATURE_OF: Record<string, FeatureId> = { 'Undo (back one change)': 'undo', 'Compare from here': 'compare', Tests: 'tests', 'Doppler of the portal vein': 'tests', Endoscopy: 'tests' };

/** Go to a structure (2D palette.js ctx.select): it becomes the selection, so its card opens and a vessel lights. Ascites has no card: its pane of the Tests card opens
 *  (2D main.js select). From inside the lobule or the sinusoid the figure goes back to the body, where the structure is. */
function goToStructure(sel: Sel): void {
  if (sel.type === 'organ' && sel.id === 'abdomen' && BUILT_PANES.includes('abdomen')) { selectStructure(null); useTests.getState().show('abdomen'); return; }
  const v = useShell.getState().view;
  if (v === 'lobule' || v === 'sinusoid') goToView('anatomic');
  selectStructure(sel);
}

/** The work behind a 2D command, or null where it is not in the 3D app yet. */
export function work(group: string, title: string): ((n: number | null) => void) | null {
  const sh = () => useShell.getState();
  if (group === 'Tests') {
    const pane = TESTS_PANE[title];
    if (pane && BUILT_PANES.includes(pane)) return () => useTests.getState().show(pane);
  }
  if (group === 'Time') {
    if (title in DAYS) return () => jump(DAYS[title]);
    if (title === 'Until something happens') return () => jump('event');
    if (title === 'Restart this patient') return () => restart();
  }
  if (group === 'Treat' || group === 'Change') return commandWork(appEnv, group, title);
  if (group === 'View') {
    const lens = UI.lenses.find((l) => title === `Colored by ${l.name.toLowerCase()}`);
    if (lens) return () => { sceneApi.setLens(lens.id as LensId); sh().say(lensToast(lens.name, lens.note)); };
    if (title === 'Anatomy view') return () => { goToView('anatomic'); };
    if (title === 'Circuit view') return () => { goToView('circuit'); };
    if (title === 'Lobule view') return () => { goToView('lobule'); };
    if (title === 'Tests') return () => { runFeature('tests', title); };   // (2D ctx.instruments: the Tests card, up or down)
  }
  if (group === 'Go to') {
    const sel = goToSel(title);
    if (sel) return () => goToStructure(sel);
  }
  if (group === 'App') {
    if (title === 'Home') return () => sh().set({ mode: 'free', sheet: null });
    if (title === 'Reset everything') return () => sh().set({ dialog: 'reset' });
    if (title === 'Guide & shortcuts') return () => sh().set({ sheet: 'help', helpSection: null });
    if (title === 'Light / dark theme') return () => { const s = useSettings.getState(); s.setLook(document.documentElement.dataset.look === 'light' || document.documentElement.dataset.look === 'soft' ? 'dark' : 'light'); };
    const look = LOOK_IDS.find((id) => title === `Appearance: ${UI.looks.find((l) => l.id === id)!.name}`);
    if (look) return () => useSettings.getState().setLook(look as LookId);
    if (title === 'Copy share link') return () => shareView();   // (the 2D share link: patient, settings, view, selection, camera; the menu's Copy link is the same one)
  }
  return null;
}

/** Every command the search offers, with the work behind it where there is some. Rebuilt on open (cheap: a few hundred rows). */
export function buildCommands(start: (deckId: string) => void): Extra[] {
  const out: Extra[] = [];
  const add = (group: string, title: string, run: ((n: number | null) => void) | null, kw: string, num: string | null, hint: string, feat?: FeatureId) => {
    out.push({ group, title, kw: norm(`${title} ${kw}`), num, hint, wired: isWiredCommand(group, title), run: run ?? (() => { if (feat) runFeature(feat, title); else useShell.getState().say(notYet(title)); }) });
  };
  for (const c of UI.search.commands) {
    if ((c.group === 'Treat' || c.group === 'Change') && !commandOffered(c.group, c.title)) continue;   // (a take-down is offered only for what is in place)
    if (c.group === 'App' && c.title.startsWith('Appearance: ')) { const l = UI.looks.find((x) => c.title === `Appearance: ${x.name}`); add(c.group, c.title, work(c.group, c.title), `theme look color colour palette ${l && l.id !== 'light' && l.id !== 'soft' ? 'dark' : l?.id ?? ''} ${l?.id === 'navy' || l?.id === 'black' ? l.id : ''}`, null, ''); continue; }
    if (c.group === 'View' && c.title.startsWith('Colored by ')) { const l = UI.lenses.find((x) => c.title === `Colored by ${x.name.toLowerCase()}`); add(c.group, c.title, work(c.group, c.title), `color colour lens ${l?.note ?? ''}`, null, ''); continue; }
    add(c.group, c.title, work(c.group, c.title), c.kw, c.num, c.hint, FEATURE_OF[c.title]);
  }
  // (2D palette.js lists Ascites among its organs; the inventory the words come from was taken before it was added, so it is put in here until the next copy.)
  if (!out.some((c) => c.group === 'Go to' && c.title === 'Ascites')) add('Go to', 'Ascites', work('Go to', 'Ascites'), 'organ select', null, '');
  for (const p of UI.presets) add('Patient', p.label, () => { void loadPatient(p.id); }, `scenario preset ${p.group}`, null, '');
  for (const d of UI.decks) if (d.id in PLAYABLE) add('Present', d.short, () => start(d.id), `${d.title} ${d.summary} present presentation deck talk slides`, null, '');
  return out;
}
export { LENS_IDS };
