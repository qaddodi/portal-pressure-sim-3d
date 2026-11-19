import { useEffect } from 'react';
import { useUi } from '../ui-store.ts';
import { useShell } from '../shell/store.ts';
import { clickerKey, addDigit, DIGIT_MS, type ClickAct } from './clicker.ts';
import { leaveTalk } from '../shell/talk.ts';
import { openPresenterView } from './presenter-link.ts';
import { W } from './words.ts';

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
    let digits = '', timer: ReturnType<typeof setTimeout> | undefined;
    const clear = () => { digits = ''; clearTimeout(timer); };
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Tab') keyboardNav = true;
      const ui = useUi.getState(), sh = useShell.getState();
      if (!ui.deck || !ui.stops.length || sh.mode !== 'deck') return;
      if (e.defaultPrevented) return;
      if (sh.dialog || sh.sheet) return;   // (a dialog or a sheet over the talk keeps its keys: Esc closes it rather than ending the talk)
      if (useDialogOpen()) return;
      const t = e.target as HTMLElement | null;
      const ownsEnter = keyboardNav && !!t?.closest?.(OWNERS) && !!t.matches?.(':focus-visible');
      const a = clickerKey(e, {
        digits, jumpOpen: ui.jump, wallet: !!ui.boxes.strip, controlOwnsEnter: ownsEnter, controlOwnsArrows: !!t?.closest?.(ARROW_OWNERS),
        inField: !!t?.closest?.('input, textarea, select, [contenteditable="true"]'), stops: ui.stops.length,
      });
      if (!a) return;
      e.preventDefault(); e.stopImmediatePropagation();
      carryOut(a, ui, sh, { digits: () => digits, set: (d) => { digits = d; clearTimeout(timer); if (d) timer = setTimeout(clear, DIGIT_MS); }, clear });
    };
    const mouse = () => { keyboardNav = false; };
    window.addEventListener('keydown', down, true);
    window.addEventListener('pointerdown', mouse, true);
    return () => { window.removeEventListener('keydown', down, true); window.removeEventListener('pointerdown', mouse, true); clear(); };
  }, []);
}

import { useDialogs } from './dialogs.ts';
const useDialogOpen = () => !!useDialogs.getState().dialog;

function carryOut(a: ClickAct, ui: ReturnType<typeof useUi.getState>, sh: ReturnType<typeof useShell.getState>, d: { digits(): string; set(v: string): void; clear(): void }): void {
  switch (a.type) {
    case 'digit': { const v = addDigit(d.digits(), a.digit); d.set(v); sh.say(W.slideNumber(v)); break; }
    case 'go': d.clear(); ui.go(Math.min(a.stop, ui.stops.length - 1)); break;
    case 'move': ui.move(a.to); break;
    case 'swap': ui.swapWallet(); break;
    case 'black': ui.setBlack(); break;
    case 'full': toggleFull(); break;
    case 'jump': ui.setJump(); break;
    case 'presenter': if (!openPresenterView()) sh.say(W.noNotesWindow, 'bad'); break;
    case 'laser': case 'swallow': break;
    case 'escape': if (ui.black) ui.setBlack(false); else leaveTalk(); break;
  }
}
