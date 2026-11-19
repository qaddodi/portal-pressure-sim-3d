// The Tests card's own state: whether it is up, which instrument it shows, the FibroScan's organ. Remembered on this device as the 2D app remembers
// `pps.instruments` (the instrument left open comes back). Nothing here is per-frame.
import { create } from 'zustand';
import { STORAGE_PREFIX } from '../../state/settings.ts';
import type { PaneId } from './panes.ts';
import { PANES } from './panes.ts';

const KEY = `${STORAGE_PREFIX}tests.v1`;
interface Saved { pane?: PaneId }
function load(): Saved { try { const o = JSON.parse(localStorage.getItem(KEY) || '{}') as Saved; return o && typeof o === 'object' ? o : {}; } catch { return {}; } }
function save(s: Saved) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ } }

export type FibroOrgan = 'liver' | 'spleen';

interface TestsState {
  open: boolean;
  /** the instrument on show (the Pressure tab holds two: 'profile' and 'scope', Over time) */
  pane: PaneId;
  fibro: FibroOrgan;
  show(id: PaneId): void;
  toggle(): void;
  close(): void;
  setFibro(o: FibroOrgan): void;
}

const saved = load();
export const useTests = create<TestsState>((set, get) => ({
  open: false,
  pane: saved.pane && PANES[saved.pane] ? saved.pane : 'profile',
  fibro: 'liver',
  show: (id) => { if (!PANES[id]) return; set({ open: true, pane: id }); save({ pane: id }); },
  toggle: () => { if (get().open) set({ open: false }); else set({ open: true }); },
  close: () => set({ open: false }),
  setFibro: (o) => set({ fibro: o }),
}));
