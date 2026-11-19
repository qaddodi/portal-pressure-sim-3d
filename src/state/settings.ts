// Viewer settings, kept in localStorage (a convenience, never needed to run): the look, the flow-mark style the scene switches on, and the 2D app's
// Settings rows (Display: Blur effect, Figure detail, Sharp while moving, Keyboard shortcuts; Diagnostics: frame rate, frame breakdown).
import { create } from 'zustand';
import { LOOK_IDS, type LookChoice } from '../looks/looks.ts';

/** Flow-mark styles A to D (the owner picks one after trying them; the scene reads this to switch). */
export type FlowMarks = 'A' | 'B' | 'C' | 'D';
export const FLOW_MARKS: readonly FlowMarks[] = ['A', 'B', 'C', 'D'];

/** Settings › Figure detail: the figure's pixel-ratio cap (parity plan section 6: the 2D megapixel steps become 1x, 1.5x and 2x). Names follow the 2D app's words
 *  (fig-detail-words.js): Standard is the default, one step below is Soft, one above Sharp. */
export const FIGURE_DETAIL = [{ name: 'Soft', dpr: 1 }, { name: 'Standard', dpr: 1.5 }, { name: 'Sharp', dpr: 2 }] as const;
export const FIGURE_DETAIL_DEFAULT = 1;

export interface Settings {
  look: LookChoice;
  flowMarks: FlowMarks;
  /** Blur effect: frosted glass on cards and labels (the 3D cards are Soft lift today; the switch is kept and stored). */
  blur: boolean;
  /** index into FIGURE_DETAIL */
  figureDetail: number;
  sharpMoving: boolean;
  /** Keyboard shortcuts: single keys on (WCAG 2.1.4). Off leaves Esc and Ctrl or Cmd with a key. */
  keys: boolean;
  showFps: boolean;
  showBreakdown: boolean;
}
interface Store extends Settings {
  setLook(l: LookChoice): void; setFlowMarks(f: FlowMarks): void;
  set<K extends keyof Settings>(key: K, value: Settings[K]): void;
  reset(): void;
}

const KEY = 'pps3d.settings.v1';
/** Everything this app stores on the device starts with this, so Reset everything can clear it and nothing else. */
export const STORAGE_PREFIX = 'pps3d.';
const isPhoneScreen = (): boolean => { try { return Math.min(innerWidth, innerHeight) < 600; } catch { return false; } };
export const DEFAULTS: Settings = { look: 'system', flowMarks: 'A', blur: true, figureDetail: FIGURE_DETAIL_DEFAULT, sharpMoving: true, keys: true, showFps: false, showBreakdown: false };

const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
export function parseSettings(raw: string | null, phone = false): Settings {
  try {
    const o = raw ? JSON.parse(raw) : {};
    return {
      look: o.look === 'system' || LOOK_IDS.includes(o.look) ? o.look : DEFAULTS.look,
      flowMarks: FLOW_MARKS.includes(o.flowMarks) ? o.flowMarks : DEFAULTS.flowMarks,
      // (Parity plan section 6: glass is off by default on an iPhone, where it costs the most; a chosen value always wins.)
      blur: bool(o.blur, !phone),
      figureDetail: Number.isInteger(o.figureDetail) && o.figureDetail >= 0 && o.figureDetail < FIGURE_DETAIL.length ? o.figureDetail : DEFAULTS.figureDetail,
      sharpMoving: bool(o.sharpMoving, DEFAULTS.sharpMoving), keys: bool(o.keys, true), showFps: bool(o.showFps, false), showBreakdown: bool(o.showBreakdown, false),
    };
  } catch { return { ...DEFAULTS, blur: !phone }; }
}
const read = (): Settings => { try { return parseSettings(localStorage.getItem(KEY), isPhoneScreen()); } catch { return parseSettings(null, isPhoneScreen()); } };
const pick = (s: Settings): Settings => ({ look: s.look, flowMarks: s.flowMarks, blur: s.blur, figureDetail: s.figureDetail, sharpMoving: s.sharpMoving, keys: s.keys, showFps: s.showFps, showBreakdown: s.showBreakdown });
const save = (s: Settings) => { try { localStorage.setItem(KEY, JSON.stringify(pick(s))); } catch { /* private window: the choice lasts for this visit */ } };

export const useSettings = create<Store>((set, get) => ({
  ...read(),
  setLook: (look) => { set({ look }); save({ ...get(), look }); },
  setFlowMarks: (flowMarks) => { set({ flowMarks }); save({ ...get(), flowMarks }); },
  set: (key, value) => { set({ [key]: value } as Pick<Settings, typeof key>); save({ ...get(), [key]: value }); },
  reset: () => { const d = parseSettings(null, isPhoneScreen()); set(d); save(d); },
}));
