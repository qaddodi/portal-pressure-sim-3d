// Deep links on load, as the 2D app opens them (main.js openDeepLink): ?script=<id>&slide=<n> opens that talk at that slide, ?preset=<id> that patient in free play,
// ?home=explore|present the menu at Patients or Present. A mistyped patient never opens another: it says so and opens Patients with the link's first word in the search.
import { useShell } from './store.ts';
import { useUi } from '../ui-store.ts';
import { parseDeepLink, queryFromId } from './deep-link.ts';
import { deckOf } from '../deck/deck-of.ts';
import { readScriptLink } from '../talk/library.ts';
import { loadPatient } from '../menu/patients.ts';
import { startTalk } from './talk.ts';
import { noPatientCalled, notYet } from './words.ts';
import { UI } from '../strings.generated.ts';
import { openSharedFromAddress, watchSharedAddress } from './share-wire.ts';

export async function applyDeepLink(search: string): Promise<void> {
  watchSharedAddress();   // (a share link pasted into the open tab later is applied as at start)
  // A shared script (#script=…) adds itself to this device's library; the menu opens at Present so it shows (the 2D app opens it at Your scripts).
  if (readScriptLink()) { useShell.setState({ mode: 'free', sheet: 'menu', menuTab: 'present' }); return; }
  const l = parseDeepLink(search), sh = useShell.getState();
  // A shared scenario (#s=…, shell/share.ts): the patient with its settings, view, selection and camera. A talk's link (?script=) wins, as it names where to be.
  if (!l.script && await openSharedFromAddress()) return;
  if (l.script) {
    if (!deckOf(l.script.id)) { useShell.setState({ mode: 'free', sheet: 'menu', menuTab: 'present' }); sh.say(notYet('That presentation')); return; }
    startTalk(l.script.id);
    const slide = l.script.slide;
    if (slide > 0) { const off = useUi.subscribe((s) => { if (s.stops.length) { off(); useUi.getState().go(slide); } }); if (useUi.getState().stops.length) { off(); useUi.getState().go(slide); } }
    return;
  }
  if (l.preset) {
    useShell.setState({ mode: 'free' });
    if (UI.presets.some((p) => p.id === l.preset)) { await loadPatient(l.preset); return; }
    useShell.setState({ sheet: 'menu', menuTab: 'patients', menuQuery: queryFromId(l.preset) });
    sh.say(noPatientCalled(l.preset));
    return;
  }
  if (l.home) useShell.setState({ mode: 'free', sheet: 'menu', menuTab: l.home });
}
