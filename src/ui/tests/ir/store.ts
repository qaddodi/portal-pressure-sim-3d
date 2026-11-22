// The IR pane's view: Measure (the HVPG, its Watch row, the PPG by IR) or TIPS (the stent's own test, 2D ir-tips.js), and which stent the TIPS view is on. `openStent` is the way in a stent
// card's "Test TIPS in IR" takes (2D: dock.pane('hvpg').openStent(id)); false when the patient has no such stent.
import { create } from 'zustand';
import { shownParams } from '../../../engine/index.ts';
import { stentIds } from './copied/tips-parts.copied.js';

export type IrView = 'measure' | 'tips';
export type StentId = 'TIPS' | 'DIPS';
/** The TIPS view's lens (what colours the stent) and the view behind its menu: the stent itself, Tube vs patient, Compare (2D ir-tips.js lens, sub). */
export type IrLens = 'velocity' | 'pressure';
export type IrSub = 'inside' | 'curves' | 'compare';
interface IrState { view: IrView; stent: StentId; lens: IrLens; sub: IrSub; setView(v: IrView): void; pick(id: StentId): void; setLens(l: IrLens): void; setSub(s: IrSub): void; openStent(id: string): boolean }

/** The stents this patient has, in the order the view names them (the TIPS, then the DIPS). */
export const stentsNow = (): StentId[] => stentIds(shownParams() as never, []) as StentId[];

export const useIr = create<IrState>((set) => ({
  view: 'measure', stent: 'TIPS', lens: 'velocity', sub: 'inside',
  setView: (view) => set({ view }),
  pick: (stent) => set({ stent }),
  setLens: (lens) => set({ lens }),
  setSub: (sub) => set({ sub }),
  openStent: (id) => {
    if (id !== 'TIPS' && id !== 'DIPS') return false;
    if (!stentsNow().includes(id)) return false;
    set({ view: 'tips', stent: id, sub: 'inside' });
    return true;
  },
}));
