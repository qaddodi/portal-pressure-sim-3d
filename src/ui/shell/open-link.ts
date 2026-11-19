// Deep links on load, as the 2D app opens them (main.js openDeepLink): ?script=<id>&slide=<n> opens that talk at that slide, ?preset=<id> that patient in free play,
// ?home=explore|present the menu at Patients or Present. A mistyped patient never opens another: it says so and opens Patients with the link's first word in the search.
import { useShell } from './store.ts';
import { parseDeepLink, queryFromId } from './deep-link.ts';
import { W } from '../deck/words.ts';
import { readScriptLink } from '../talk/library.ts';
import { loadPatient } from '../menu/patients.ts';
import { startTalk } from './talk.ts';
import { noPatientCalled } from './words.ts';
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
    // (2D presenter-start.js: a talk that is not there says so and opens nothing; a slide past the end opens the last one. The talk is read first when it is one read on opening.)
    if (!startTalk(l.script.id, l.script.slide)) { useShell.setState({ mode: 'free' }); sh.say(W.notFound, 'bad'); }
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
