// The page's keys, one handler: decideKey (keymap.ts, the 2D app's rules) says what a press means; this carries it out. Esc closes one thing at a time:
// a dialog, then the open sheet, then the talk. An open dialog's Esc never reaches here: the dialog shell takes it first (surface/dialog-stack.ts), and the dialog step below
// goes through the same shell, so there is one way a dialog is cancelled.
import { useEffect } from 'react';
import { UI } from '../strings.generated.ts';
import { useShell, LENS_IDS } from '../shell/store.ts';
import { useLens } from '../../scene/lenses/store.ts';
import { lensesFor } from '../../scene/lenses/in-view.ts';
import { sceneApi } from '../../scene/api.ts';
import { useSettings } from '../../state/settings.ts';
import { decideKey, stepSpeed, type KeyAction, type Target } from './keymap.ts';
import { runFeature } from '../shell/features.ts';
import { refitFigure, flipView, zoomFigure, goToView } from '../shell/view-actions.ts';
import { settle, setSpeed, step, togglePlay } from '../shell/transport.ts';
import { stopTalk } from '../shell/talk.ts';
import { useTreat } from '../treat/store.ts';
import { useSelection, selectStructure } from '../action/selection.ts';
import { triggerCardVerb, cardIsOpen, removeFromCard } from '../action/card-keys.ts';
import { openGuide } from '../shell/HelpSheets.tsx';
import { SETTLED, lensToast, speedToast } from '../shell/words.ts';
import { useTests } from '../tests/store.ts';
import { escStep } from './escape.ts';
import { panelOrder } from '../surface/wire.ts';
import { isPanel } from '../surface/kinds.ts';
import { dialogOpen, cancelTopDialog } from '../surface/dialog-stack.ts';
import { talkOn } from '../../state/deck.ts';
import { isCaptureKey } from '../capture/capture-model.ts';
import { isRecordKey, recordAvailable, toggleRecording, warmRecording } from '../capture/record-model.ts';
import { clock } from '../../clock/frame.ts';

export function targetOf(el: EventTarget | null): Target {
  const t = el as HTMLElement | null;
  if (!t?.closest) return 'page';
  if (t.closest('input[type="range"]')) return 'range';
  if (t.closest('input, textarea, select, [contenteditable="true"]')) return 'text';
  if (t.closest('[role="switch"], [role="checkbox"]')) return 'switch';
  if (t.closest('button, a, [role="button"]')) return 'button';
  if (t.closest('canvas')) return 'figure';
  return 'page';
}

/** Which panel is newest of the right column, for Esc (surface/wire.ts usePanelOrder), and whether the menus' slot holds a panel. */
function escPanels(sheet: string | null): { sheetPanel: boolean; newest: 'sheet' | 'treat' | 'tests' | null } {
  const right = panelOrder().filter((p) => p !== 'action'), last = right[right.length - 1] ?? null;
  return { sheetPanel: !!sheet && isPanel(sheet), newest: last === 'treat' || last === 'tests' ? last : last ? 'sheet' : null };
}

