// Viewer settings: the look, and the flow-mark style the scene switches on. Kept in localStorage (a convenience, never needed to run).
import { create } from 'zustand';
import { LOOK_IDS, type LookChoice } from '../looks/looks.ts';

/** Flow-mark styles A to D (the owner picks one after trying them; the scene reads this to switch). */
export type FlowMarks = 'A' | 'B' | 'C' | 'D';
export const FLOW_MARKS: readonly FlowMarks[] = ['A', 'B', 'C', 'D'];

export interface Settings { look: LookChoice; flowMarks: FlowMarks }
interface Store extends Settings { setLook(l: LookChoice): void; setFlowMarks(f: FlowMarks): void }

const KEY = 'pps3d.settings.v1';
export const DEFAULTS: Settings = { look: 'system', flowMarks: 'A' };

export function parseSettings(raw: string | null): Settings {
  try {
    const o = raw ? JSON.parse(raw) : {};
    return {
      look: o.look === 'system' || LOOK_IDS.includes(o.look) ? o.look : DEFAULTS.look,
      flowMarks: FLOW_MARKS.includes(o.flowMarks) ? o.flowMarks : DEFAULTS.flowMarks,
    };
  } catch { return { ...DEFAULTS }; }
}
const load = (): Settings => { try { return parseSettings(localStorage.getItem(KEY)); } catch { return { ...DEFAULTS }; } };
const save = (s: Settings) => { try { localStorage.setItem(KEY, JSON.stringify({ look: s.look, flowMarks: s.flowMarks })); } catch { /* private window: the choice lasts for this visit */ } };

export const useSettings = create<Store>((set, get) => ({
  ...load(),
  setLook: (look) => { set({ look }); save({ ...get(), look }); },
  setFlowMarks: (flowMarks) => { set({ flowMarks }); save({ ...get(), flowMarks }); },
}));
