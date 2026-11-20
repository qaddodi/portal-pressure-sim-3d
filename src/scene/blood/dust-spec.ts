// THE DUST (Mohammad, 20 Nov: "Is there a way to implement the particle system ... hidden setting ... better looking particles on the real deal?" "Yes GPU please"): the blood's flow marks inside a lumen are the
// Dust Lab's particles (the lab: artifact KrRzNM9s11KxmZc4zhCzXA, source /mnt/project-files/streak-dust-lab). This file is the settings: the lab's own SPEC (key, label, range, step, default, group), its two picks as
// the defaults and presets, the clamp, the paste-in text and the derived numbers the shader reads. Pure (no three.js, no DOM): a node test loads it. The shader is dust-glsl.ts, the live values and their easing dust.ts,
// the hidden panel (?dust) src/ui/debug/dust-panel.ts.
//
// Units: the lab draws in its own world units with a vessel radius of 5.5, so every size and speed here is kept in those units ("lab units") and the shader turns them into shares of the lumen's radius (LAB_R).

/** The lab's vessel radius, world units: a lab size of 1.4 is 1.4 / LAB_R of the lumen's radius. */
export const LAB_R = 5.5;
/** The lab's flow speed default (px/s): the panel's Flow speed is a multiplier of the blood's own display speed, 1 at this value. */
export const LAB_SPEED = 44;

export type Group = 'Particles' | 'Colour' | 'Flow' | 'Lesions';
export type SpecRow = readonly [key: string, label: string, min: number, max: number, step: number, def: number, group: Group];

/** The lab's sliders that mean something on the real vessels (its vessel radius, outline, chevrons, tilt, zoom, scenario lesions and background are the app's own: see LAB_ONLY). Defaults are Mohammad's stenosis pick (20 Nov). */
export const DUST_SPEC: readonly SpecRow[] = [
  ['density', 'Density (full at 2400)', 100, 2400, 50, 1400, 'Particles'],
  ['size', 'Size (lab px)', 0.6, 8, 0.1, 1.5, 'Particles'], ['sizeVar', 'Size variation', 0, 0.9, 0.05, 0.35, 'Particles'],
  ['soft', 'Edge softness', 0, 1, 0.05, 0.75, 'Particles'], ['opacity', 'Opacity', 0.05, 1, 0.05, 0.7, 'Particles'], ['opVar', 'Opacity variation', 0, 0.9, 0.05, 0.5, 'Particles'],
  ['stretch', 'Dot to streak', 0, 1, 0.05, 1, 'Particles'], ['lenK', 'Streak length', 0.04, 0.5, 0.01, 0.18, 'Particles'], ['feather', 'Streak end fade', 0, 1, 0.05, 1, 'Particles'],
  ['ring', 'Dot outline', 0, 1, 0.05, 0, 'Particles'], ['twinkle', 'Twinkle', 0, 1, 0.05, 0, 'Particles'], ['depthSize', 'Nearer is bigger', 0, 1, 0.05, 0, 'Particles'], ['depthDim', 'Far side dimmer', 0, 1, 0.05, 0.5, 'Particles'],
  ['hueSpread', 'Hue spread (°)', 0, 90, 1, 40, 'Colour'], ['lightSpread', 'Lightness spread', 0, 0.6, 0.01, 0.3, 'Colour'], ['lightBias', 'Lightness bias', -0.2, 0.3, 0.01, 0.06, 'Colour'], ['satShift', 'Saturation shift', -0.3, 0.3, 0.01, 0, 'Colour'],
  ['steps', 'Tone steps (0 = smooth)', 0, 8, 1, 0, 'Colour'], ['warm', 'Warm tint when reversed', 0, 1, 0.05, 0.35, 'Colour'],
  ['speed', 'Flow speed (lab px/s; 44 = the blood\'s own)', 0, 160, 2, 44, 'Flow'], ['uMax', 'Most speed-up', 1, 8, 0.5, 5, 'Flow'], ['uMin', 'Least speed (bulbs)', 0.05, 1, 0.05, 0.25, 'Flow'],
  ['flat', 'Centre faster than walls', 0, 1, 0.05, 0.5, 'Flow'], ['radExp', 'Crowd toward the centre', 0.25, 1.4, 0.05, 0.5, 'Flow'], ['rhoMax', 'Stay off the wall', 0.3, 0.95, 0.01, 0.8, 'Flow'],
  ['turb', 'Turbulence', 0, 2, 0.05, 1, 'Lesions'], ['swirl', 'Swirl strength', 0, 3, 0.1, 1.9, 'Lesions'], ['pitch', 'Swirl pitch (lab px)', 20, 120, 1, 46, 'Lesions'], ['wobble', 'Wobble', 0, 1.5, 0.05, 0.8, 'Lesions'],
  ['turbFreq', 'Wobble frequency', 0.4, 3, 0.1, 1, 'Lesions'], ['turbSpeed', 'Wobble speed', 0, 3, 0.1, 1, 'Lesions'], ['rhoJit', 'Sideways jitter', 0, 2, 0.05, 1, 'Lesions'], ['shrink', 'Smaller in narrowings', 0, 1, 0.05, 1, 'Lesions'],
];
export const DUST_SELECTS: readonly (readonly [key: string, label: string, options: readonly (readonly [string, string])[], def: string, group: Group])[] = [
  ['colorBy', 'Colour by', [['random', 'Random'], ['speed', 'Local speed'], ['depth', 'Depth'], ['radius', 'Distance from wall'], ['source', 'Source vessel']], 'random', 'Colour'],
  ['partColor', 'Particle colour', [['auto', 'From the vessel'], ['custom', 'Custom']], 'auto', 'Colour'],
  ['vel', 'Speed follows', [['local', 'Local velocity'], ['flat', 'Flow only']], 'local', 'Flow'],
];
export const DUST_COLORS: readonly (readonly [key: string, label: string, def: string, group: Group])[] = [['partHex', 'Custom particle colour', '#9ec4ff', 'Colour']];
/** The extra, app-only control: the shader's samples per pixel (0: by the device, see DUST_BUDGET). */
export const DUST_EXTRA: readonly SpecRow[] = [['budget', 'Samples per pixel (0 = by device)', 0, 96, 4, 0, 'Particles']];
/** Keys the lab's pasted text may carry that the real app decides itself (its vessel width, outline, chevrons, camera, scenario lesions, colours, background, pulse): read and ignored, so a lab paste always applies. */
export const LAB_ONLY: ReadonlySet<string> = new Set(['scenario', 'look', 'maxN', 'pulse', 'pulseHz', 'sev', 'bulb', 'radius', 'inkW', 'chevSize', 'chevPitch', 'tiltY', 'tiltX', 'zoom', 'vessel', 'vesselHex', 'bgMode', 'bgHex', 'chevOn', 'hull', 'sourceTint']);

