import { useEffect } from 'react';
import { useUi, atEnd } from '../ui-store.ts';
import { cardZoom } from '../cards/card-zoom.ts';
import { useShell, anyShellPanel } from '../shell/store.ts';
import { clickerKey, addDigit, DIGIT_MS, type ClickAct } from './clicker.ts';
import { stopTalk } from '../shell/talk.ts';
import { finishTalk } from '../cards/finish.ts';
import { openPresenterView } from './presenter-link.ts';
import { W } from './words.ts';
import { createLaser, type Laser } from './laser.ts';
import './laser.css';

const OWNERS = 'button, a[href], [role="button"], [role="radio"], [role="tab"], [role="switch"], [tabindex="0"]';
const ARROW_OWNERS = 'input, select, textarea, [contenteditable], [role="slider"], [role="separator"], [role="menu"], [role="menuitem"], [role="listbox"], [role="option"], [role="radiogroup"], [role="tablist"], [role="spinbutton"]';

// Whether the person is using the keyboard to move about: a press, touch or click turns it off, a Tab turns it on (a clicker's Space after a mouse click is still the talk's).
let keyboardNav = true;

const toggleFull = () => {
  try { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen?.(); } catch { /* refused */ }
};

/** The clicker's keys (clicker.ts decides; this carries it out). While a sheet, a menu or a dialog is open its own keys win (Esc closes it first). */
export function useDeckInput() {
  useEffect(() => {
    let digits = '', timer: TimerId | undefined;
    // the laser is the talk's own: made with it, kept from slide to slide, put away under the black screen and when the talk ends (2D ink-gl.js: active() is "a talk, not blacked")
    const laser = createLaser({ active: () => { const u = useUi.getState(); return !!u.deck && !u.black; } });
    const offPos = useUi.subscribe((st, prev) => { if (st.black && !prev.black) laser.set(false); });
    const clear = () => { digits = ''; clock.cancel(timer); };
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Tab') keyboardNav = true;
      const ui = useUi.getState(), sh = useShell.getState();
      if (!ui.deck || !ui.stops.length) return;
      if (e.defaultPrevented) return;
      if (sh.dialog || sh.sheet || anyShellPanel(sh)) return;   // (a dialog or a sheet over the talk keeps its keys: Esc closes it rather than ending the talk)
      if (useDialogOpen()) return;
      const t = e.target as HTMLElement | null;
      const ownsEnter = keyboardNav && !!t?.closest?.(OWNERS) && !!t.matches?.(':focus-visible');
      const a = clickerKey(e, {
        digits, jumpOpen: ui.jump, wallet: !!ui.boxes.strip, controlOwnsEnter: ownsEnter, controlOwnsArrows: !!t?.closest?.(ARROW_OWNERS),
        inField: !!t?.closest?.('input, textarea, select, [contenteditable="true"]'), stops: ui.stops.length,
      });
      if (!a) return;
      e.preventDefault(); e.stopImmediatePropagation();
      carryOut(a, ui, sh, laser, { digits: () => digits, set: (d) => { digits = d; clock.cancel(timer); if (d) timer = clock.after(clear, DIGIT_MS); }, clear });
    };
    const mouse = () => { keyboardNav = false; };
    window.addEventListener('keydown', down, true);
    window.addEventListener('pointerdown', mouse, true);
    return () => { window.removeEventListener('keydown', down, true); window.removeEventListener('pointerdown', mouse, true); clear(); offPos(); laser.dispose(); };
  }, []);
}

import { useDialogs } from './dialogs.ts';
import { clock, type TimerId } from '../../clock/frame.ts';
const useDialogOpen = () => !!useDialogs.getState().dialog;

function carryOut(a: ClickAct, ui: ReturnType<typeof useUi.getState>, sh: ReturnType<typeof useShell.getState>, laser: Laser, d: { digits(): string; set(v: string): void; clear(): void }): void {
  switch (a.type) {
    case 'digit': { const v = addDigit(d.digits(), a.digit); d.set(v); sh.say(W.slideNumber(v)); break; }
    case 'go': d.clear(); ui.go(Math.min(a.stop, ui.stops.length - 1)); break;
    case 'move': if (a.to === 'next' && atEnd(ui)) finishTalk(); else ui.move(a.to); break;
    case 'swap': ui.swapWallet(); break;
    case 'black': ui.setBlack(); break;
    case 'full': toggleFull(); break;
    case 'jump': ui.setJump(); break;
    case 'presenter': if (!openPresenterView()) sh.say(W.noNotesWindow, 'bad'); break;
    case 'laser': laser.toggle(); break;
    case 'swallow': if (a.clear) d.clear(); break;
    case 'escape': if (ui.black) ui.setBlack(false); else if (cardZoom.on) void cardZoom.close(); else stopTalk(); break;
  }
}
