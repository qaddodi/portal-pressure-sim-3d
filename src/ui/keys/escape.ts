// What one Esc closes, in 2D's order (keyboard.js): one Esc closes one thing. A dialog or a menu first, then a Tests instrument that fills the screen (back to the card), then the Treat
// card, then (the card's Tests: its own pick, then closed), the sinusoid (back to the lobule), a structure's card, and last a talk. The Treat card comes BEFORE the Tests card (2D:
// `treatOpen()` is asked before `dock.close()`), so with both up the first Esc puts Treat away, as the owner's Mac play-test (19 Nov) expects.
export type EscStep = 'dialog' | 'sheet' | 'tests-focus' | 'treat' | 'tests' | 'sinusoid' | 'selection' | 'talk' | null;

export interface EscState { dialog: boolean; sheet: boolean; testsOpen: boolean; testsFocus: boolean; treatOpen: boolean; sinusoid: boolean; selection: boolean; talk: boolean }

export function escStep(s: EscState): EscStep {
  if (s.dialog) return 'dialog';
  if (s.sheet) return 'sheet';
  if (s.testsOpen && s.testsFocus) return 'tests-focus';
  if (s.treatOpen) return 'treat';
  if (s.testsOpen) return 'tests';
  if (s.selection) return 'selection';   // (2D: the sinusoid backs out only when nothing is selected)
  if (s.sinusoid) return 'sinusoid';
  if (s.talk) return 'talk';
  return null;
}
