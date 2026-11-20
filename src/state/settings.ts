// Viewer settings, kept in localStorage (a convenience, never needed to run): the look and the 2D app's
// Settings rows (Display: Blur effect, Figure detail, Sharp while moving, Keyboard shortcuts; Diagnostics: frame rate, frame breakdown).
import { create } from 'zustand';
import { LOOK_IDS, type LookChoice } from '../looks/looks.ts';

/** Settings › Figure detail: the figure's pixel-ratio cap (parity plan section 6: the 2D megapixel steps become 1x, 1.5x and 2x). Names follow the 2D app's words
 *  (fig-detail-words.js): Standard is the default, one step below is Soft, one above Sharp. */
export const FIGURE_DETAIL = [{ name: 'Soft', dpr: 1 }, { name: 'Standard', dpr: 1.5 }, { name: 'Sharp', dpr: 2 }] as const;
export const FIGURE_DETAIL_DEFAULT = 1;

export const ORGAN_FILLS = ['solid', 'seethrough'] as const;
export type OrganFill = (typeof ORGAN_FILLS)[number];
export const ORGAN_FILL_DEFAULT: OrganFill = 'solid';

export interface Settings {
  look: LookChoice;
  /** True once the viewer picked a look in Settings: until then the app opens on Light, as the 2D app's first screen does (a stored "System" the viewer never chose is not a choice). */
  lookChosen: boolean;
  /** Blur effect: the frosted glass under cards, the pill, the strip and menus. On by default on every device, as in the 2D app; off is the solid look (html[data-noglass]). */
  blur: boolean;
  /** index into FIGURE_DETAIL */
  figureDetail: number;
  sharpMoving: boolean;
  /** Keyboard shortcuts: single keys on (WCAG 2.1.4). Off leaves Esc and Ctrl or Cmd with a key. */
  keys: boolean;
  showFps: boolean;
  showBreakdown: boolean;
  /** Figure depth (3D only, a deliberate step beyond 2D; Settings › Figure depth). Each is its own switch so the owner can compare with 2D: see DEPTH_KEYS. */
  smoothJoins: boolean;
  organDepth: boolean;
  tilt: boolean;
  dof: boolean;
  particles: boolean;
  /** Organ fill (3D only): solid cel-shaded organs (the default since 20 Nov: "I want the organs to be cell shaded") or the see-through wash (adopted 19 Nov, kept as the alternative); solid is (opaque, the page colour pre-mixed, 2D-style 3-tone shade). Mohammad: "It really depends on how it's gonna look". */
  organFill: OrganFill;
}
interface Store extends Settings {
  setLook(l: LookChoice): void; setBlur(on: boolean): void;
  set<K extends keyof Settings>(key: K, value: Settings[K]): void;
  reset(): void;
}

const KEY = 'pps3d.settings.v1';
/** Everything this app stores on the device starts with this, so Reset everything can clear it and nothing else. */
export const STORAGE_PREFIX = 'pps3d.';
/** The five "Figure depth" switches (owner, 19 Nov 2026: "Yes do all properly"): a deliberate exception to match-2D, each behind its own switch. All on by default, except blood-cell particles (chevrons stay the flow mark). */
export const DEPTH_KEYS = ['smoothJoins', 'organDepth', 'tilt', 'dof', 'particles'] as const;
export type DepthKey = (typeof DEPTH_KEYS)[number];
export const DEPTH_DEFAULTS: Record<DepthKey, boolean> = { smoothJoins: true, organDepth: true, tilt: true, dof: true, particles: false };
export const DEFAULTS: Settings = { look: 'light', lookChosen: false, blur: true, figureDetail: FIGURE_DETAIL_DEFAULT, sharpMoving: true, keys: true, showFps: false, showBreakdown: false, ...DEPTH_DEFAULTS, organFill: ORGAN_FILL_DEFAULT };

const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
export function parseSettings(raw: string | null): Settings {
  try {
    const o = raw ? JSON.parse(raw) : {};
    return {
      look: o.lookChosen === true && (o.look === 'system' || LOOK_IDS.includes(o.look)) ? o.look : DEFAULTS.look,
      lookChosen: o.lookChosen === true && (o.look === 'system' || LOOK_IDS.includes(o.look)),
      blur: bool(o.blur, DEFAULTS.blur),
      figureDetail: Number.isInteger(o.figureDetail) && o.figureDetail >= 0 && o.figureDetail < FIGURE_DETAIL.length ? o.figureDetail : DEFAULTS.figureDetail,
      sharpMoving: bool(o.sharpMoving, DEFAULTS.sharpMoving), keys: bool(o.keys, true), showFps: bool(o.showFps, false), showBreakdown: bool(o.showBreakdown, false),
      smoothJoins: bool(o.smoothJoins, DEPTH_DEFAULTS.smoothJoins), organDepth: bool(o.organDepth, DEPTH_DEFAULTS.organDepth), tilt: bool(o.tilt, DEPTH_DEFAULTS.tilt), dof: bool(o.dof, DEPTH_DEFAULTS.dof), particles: bool(o.particles, DEPTH_DEFAULTS.particles),
      organFill: (ORGAN_FILLS as readonly unknown[]).includes(o.organFill) ? o.organFill : ORGAN_FILL_DEFAULT,
    };
  } catch { return { ...DEFAULTS }; }
}
const read = (): Settings => { try { return parseSettings(localStorage.getItem(KEY)); } catch { return parseSettings(null); } };
const pick = (s: Settings): Settings => ({ look: s.look, lookChosen: s.lookChosen, blur: s.blur, figureDetail: s.figureDetail, sharpMoving: s.sharpMoving, keys: s.keys, showFps: s.showFps, showBreakdown: s.showBreakdown, smoothJoins: s.smoothJoins, organDepth: s.organDepth, tilt: s.tilt, dof: s.dof, particles: s.particles, organFill: s.organFill });
const save = (s: Settings) => { try { localStorage.setItem(KEY, JSON.stringify(pick(s))); } catch { /* private window: the choice lasts for this visit */ } };

export const useSettings = create<Store>((set, get) => ({
  ...read(),
  setLook: (look) => { set({ look, lookChosen: true }); save({ ...get(), look, lookChosen: true }); },
  setBlur: (blur) => { set({ blur }); save({ ...get(), blur }); },
  set: (key, value) => { set({ [key]: value } as Pick<Settings, typeof key>); save({ ...get(), [key]: value }); },
  reset: () => { const d = parseSettings(null); set(d); save(d); },
}));

/** Blur off is the page's solid look: html[data-noglass] (the stylesheet draws no glass under it). Written before anything paints, then on every change. */
export function applyGlass(on: boolean, root: HTMLElement = document.documentElement): void {
  if (on) root.removeAttribute('data-noglass'); else root.setAttribute('data-noglass', '');
}
