// Viewer settings: the look, and the flow-mark style the scene switches on. Kept in localStorage (a convenience, never needed to run).
import { create } from 'zustand';
import { LOOK_IDS, type LookChoice } from '../looks/looks.ts';

/** Flow-mark styles A to D (the owner picks one after trying them; the scene reads this to switch). */
export type FlowMarks = 'A' | 'B' | 'C' | 'D';
export const FLOW_MARKS: readonly FlowMarks[] = ['A', 'B', 'C', 'D'];

/** `blur`: the frosted glass under cards, the pill, the strip and menus (Settings > Blur effect). On by default on every device, as in the 2D app; off is the solid look. */
export interface Settings { look: LookChoice; flowMarks: FlowMarks; blur: boolean }
interface Store extends Settings { setLook(l: LookChoice): void; setFlowMarks(f: FlowMarks): void; setBlur(on: boolean): void }

const KEY = 'pps3d.settings.v1';
export const DEFAULTS: Settings = { look: 'system', flowMarks: 'A', blur: true };

export function parseSettings(raw: string | null): Settings {
  try {
    const o = raw ? JSON.parse(raw) : {};
    return {
      look: o.look === 'system' || LOOK_IDS.includes(o.look) ? o.look : DEFAULTS.look,
      flowMarks: FLOW_MARKS.includes(o.flowMarks) ? o.flowMarks : DEFAULTS.flowMarks,
      blur: typeof o.blur === 'boolean' ? o.blur : DEFAULTS.blur,
    };
  } catch { return { ...DEFAULTS }; }
}
const load = (): Settings => { try { return parseSettings(localStorage.getItem(KEY)); } catch { return { ...DEFAULTS }; } };
const save = (s: Settings) => { try { localStorage.setItem(KEY, JSON.stringify({ look: s.look, flowMarks: s.flowMarks, blur: s.blur })); } catch { /* private window: the choice lasts for this visit */ } };

export const useSettings = create<Store>((set, get) => ({
  ...load(),
  setLook: (look) => { set({ look }); save({ ...get(), look }); },
  setFlowMarks: (flowMarks) => { set({ flowMarks }); save({ ...get(), flowMarks }); },
  setBlur: (blur) => { set({ blur }); save({ ...get(), blur }); },
}));

/** Blur off is the page's solid look: html[data-noglass] (the stylesheet draws no glass under it). Written before anything paints, then on every change. */
export function applyGlass(on: boolean, root: HTMLElement = document.documentElement): void {
  if (on) root.removeAttribute('data-noglass'); else root.setAttribute('data-noglass', '');
}