export type DustSettings = Record<string, number | string>;
export const DUST_NUMERIC: readonly SpecRow[] = [...DUST_SPEC, ...DUST_EXTRA];
const ROW: ReadonlyMap<string, SpecRow> = new Map(DUST_NUMERIC.map((r) => [r[0], r]));

export function dustDefaults(): DustSettings {
  const s: DustSettings = {};
  for (const r of DUST_NUMERIC) s[r[0]] = r[5];
  for (const r of DUST_SELECTS) s[r[0]] = r[3];
  for (const r of DUST_COLORS) s[r[0]] = r[2];
  return s;
}

/** Mohammad's two picks (20 Nov), each over the defaults: the stenosis velocity streaks (the default) and the varix dots. */
export const DUST_PRESETS: readonly (readonly [name: string, over: DustSettings])[] = [
  ['Velocity streaks (your stenosis pick)', {}],
  ['Dots (your varix pick)', { density: 1700, size: 1.4, sizeVar: 0.4, soft: 1, opacity: 0.75, stretch: 0.2, lenK: 0.31, feather: 0.95, ring: 0.1, depthDim: 0.2, rhoMax: 0.95 }],
  ['Fine mist', { density: 2400, size: 1.1, opacity: 0.5, soft: 0.8, sizeVar: 0.3, stretch: 0 }],
  ['Cel dots', { density: 700, size: 2.4, soft: 0.05, opacity: 1, opVar: 0, steps: 4, hueSpread: 30, lightSpread: 0.32, depthDim: 0.3, stretch: 0 }],
  ['Soft streaks', { density: 1600, size: 1.4, stretch: 0.6, lenK: 0.12, soft: 0.8, opacity: 0.7 }],
  ['Turbulent storm', { turb: 1.6, swirl: 2.6, wobble: 1.2, rhoJit: 1.6, density: 2400, stretch: 0.5, size: 1.4 }],
];

