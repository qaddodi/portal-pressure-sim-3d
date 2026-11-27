// The slot table (slots.ts) wired to the stores that hold each panel's open state. Started once with the actions (action/boot.ts). When a panel comes up, the table says which
// open panels it puts away, and each is closed through its own store, exactly as its X would close it.
// Stage 2 of the menu unification moves History, Compare, Why and the timeline chart out of useShell.sheet (the menus' one slot) into this registry; until then they are read
// from it here.
import { useShell } from '../shell/store.ts';
import { useTreat } from '../treat/store.ts';
import { useTests } from '../tests/store.ts';
import { useSelection, selectStructure } from '../action/selection.ts';
import { surfaceModeNow } from './mode.ts';
import { putsAway, SLOT_PANELS, type SlotPanel } from './slots.ts';

const SHELL_PANELS: ReadonlySet<string> = new Set(['history', 'compare', 'why', 'timeline']);

/** Each slot panel's open state and its close, read when they are needed. */
export const PANEL_STATE: Record<SlotPanel, { open(): boolean; close(): void }> = {
  tests: { open: () => useTests.getState().open, close: () => useTests.getState().close() },
  treat: { open: () => useTreat.getState().open, close: () => useTreat.getState().setOpen(false) },
  action: { open: () => !!useSelection.getState().sel, close: () => selectStructure(null) },
  history: { open: () => useShell.getState().sheet === 'history', close: () => { if (useShell.getState().sheet === 'history') useShell.getState().close(); } },
  compare: { open: () => useShell.getState().sheet === 'compare', close: () => { if (useShell.getState().sheet === 'compare') useShell.getState().close(); } },
  why: { open: () => useShell.getState().sheet === 'why', close: () => { if (useShell.getState().sheet === 'why') useShell.getState().close(); } },
  timeline: { open: () => useShell.getState().sheet === 'timeline', close: () => { if (useShell.getState().sheet === 'timeline') useShell.getState().close(); } },
};

/** What is open now, of the slot panels. */
export const openPanels = (): SlotPanel[] => SLOT_PANELS.filter((p) => PANEL_STATE[p].open());

/** A panel came up: put away what the table says. */
export function panelOpened(p: SlotPanel): void {
  for (const q of putsAway(p, openPanels(), surfaceModeNow())) PANEL_STATE[q].close();
}

/** Wires the table to the stores; returns the remover. */
export function startSlots(): () => void {
  const offs = [
    useTests.subscribe((s, prev) => { if (s.open && !prev.open) panelOpened('tests'); }),
    useTreat.subscribe((s, prev) => { if (s.open && !prev.open) panelOpened('treat'); }),
    useSelection.subscribe((s, prev) => { if (s.sel && !prev.sel) panelOpened('action'); }),
    useShell.subscribe((s, prev) => { if (s.sheet && s.sheet !== prev.sheet && SHELL_PANELS.has(s.sheet)) panelOpened(s.sheet as SlotPanel); }),
  ];
  return () => { for (const o of offs) o(); };
}