export function carryOut(a: KeyAction): void {
  const sh = useShell.getState();
  switch (a.type) {
    case 'search-toggle': sh.toggle('search'); break;
    case 'search-open': sh.open('search'); break;
    case 'close': {
      const tests = useTests.getState();
      const step = escStep({ dialog: dialogOpen() || !!sh.dialog, sheet: !!sh.sheet, testsOpen: tests.open, testsFocus: tests.open && tests.state === 'focus', treatOpen: useTreat.getState().open,
        sinusoid: sh.view === 'sinusoid', selection: !!useSelection.getState().sel, talk: talkOn(), ...escPanels(sh.sheet) });
      if (step === 'dialog') { if (!cancelTopDialog('esc')) useShell.setState({ dialog: null }); }
      else if (step === 'sheet') sh.close();
      else if (step === 'tests-focus' || step === 'tests') tests.back();   // (the Tests card; its Why? is the shared sheet above, closed first)
      else if (step === 'treat') useTreat.getState().setOpen(false);
      else if (step === 'selection') selectStructure(null);
      else if (step === 'sinusoid') goToView('lobule');   // (2D: Esc in the sinusoid backs out to the lobule)
      else if (step === 'talk') stopTalk();
      break;
    }
    case 'undo': runFeature('undo', UI.playbar.menu[2]); break;
    case 'redo': runFeature('redo', 'Redo'); break;
    case 'play-pause': togglePlay(); break;
    case 'step': step(); break;
    case 'speed': {
      const t = sh.transport;
      const to = stepSpeed(UI.playbar.speeds, UI.playbar.lapses.map((l) => l.days), { speed: t.speed, lapse: t.lapse }, a.dir);
      setSpeed(to.value, to.lapse);
      const long = UI.playbar.lapses.find((l) => l.days === to.value)?.long ?? '';
      sh.say(speedToast(to.lapse, long, to.value));
      break;
    }
    case 'zoom': if (a.dir === 'fit') refitFigure(); else zoomFigure(a.dir); break;
    case 'view-toggle': flipView(); break;
    case 'lens': {
      // (the lenses this view offers, lenses/in-view.ts: the L key never puts on a lens the view cannot draw)
      const ids = lensesFor(useShell.getState().view, LENS_IDS);
      if (ids.length < 2) break;
      const i = Math.max(0, ids.indexOf(useLens.getState().lens)), next = ids[(i + a.dir + ids.length) % ids.length]!;
      const l = UI.lenses.find((x) => x.id === next)!;
      sceneApi.setLens(next);
      sh.say(lensToast(l.name, l.note));
      break;
    }
    case 'settle': settle(); sh.say(SETTLED); break;
    case 'help': openGuide(talkOn() ? 'present' : null); break;   // (2D: ? in a talk opens the guide at While presenting)
    case 'tests': runFeature('tests', 'Tests'); break;
    case 'treat': runFeature('treat', 'Treat'); break;
    case 'compare': runFeature('compare', 'Compare'); break;
    case 'card-verb': triggerCardVerb(a.n); break;
    case 'card-remove': removeFromCard(); break;
    case 'ignore': break;
  }
}

export function useKeys() {
  useEffect(() => {
    // (the recording code comes in a moment after the first picture, so Option Shift R goes straight through inside the key press)
    const warm = clock.after(() => { void warmRecording(); }, 3000, 'record-warm');
    const down = (e: KeyboardEvent) => {
      if (isCaptureKey(e)) { e.preventDefault(); void import('../capture/capture.ts').then((m) => m.captureScreen()); return; }   // (Option Shift S: the screen as it is, the open sheet and all)
      if (isRecordKey(e) && recordAvailable()) { e.preventDefault(); void toggleRecording(); return; }   // (Option Shift R: start recording the window, or stop and save; only where the browser can)
      const sh = useShell.getState();
      const a = decideKey(e, { target: targetOf(e.target), searchOpen: sh.sheet === 'search', sheetOpen: sh.sheet !== null || sh.dialog !== null || dialogOpen(), talk: talkOn(), keysOn: useSettings.getState().keys, inSinusoid: sh.view === 'sinusoid', cardOpen: cardIsOpen() });
      if (!a) return;
      if (a.type === 'ignore') { if (a.prevent) e.preventDefault(); return; }
      if (a.type === 'play-pause' ? a.prevent : a.type === 'search-toggle' || a.type === 'search-open' || a.type === 'help' || a.type === 'zoom' || a.type === 'step' || (a.type === 'card-remove' && removeFromCard.available())) e.preventDefault();
      carryOut(a);
    };
    window.addEventListener('keydown', down);
    return () => { clock.cancel(warm); window.removeEventListener('keydown', down); };
  }, []);
}