export function clampKey(key: string, v: unknown, cur: number | string | undefined): number | string | undefined {
  const r = ROW.get(key);
  if (r) { const n = typeof v === 'string' ? Number(v) : (v as number); return typeof n === 'number' && Number.isFinite(n) ? Math.min(r[3], Math.max(r[2], n)) : cur; }
  const sel = DUST_SELECTS.find((q) => q[0] === key);
  if (sel) return typeof v === 'string' && sel[2].some((o) => o[0] === v) ? v : cur;
  if (DUST_COLORS.some((q) => q[0] === key)) return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : cur;
  return undefined;
}

/** The settings the text carries (the panel's Copy text, or the lab's own JSON), clamped, over `base`; unknown keys and the lab-only ones are skipped. Throws a short message on text that is not an object. */
export function parseDust(text: string, base: DustSettings = dustDefaults()): DustSettings {
  let o: unknown;
  try { o = JSON.parse(text); } catch (e) { throw new Error(`not valid settings text: ${(e as Error).message}`); }
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('settings text must be an object like {"density": 1400}');
  const out: DustSettings = { ...base };
  for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
    if (LAB_ONLY.has(k)) continue;
    const c = clampKey(k, v, out[k]);
    if (c !== undefined) out[k] = c;
  }
  return out;
}

/** The text Copy puts on the clipboard: every key, in the lab's order, so a paste into the lab's Apply (or this panel's) reproduces it. */
export function dustText(s: DustSettings): string {
  const o: DustSettings = {};
  for (const r of DUST_NUMERIC) o[r[0]] = s[r[0]] ?? r[5];
  for (const r of DUST_SELECTS) o[r[0]] = s[r[0]] ?? r[3];
  for (const r of DUST_COLORS) o[r[0]] = s[r[0]] ?? r[2];
  return JSON.stringify(o, null, 1);
}

// ---- the grid the shader scans -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// A particle is a pure function of time and its cell: class k (a band of the lab's `rho`, the radius it keeps off the axis, whose speed is the flat profile's at the band's middle), cell j along the vessel. The cells a
// pixel scans are (classes) x (2 N + 1). Their count is the shader's cost, so it is a BUDGET of samples a pixel (DUST_BUDGET), by device, and the grid is made as fine as that allows for the longest mark it must find.

/** The shader's loop bounds (dust-glsl.ts): classes and cells a side. */
export const DUST_KMAX = 4, DUST_NMAX = 9;
/** The density at which every cell of the grid holds a particle: the grid is as fine as the budget allows (a streak is too long for the budget to hold the lab's 1400 of them whole), and Density thins it from there, by a threshold per particle. */
export const DUST_DENSITY_FULL = 2400;
/** The longest streak the scan can find, in lumen radii. */
export const DUST_LEN_CAP = 2.4;
/** Samples a pixel: the Mac and the iPad, the iPhone (its GPU has a quarter of the pixels' worth of work to spare, and the count is the one not yet measured there: the panel's budget overrides it). */
export const DUST_BUDGET = { desktop: 56, phone: 28 } as const;
/** The classes the grid has: 4, 3 on a phone. */
export const dustClasses = (phone: boolean): number => (phone ? 3 : DUST_KMAX);
/** The budget for a view: by device, held between half and 1.3 of it by how many device pixels the figure covers (a bigger canvas, fewer samples a pixel). */
export function dustBudget(phone: boolean, devicePixels: number, override = 0): number {
  if (override > 0) return Math.max(dustClasses(phone), Math.round(override));
  const base = phone ? DUST_BUDGET.phone : DUST_BUDGET.desktop;
  const k = Math.min(1.3, Math.max(0.5, 4.5e6 / Math.max(devicePixels, 1)));
  return Math.max(dustClasses(phone), Math.round(base * k));
}

/** The lab's flat profile at a ring of the stream: faster in the middle (`flat`), slower at the wall. */
export const dustProf = (flat: number, rho: number): number => 1 + flat * (1 - 2 * rho * rho);
/** Where class k of K starts and ends in rho: the lab draws rho = random^radExp x rhoMax, so the class holds an equal share of the particles. */
export const dustBand = (k: number, K: number, radExp: number, rhoMax: number): [number, number] => [rhoMax * Math.pow(k / K, radExp), rhoMax * Math.pow((k + 1) / K, radExp)];

