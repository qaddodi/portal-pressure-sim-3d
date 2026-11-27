// A press outside a shell sheet closes it: the menus' one rule (surface/outside.ts) on the shell's open sheet. The popover that stood here (`Anchored`) is the menu shell now (surface/Menu.tsx).
import { useShell, type Sheet } from './store.ts';
import { useOutsidePress } from '../surface/outside.ts';

/** Closes the open sheet when a press lands outside it and outside the control that opened it. A press on the opener is the opener's own business (it toggles). */
export function useOutside(sheet: Exclude<Sheet, null>, ref: React.RefObject<HTMLElement | null>) {
  const open = useShell((s) => s.sheet === sheet);
  // (the listener runs in the capture phase, before the scrim's own: the press is recorded by closeByPress here, or the opener's click reopens the sheet it just closed)
  useOutsidePress(open, [ref], () => useShell.getState().closeByPress(), `[data-opens="${sheet}"]`);
  return open;
}
