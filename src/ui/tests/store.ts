// The Tests card's own state: whether it is up, which instrument it shows, the FibroScan's organ. Remembered on this device as the 2D app remembers
// `pps.instruments` (the instrument left open comes back). Nothing here is per-frame.
import { create } from 'zustand';
import { STORAGE_PREFIX } from '../../state/settings.ts';
import type { PaneId } from './panes.ts';
import { PANES, tabOf } from './panes.ts';

const KEY = `${STORAGE_PREFIX}tests.v1`;
interface Saved { pane?: PaneId; /** the sheet's height as a share of the stage and the sideways phone's card width in px (2D `pps.instruments` h and w) */ h?: number | null; w?: number | null }
function load(): Saved { try { const o = JSON.parse(localStorage.getItem(KEY) || '{}') as Saved; return o && typeof o === 'object' ? o : {}; } catch { return {}; } }
function save(s: Saved) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ } }

export type FibroOrgan = 'liver' | 'spleen';
/** The card's state (2D dock.js setState): open, or in focus (the instrument fills the screen: `.app.instrument-focus`; Esc takes it back to open). The folded "peek" of 2D has no road in. */
export type TestsState = 'open' | 'focus';

interface TestsStore {
  open: boolean;
  /** the instrument on show (the Pressure tab holds two: 'profile' and 'scope', Over time) */
  pane: PaneId;
  fibro: FibroOrgan;
  state: TestsState;
  /** the second instrument shown with `pane` where the card has room for two (2D `open` holds up to two); null: one */
  second: PaneId | null;
  /** waiting for a tab to be picked as the second instrument (2D `picking`: the tabs outline, a hint says so) */
  picking: boolean;
  /** the remembered sheet height (share of the stage) and sideways-phone width (px), null until the divider is used */
  heightRatio: number | null;
  widthPx: number | null;
  /** the phone's sheet: 0 Half, 1 Full (2D dock-sheet.js size); Half on every opening */
  sheetSize: 0 | 1;
  show(id: PaneId, o?: { alongside?: boolean }): void;
  toggle(): void;
  close(): void;
  setFibro(o: FibroOrgan): void;
  setState(s: TestsState): void;
  /** the "second instrument" picker (2D toggleSecond): with two up, back to one; picking, cancel; else wait for a tab */
  toggleSecond(): void;
  /** a tab picked while waiting: it becomes the second instrument (2D pickNow) */
  pickSecond(id: PaneId): void;
  endPick(): void;
  /** Esc (2D dock.js): ends a pick, else takes a focused instrument back to open, else closes the card */
  back(): void;
  setSize(o: { h?: number | null; w?: number | null }): void;
  setSheetSize(n: 0 | 1): void;
}

const saved = load();
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
export const useTests = create<TestsStore>((set, get) => {
  const remember = () => { const s = get(); save({ pane: s.pane, h: s.heightRatio, w: s.widthPx }); };
  return {
    open: false,
    pane: saved.pane && PANES[saved.pane] ? saved.pane : 'profile',
    fibro: 'liver',
    state: 'open',
    second: null,
    picking: false,
    heightRatio: num(saved.h),
    widthPx: num(saved.w),
    sheetSize: 0,
    show: (id, o) => {
      if (!PANES[id]) return;
      const s = get(), same = tabOf(id) === tabOf(s.pane);
      if (o?.alongside && s.open && !same) { set({ open: true, second: id, picking: false }); return; }
      if (s.second && tabOf(s.second) === tabOf(id) && !same) { set({ open: true, picking: false }); return; }   // (already on show as the second: nothing changes)
      // a tab shows that instrument alone (the Pressure tab keeps the view it was on: Along the circuit / Over time swap in place and keep the second one)
      set({ open: true, pane: id, picking: false, second: same ? s.second : null, sheetSize: s.open ? s.sheetSize : 0 });
      remember();
    },
    toggle: () => { if (get().open) get().close(); else set({ open: true, sheetSize: 0 }); },
    close: () => set({ open: false, picking: false, state: 'open' }),
    setFibro: (o) => set({ fibro: o }),
    setState: (state) => set({ state, picking: false }),
    toggleSecond: () => {
      const s = get();
      if (s.second) { set({ second: null, picking: false }); return; }
      set({ picking: !s.picking });
    },
    pickSecond: (id) => { const s = get(); if (!PANES[id] || tabOf(id) === tabOf(s.pane)) { set({ picking: false }); return; } set({ second: id, picking: false }); },
    back: () => { const s = get(); if (s.picking) set({ picking: false }); else if (s.state === 'focus') set({ state: 'open' }); else get().close(); },
    endPick: () => { if (get().picking) set({ picking: false }); },
    setSize: (o) => { set({ ...(o.h !== undefined ? { heightRatio: o.h } : {}), ...(o.w !== undefined ? { widthPx: o.w } : {}) }); remember(); },
    setSheetSize: (n) => set({ sheetSize: n }),
  };
});
