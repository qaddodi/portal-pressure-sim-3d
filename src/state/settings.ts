// Viewer settings, kept in localStorage (a convenience, never needed to run): the look and the 2D app's
// Settings rows (Display: Blur effect, Figure detail, Sharp while moving, Keyboard shortcuts; Diagnostics: frame rate, frame breakdown).
import { create } from 'zustand';
import { LOOK_IDS, type LookChoice } from '../looks/looks.ts';

/** Settings › Figure detail: the figure's pixel-ratio cap (parity plan section 6: the 2D megapixel steps become 1x, 1.5x and 2x). Names follow the 2D app's words
 *  (fig-detail-words.js): Standard is the default, one step below is Soft, one above Sharp. */
export const FIGURE_DETAIL = [{ name: 'Soft', dpr: 1 }, { name: 'Standard', dpr: 1.5 }, { name: 'Sharp', dpr: 2 }] as const;
export const FIGURE_DETAIL_DEFAULT = 1;

export interface Settings {
  look: LookChoice;
  /** True once the viewer picked a look in Settings: until then the app follows the device (System), as the 2D app does with no saved look (looks.js: a missing pps.theme is System): dark on a dark device, light on a light one. */
  lookChosen: boolean;
  /** Blur effect: the frosted glass under cards, the pill, the strip and menus. On by default on every device, as in the 2D app; off is the solid look (html[data-noglass]). */
  blur: boolean;
  /** index into FIGURE_DETAIL */
  figureDetail: number;
  sharpMoving: boolean;
  /** Auto detail (3D only): the figure lowers its own detail below the Figure detail step while frames run slow, and brings it back when they settle (scene/detail-governor.ts). Off: the step is held. */
  autoDetail: boolean;
  /** Keyboard shortcuts: single keys on (WCAG 2.1.4). Off leaves Esc and Ctrl or Cmd with a key. */
  keys: boolean;
  showFps: boolean;
  showBreakdown: boolean;
  /** Figure depth (3D only, a deliberate step beyond 2D; Settings › Figure depth). Each is its own switch so the owner can compare with 2D: see DEPTH_KEYS. */
  organDepth: boolean;
  tilt: boolean;
  dof: boolean;
  particles: boolean;
  /** Hide vessels behind organs: off (default) shows the IVC and the lumbar vein faint through the liver; on, the organs hide them where they are in front (normal occlusion), and naming one still reveals it. */
  hideBehind: boolean;
  /** Living fluid: the ascites pool's soft wall edges, climbing meniscus, slosh, pale rim and deeper amber (ascites.ts). Off: the pool as 2D draws it (hard wall edges, flat tint); the surface ripple is 2D's and stays. */
  fluidSurface: boolean;
  /** Device shadows: a soft contact shadow under every catheter, balloon tube, stent sleeve and scope, on what lies beneath it (devices/contact-shadow.ts). Off: the devices as 2D draws them, with none. */
  deviceShadow: boolean;
}
interface Store extends Settings {
  setLook(l: LookChoice): void; setBlur(on: boolean): void;
  set<K extends keyof Settings>(key: K, value: Settings[K]): void;
  reset(): void;
}

const KEY = 'pps3d.settings.v1';
/** The Figure depth switches and Organ fill are saved with this version. Every Settings change saves ALL the settings, so a phone that changed its look while See-through was still the default
 *  stored 'seethrough' as if it had been chosen (20 Nov 2026: "still glass" on an iPhone while the Mac was cel). A saved figure choice older than this is dropped and the defaults apply; raise it
 *  when a default changes. */
export const FIGURE_SETTINGS_VERSION = 4;   // (4: the blood streaks default on; a save made before this carries the old default, so the figure switches are taken afresh once)
/** Everything this app stores on the device starts with this, so Reset everything can clear it and nothing else. */
export const STORAGE_PREFIX = 'pps3d.';
/** The "Figure depth" switches (owner, 19 Nov 2026: "Yes do all properly"): a deliberate exception to match-2D, each behind its own switch. All on by default except Free tilt (the 3D lobule and sinusoid are no longer a switch: everything is 3D, Mohammad 20 Nov 2026); the blood streaks went on by default on 20 Nov (play-test: "no laminar streak lanes are visible": the switch was off, so only the chevrons showed). */
export const DEPTH_KEYS = ['organDepth', 'tilt', 'dof', 'particles', 'hideBehind', 'fluidSurface', 'deviceShadow'] as const;
export type DepthKey = (typeof DEPTH_KEYS)[number];
export const DEPTH_DEFAULTS: Record<DepthKey, boolean> = { organDepth: true, tilt: true, dof: true, particles: true, hideBehind: false, fluidSurface: true, deviceShadow: true };
export const DEFAULTS: Settings = { look: 'system', lookChosen: false, blur: true, figureDetail: FIGURE_DETAIL_DEFAULT, sharpMoving: true, autoDetail: true, keys: true, showFps: false, showBreakdown: false, ...DEPTH_DEFAULTS };

const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
export function parseSettings(raw: string | null): Settings {
  try {
    const o = raw ? JSON.parse(raw) : {};
    const fig = o.figureV === FIGURE_SETTINGS_VERSION ? o : {};   // (an older save never chose the figure switches: the defaults)
    return {
      look: o.lookChosen === true && (o.look === 'system' || LOOK_IDS.includes(o.look)) ? o.look : DEFAULTS.look,
      lookChosen: o.lookChosen === true && (o.look === 'system' || LOOK_IDS.includes(o.look)),
      blur: bool(o.blur, DEFAULTS.blur),
      figureDetail: Number.isInteger(o.figureDetail) && o.figureDetail >= 0 && o.figureDetail < FIGURE_DETAIL.length ? o.figureDetail : DEFAULTS.figureDetail,
      sharpMoving: bool(o.sharpMoving, DEFAULTS.sharpMoving), autoDetail: bool(o.autoDetail, DEFAULTS.autoDetail), keys: bool(o.keys, true), showFps: bool(o.showFps, false), showBreakdown: bool(o.showBreakdown, false),
      organDepth: bool(fig.organDepth, DEPTH_DEFAULTS.organDepth), tilt: bool(fig.tilt, DEPTH_DEFAULTS.tilt), dof: bool(fig.dof, DEPTH_DEFAULTS.dof), particles: bool(fig.particles, DEPTH_DEFAULTS.particles), hideBehind: bool(fig.hideBehind, DEPTH_DEFAULTS.hideBehind), fluidSurface: bool(fig.fluidSurface, DEPTH_DEFAULTS.fluidSurface), deviceShadow: bool(fig.deviceShadow, DEPTH_DEFAULTS.deviceShadow),
    };
  } catch { return { ...DEFAULTS }; }
}
const read = (): Settings => { try { return parseSettings(localStorage.getItem(KEY)); } catch { return parseSettings(null); } };
const pick = (s: Settings): Settings => ({ look: s.look, lookChosen: s.lookChosen, blur: s.blur, figureDetail: s.figureDetail, sharpMoving: s.sharpMoving, autoDetail: s.autoDetail, keys: s.keys, showFps: s.showFps, showBreakdown: s.showBreakdown, organDepth: s.organDepth, tilt: s.tilt, dof: s.dof, particles: s.particles, hideBehind: s.hideBehind, fluidSurface: s.fluidSurface, deviceShadow: s.deviceShadow });
const save = (s: Settings) => { try { localStorage.setItem(KEY, JSON.stringify({ ...pick(s), figureV: FIGURE_SETTINGS_VERSION })); } catch { /* private window: the choice lasts for this visit */ } };

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
