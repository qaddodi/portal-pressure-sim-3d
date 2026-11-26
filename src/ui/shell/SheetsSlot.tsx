// Where the shell mounts the sheets (the chunk itself: ui/shell/sheets-load.ts). Nothing here is on screen until a person opens it, so it comes in behind the first picture: when the cover has lifted
// and the page is quiet (the ladder's slot), or at once on the first touch, key or open sheet (a person never waits on a closed door). Save-Data pages read it on that first use only.
import { createElement, useEffect, useState } from 'react';
import { sheetsPart, loadSheets } from './sheets-load.ts';
import { useShell } from './store.ts';
import { useSelection } from '../action/selection.ts';
import { useDialogs } from '../deck/dialogs.ts';
import { useGuard } from '../case/guard.ts';
import { lowData } from '../../boot/data-saver.ts';
import { quietSlot } from '../../boot/warm.ts';

/** Whether anything the sheets draw is asked for: a sheet or a dialog named in the shell's state (a deep link, a key), a structure selected (its action card), a deck dialog, the case's guard. */
const asked = (): boolean => { const s = useShell.getState(); return !!s.sheet || !!s.dialog || !!useSelection.getState().sel || !!useDialogs.getState().dialog || !!useGuard.getState().ask; };

export function SheetsSlot() {
  const [Ready, set] = useState(sheetsPart.get);
  useEffect(() => {
    if (Ready) return;
    let live = true;
    const go = (): void => { void loadSheets().then((ok) => { if (live && ok) set(() => sheetsPart.get()); }); };
    if (asked()) go();
    const ask = (): void => { if (asked()) go(); };
    const offs = [useShell.subscribe(ask), useSelection.subscribe(ask), useDialogs.subscribe(ask), useGuard.subscribe(ask)];
    const input = (): void => go();
    const events = ['pointerdown', 'keydown', 'touchstart'] as const;
    for (const e of events) addEventListener(e, input, { capture: true, passive: true, once: true });
    if (!lowData()) quietSlot(go);
    return () => { live = false; for (const off of offs) off(); for (const e of events) removeEventListener(e, input, { capture: true }); };
  }, [Ready]);
  return Ready ? createElement(Ready) : null;
}
