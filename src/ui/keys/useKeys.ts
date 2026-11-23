// The page's keys, one handler: decideKey (keymap.ts, the 2D app's rules) says what a press means; this carries it out. Esc closes one thing at a time:
// the Reset dialog, then the open sheet, then the talk.
import { useEffect } from 'react';
import { UI } from '../strings.generated.ts';
import { useShell, LENS_IDS } from '../shell/store.ts';
import { useLens } from '../../scene/lenses/store.ts';
import { sceneApi } from '../../scene/api.ts';
import { useSettings } from '../../state/settings.ts';
import { decideKey, stepSpeed, type KeyAction, type Target } from './keymap.ts';
import { runFeature } from '../shell/features.ts';
import { refitFigure, flipView, zoomFigure, goToView } from '../shell/view-actions.ts';
import { settle, setSpeed, step, togglePlay } from '../shell/transport.ts';
import { stopTalk } from '../shell/talk.ts';
import { useTreat } from '../treat/store.ts';
import { useSelection, selectStructure } from '../action/selection.ts';
import { triggerCardVerb, cardIsOpen, removeFromCard } from '../action/ActionCard.tsx';
import { openGuide } from '../shell/HelpSheets.tsx';
import { releaseDye } from '../action/dye.ts';
import { SETTLED, lensToast, speedToast } from '../shell/words.ts';
import { useTests } from '../tests/store.ts';
import { escStep } from './escape.ts';
import { talkOn } from '../../state/deck.ts';
import { isCaptureKey } from '../capture/capture-model.ts';

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

export function carryOut(a: KeyAction): void {
  const sh = useShell.getState();
  switch (a.type) {
    case 'search-toggle': sh.toggle('search'); break;
    case 'search-open': sh.open('search'); break;
    case 'close': {
      const tests = useTests.getState();
      const step = escStep({ dialog: !!sh.dialog, sheet: !!sh.sheet, testsOpen: tests.open, testsFocus: tests.open && tests.state === 'focus', treatOpen: useTreat.getState().open,
        sinusoid: sh.view === 'sinusoid', selection: !!useSelection.getState().sel, talk: talkOn() });
      if (step === 'dialog') useShell.setState({ dialog: null });
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
      const i = Math.max(0, LENS_IDS.indexOf(useLens.getState().lens)), next = LENS_IDS[(i + a.dir + LENS_IDS.length) % LENS_IDS.length];
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
    case 'dye': runFeature('dye', 'Inject dye', { hold: true }); dyeKey = true; break;   // (2D keyboard.js: J held keeps injecting; its release, or the window losing focus, lets go)
    case 'card-verb': triggerCardVerb(a.n); break;
    case 'card-remove': removeFromCard(); break;
    case 'ignore': break;
  }
}

/** J is down: its keyup (or the window blurring) lets the dye go. */
let dyeKey = false;
export const dyeKeyUp = (): void => { if (dyeKey) { dyeKey = false; releaseDye(); } };

export function useKeys() {
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (isCaptureKey(e)) { e.preventDefault(); void import('../capture/capture.ts').then((m) => m.captureScreen()); return; }   // (Option Shift S: the screen as it is, the open sheet and all)
      const sh = useShell.getState();
      const a = decideKey(e, { target: targetOf(e.target), searchOpen: sh.sheet === 'search', sheetOpen: sh.sheet !== null || sh.dialog !== null, talk: talkOn(), keysOn: useSettings.getState().keys, inSinusoid: sh.view === 'sinusoid', cardOpen: cardIsOpen() });
      if (!a) return;
      if (a.type === 'ignore') { if (a.prevent) e.preventDefault(); return; }
      if (a.type === 'play-pause' ? a.prevent : a.type === 'search-toggle' || a.type === 'search-open' || a.type === 'help' || a.type === 'zoom' || a.type === 'step' || (a.type === 'card-remove' && removeFromCard.available())) e.preventDefault();
      carryOut(a);
    };
    const up = (e: KeyboardEvent) => { if (e.key.toLowerCase() === 'j' || e.code === 'KeyJ') dyeKeyUp(); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', dyeKeyUp);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', dyeKeyUp); };
  }, []);
}
