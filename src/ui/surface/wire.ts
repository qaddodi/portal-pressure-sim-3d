// The slot table (slots.ts) wired to the stores that hold each panel's open state. Started once with the actions (action/boot.ts). It keeps the order the panels came up in
// (usePanelOrder, oldest first); when a panel comes up, the table says which open panels it puts away, and each is closed through its own store, exactly as its X would close it.
// The order is what the right column places its panels by (useColumnStep: the first keeps the right edge, panel-place.ts columnSteps) and what Esc closes first (the newest,
// keys/escape.ts); a panel opened again while it is open keeps its place in it.
// A later stage moves History, Compare, Why and the timeline chart out of useShell.sheet (the menus' one slot) into this registry; until then they are read from it here.
import { useShell } from '../shell/store.ts';
import { useTreat } from '../treat/store.ts';
import { useTests } from '../tests/store.ts';
import { useSelection, selectStructure } from '../action/selection.ts';
import { useUi } from '../ui-store.ts';
import { surfaceModeNow, useSurfaceMode } from './mode.ts';
import { putsAway, SLOT_PANELS, type ColumnFits, type SlotPanel } from './slots.ts';
import { create } from 'zustand';
import { columnSteps, columnWidth, fitsTogether, panelBand } from './panel-place.ts';
import { testsPlace } from '../tests/place.ts';
import type { PanelId } from './kinds.ts';

/** The open panels in the order they came up, oldest first. */
export const usePanelOrder = create<{ order: readonly SlotPanel[] }>(() => ({ order: [] }));
export const panelOrder = (): readonly SlotPanel[] => usePanelOrder.getState().order;

const SHELL_PANELS: ReadonlySet<string> = new Set(['history', 'compare', 'why', 'timeline']);

const shellPanel = (id: SlotPanel) => ({
  open: () => useShell.getState().sheet === id,
  close: () => { if (useShell.getState().sheet === id) useShell.getState().close(); },
});

/** Each slot panel's open state and its close, read when they are needed. */
export const PANEL_STATE: Record<SlotPanel, { open(): boolean; close(): void }> = {
  tests: { open: () => useTests.getState().open, close: () => useTests.getState().close() },
  treat: { open: () => useTreat.getState().open, close: () => useTreat.getState().setOpen(false) },
  action: { open: () => !!useSelection.getState().sel, close: () => selectStructure(null) },
  history: shellPanel('history'), compare: shellPanel('compare'), why: shellPanel('why'), timeline: shellPanel('timeline'),
};

/** A panel coming up puts an open menu away (it was chosen from), never a panel standing in the menus' slot (History, Compare, Why, the chart): those are the slot table's. */
export function closeMenu(): void {
  const sh = useShell.getState();
  if (sh.sheet && !SHELL_PANELS.has(sh.sheet)) sh.close();
}

/** What is open now, of the slot panels (in the table's order; usePanelOrder has them in the order they came up). */
export const openPanels = (): SlotPanel[] => SLOT_PANELS.filter((p) => PANEL_STATE[p].open());

/** Whether these right-column panels stand side by side on the screen now: Tests at its own width, the rest at the standard, the figure keeping its room (panel-place.ts). */
export const fitsNow = (leftOpen: boolean): ColumnFits => (column) => {
  const { vp, device } = useUi.getState(), t = useTests.getState();
  const testsW = testsPlace(vp, device, { widthPx: t.widthPx }).rect.w;
  return fitsTogether(vp, device, column.map((p) => columnWidth(p, vp, device, testsW)), leftOpen);
};

let busy = false, again = false;
/** Brings the order in line with what is open: what closed leaves it, what came up joins it at the end and puts away what the table says. */
function step(): void {
  const open = new Set(openPanels()), was = usePanelOrder.getState().order;
  let order = was.filter((p) => open.has(p));
  for (const p of SLOT_PANELS) {
    if (!open.has(p) || order.includes(p)) continue;
    const away = putsAway(p, order, surfaceModeNow(), fitsNow(order.includes('action')));
    order = [...order.filter((q) => !away.includes(q)), p];
    // (each close comes back here as a store change; it is run after this pass, `again`)
    for (const q of away) PANEL_STATE[q].close();
  }
  if (order.length !== was.length || order.some((p, i) => p !== was[i])) usePanelOrder.setState({ order });
}
/** Runs the pass, and again for the stores the pass itself changed, never inside itself. */
export function syncPanels(): void {
  if (busy) { again = true; return; }
  busy = true;
  try { do { again = false; step(); } while (again); } finally { busy = false; }
}

/** A panel came up: put away what the table says (the pass reads which one is new from the order). */
export const panelOpened = (_p: SlotPanel): void => syncPanels();

/** Wires the table to the stores; returns the remover. */
export function startSlots(): () => void {
  usePanelOrder.setState({ order: openPanels() });
  const offs = [
    useTests.subscribe((s, prev) => { if (s.open !== prev.open) syncPanels(); }),
    useTreat.subscribe((s, prev) => { if (s.open !== prev.open) syncPanels(); }),
    useSelection.subscribe((s, prev) => { if (!!s.sel !== !!prev.sel) syncPanels(); }),
    useShell.subscribe((s, prev) => { if (s.sheet !== prev.sheet && (SHELL_PANELS.has(s.sheet ?? '') || SHELL_PANELS.has(prev.sheet ?? ''))) syncPanels(); }),
  ];
  return () => { for (const o of offs) o(); usePanelOrder.setState({ order: [] }); };
}

/** px panel `id` steps left of the right column's edge: the widths of the panels opened before it in the column, each with one gap (0 for the oldest, a sheet, or a left panel). */
export function useColumnStep(id: PanelId): number {
  const order = usePanelOrder((s) => s.order);
  const vp = useUi((s) => s.vp), device = useUi((s) => s.device), widthPx = useTests((s) => s.widthPx);
  const float = useSurfaceMode() === 'float';
  if (!float || !(order as readonly string[]).includes(id)) return 0;
  const testsW = testsPlace(vp, device, { widthPx }).rect.w;
  return columnSteps(order, (p) => columnWidth(p, vp, device, testsW), panelBand(vp, device).gap)[id] ?? 0;
}
