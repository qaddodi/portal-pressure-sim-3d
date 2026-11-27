// What one Esc closes, in 2D's order (keyboard.js): one Esc closes one thing. A dialog or a menu first, then a Tests instrument that fills the screen (back to the card), then the Treat
// card, then (the card's Tests: its own pick, then closed), the sinusoid (back to the lobule), a structure's card, and last a talk. The Treat card comes BEFORE the Tests card (2D:
// `treatOpen()` is asked before `dock.close()`), so with both up the first Esc puts Treat away, as the owner's Mac play-test (19 Nov) expects.
export type EscStep = 'dialog' | 'sheet' | 'tests-focus' | 'treat' | 'tests' | 'sinusoid' | 'selection' | 'talk' | null;

export interface EscState {
  dialog: boolean; sheet: boolean; testsOpen: boolean; testsFocus: boolean; treatOpen: boolean; sinusoid: boolean; selection: boolean; talk: boolean;
  /** what is up of `sheet` (the menus' slot, or History, Compare and Why with their own flags) is a panel, not a menu */
  sheetPanel?: boolean;
  /** the newest open panel of the right column (surface/wire.ts usePanelOrder): with two up, Esc closes the newest first ('sheet' is a panel in the menus' slot) */
  newest?: 'sheet' | 'treat' | 'tests' | null;
}

export function escStep(s: EscState): EscStep {
  if (s.dialog) return 'dialog';
  if (s.sheet && !s.sheetPanel) return 'sheet';
  if (s.testsOpen && s.testsFocus) return 'tests-focus';
  // (two panels side by side: the newest goes first)
  if (s.newest === 'sheet' && s.sheet) return 'sheet';
  if (s.newest === 'treat' && s.treatOpen) return 'treat';
  if (s.newest === 'tests' && s.testsOpen) return 'tests';
  if (s.sheet) return 'sheet';
  if (s.treatOpen) return 'treat';
  if (s.testsOpen) return 'tests';
  if (s.selection) return 'selection';   // (2D: the sinusoid backs out only when nothing is selected)
  if (s.sinusoid) return 'sinusoid';
  if (s.talk) return 'talk';
  return null;
}