export interface DustQuality { phone: boolean; devicePixels: number }

/** The uniform values, in DUST_UNIFORMS order, for these (eased) numbers: `s` the numeric settings, `w` the eased weights of the selects (colour mode, custom colour, local velocity), `rgb` the custom colour. */
export interface DustWeights { random: number; speed: number; depth: number; radius: number; source: number; custom: number; local: number }
export const DUST_UNIFORMS = [
  'size', 'sizeVar', 'soft', 'opacity',
  'opVar', 'stretch', 'lenK', 'feather',
  'ring', 'twinkle', 'depthSize', 'depthDim',
  'hue', 'lightSpread', 'lightBias', 'satShift',
  'steps', 'warm', 'flowK', 'speed',
  'uMax', 'uMin', 'velLocal', 'flat',
  'radExp', 'rhoMax', 'densK', 'shrink',
  'turb', 'swirl', 'pitch', 'wobble',
  'turbFreq', 'turbSpeed', 'rhoJit', 'cellP',
  'wRandom', 'wSpeed', 'wDepth', 'wRadius',
  'wSource', 'custom', 'nCls', 'win',
  'cr', 'cg', 'cb', 'lenCap',
] as const;
export type DustUniform = (typeof DUST_UNIFORMS)[number];
export const DUST_VEC4 = Math.ceil(DUST_UNIFORMS.length / 4);

export function hexRgb(h: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(h);
  if (!m) return [0.62, 0.77, 1];
  const n = parseInt(m[1]!, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function dustDerive(s: Readonly<Record<string, number>>, w: DustWeights, rgb: readonly number[], q: DustQuality, budgetOverride = s.budget ?? 0): Record<DustUniform, number> {
  const K = dustClasses(q.phone), B = dustBudget(q.phone, q.devicePixels, budgetOverride);
  const dia = s.size! / LAB_R;
  // the grid: as fine as the budget allows for the longest mark (a dot is one diameter, a streak up to DUST_LEN_CAP long, by `stretch`)
  const lenWanted = (s.speed! * (1 + s.flat!) * s.uMax! * s.lenK!) / LAB_R;
  const lenMax = Math.max(dia, Math.min(DUST_LEN_CAP, lenWanted));
  const lenEff = dia + (lenMax - dia) * s.stretch!;
  const window = lenEff + dia * (1 + s.sizeVar!);
  const perClass = Math.min(2 * DUST_NMAX + 1, Math.max(3, Math.floor(B / K)));
  const cellP = window / (perClass - 1);
  const win = Math.min(DUST_NMAX, Math.ceil((perClass - 1) / 2) + 1);
  let meanProf = 0;
  for (let k = 0; k < K; k++) { const [a, b] = dustBand(k, K, s.radExp!, s.rhoMax!); meanProf += dustProf(s.flat!, 0.5 * (a + b)) / K; }
  const v: Record<DustUniform, number> = {
    size: dia, sizeVar: s.sizeVar!, soft: s.soft!, opacity: s.opacity!,
    opVar: s.opVar!, stretch: s.stretch!, lenK: s.lenK! / LAB_R, feather: s.feather!,
    ring: s.ring!, twinkle: s.twinkle!, depthSize: s.depthSize!, depthDim: s.depthDim!,
    hue: s.hueSpread! / 360, lightSpread: s.lightSpread!, lightBias: s.lightBias!, satShift: s.satShift!,
    steps: s.steps!, warm: s.warm!, flowK: s.speed! / LAB_SPEED / Math.max(meanProf, 0.05), speed: s.speed!,
    uMax: s.uMax!, uMin: s.uMin!, velLocal: w.local, flat: s.flat!,
    radExp: s.radExp!, rhoMax: s.rhoMax!, densK: Math.min(1, s.density! / DUST_DENSITY_FULL), shrink: s.shrink!,
    turb: s.turb!, swirl: s.swirl!, pitch: s.pitch! / LAB_R, wobble: s.wobble!,
    turbFreq: s.turbFreq!, turbSpeed: s.turbSpeed!, rhoJit: s.rhoJit!, cellP,
    wRandom: w.random, wSpeed: w.speed, wDepth: w.depth, wRadius: w.radius,
    wSource: w.source, custom: w.custom, nCls: K, win,
    cr: rgb[0]!, cg: rgb[1]!, cb: rgb[2]!, lenCap: lenMax,
  };
  return v;
}
