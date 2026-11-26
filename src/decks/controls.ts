// The live controls a slide puts on its teaching card (the 2D slide's `compare`, `whatIf`, `response` and `scales`), as plain data. Pure: the card draws them
// (ui/cards/SlideControls.tsx) and ui/deck/controls-run.ts carries them out on the live model. Read from the copied 2D slide, never typed per slide.
// A compare list or a what-if slider that moves an instrument (`gate`, `tool`) is carried like the others: `gate` is the Doppler's sample spot, `tool` the patch laid over the slide's own
// instrument options (ui/talk/tool-options.ts); neither touches the model (2D presenter-lapse.js abPick, whatIfEl).
import type { CopiedSlide } from './hp/types.ts';

/** One button of a compare group: what it switches, by the first field it has. `own` marks the slide's own state (pressed when the slide opens). */
export interface CompareOpt {
  label: string; short?: string; own?: boolean; params?: Record<string, unknown>; preset?: string; slide?: string; lens?: string;
  /** the Doppler gate or the instrument options this button sets (the model is left alone) */
  gate?: string; tool?: Record<string, unknown>;
  /** the days the patient this button names lives at its params (2D `days`) */
  days?: number;
  /** the words this button brings with its patient (2D variantWords): its own title, line, kicker and level */
  title?: string; line?: string; kicker?: string; site?: string;
  /** what pressing it does (2D abChoice): switch the lens, ease the model to a state (a patient, another slide, the slide's own), or patch the live parameters */
  how: 'lens' | 'state' | 'params';
}
/** What a compare button does (2D presenter-words.js abChoice): a lens button switches the colours; a patient (`preset`), a time point (`slide`) or the slide's own button in a row
 *  that has one (or that names no parameters of its own) eases the model to a state; any other button patches the live parameters. */
export function howOf(list: readonly { lens?: unknown; preset?: unknown; slide?: unknown; own?: unknown; params?: unknown }[], k: number): CompareOpt['how'] {
  const o = list[k]!;
  if (o.lens) return 'lens';
  if (o.preset || o.slide || (o.own && (!o.params || list.some((p) => p.preset || p.slide)))) return 'state';
  return 'params';
}
export interface WhatIf { label: string; paths: string[]; min: number; max: number; step: number; ends?: [string, string]; unit?: string; tool?: string }
export type Scale = 'anatomy' | 'lobule' | 'sinusoid';
export interface SlideControls {
  compare?: { opts: CompareOpt[]; name: string };
  whatIf?: WhatIf;
  /** the scale pill: the scales offered, the slide's own first, and the camera each lands on (a lobule camera name, or the anatomy's region) */
  scales?: { own: Scale; list: Scale[]; cam: Partial<Record<Scale, string>> };
  /** the hold-to-strain button (2D `strain: true` or `{ label }`): the engine's Valsalva while it is held */
  strain?: { label: string };
}

/** The beta-blocker response control (2D nsbb-response.js): three buttons that set the engine's nsbbGain; the slide's own gain marks its button. */
export const NSBB_LEVELS = [
  { label: 'Non-responder', short: 'None', gain: 0 }, { label: 'Usual responder', short: 'Usual', gain: 1 }, { label: 'Strong responder', short: 'Strong', gain: 1.6 },
] as const;
const ownGain = (s: CopiedSlide): number => ((s.params as { nsbbGain?: number } | null | undefined)?.nsbbGain ?? 1);

const rec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function compareOf(s: CopiedSlide): SlideControls['compare'] {
  if (s.response === true) {
    // (a slide may carry its own three gains, solved for the falls the buttons stand for, and a line for a button: decks/overlay/controls.ts)
    const gains = Array.isArray(s.responseGains) && s.responseGains.length === NSBB_LEVELS.length ? (s.responseGains as number[]) : NSBB_LEVELS.map((l) => l.gain);
    const lines = Array.isArray(s.responseLines) ? (s.responseLines as (string | null)[]) : [];
    const own = gains.findIndex((g) => g === ownGain(s));
    const opts = NSBB_LEVELS.map((l, k) => ({
      label: l.label, short: l.short, params: { nsbbGain: gains[k]! }, ...(k === own ? { own: true } : {}), ...(typeof lines[k] === 'string' ? { line: lines[k]! } : {}), how: 'params' as const,
    }));
    return { name: 'Change how well the beta-blocker works on the live model', opts };
  }
  const list = s.compare as unknown;
  if (!Array.isArray(list) || !list.length) return undefined;
  const recs = list.filter(rec);
  const opts: CompareOpt[] = recs.map((o, k) => ({
    label: String(o.label ?? ''), ...(typeof o.short === 'string' ? { short: o.short } : {}), ...(o.own ? { own: true } : {}),
    ...(rec(o.params) ? { params: o.params } : {}), ...(typeof o.preset === 'string' ? { preset: o.preset } : {}),
    ...(typeof o.slide === 'string' ? { slide: o.slide } : {}), ...(typeof o.lens === 'string' ? { lens: o.lens } : {}),
    ...(typeof o.gate === 'string' ? { gate: o.gate } : {}), ...(rec(o.tool) ? { tool: o.tool } : {}),
    ...(typeof o.days === 'number' ? { days: o.days } : {}),
    ...(typeof o.title === 'string' ? { title: o.title } : {}), ...(typeof o.line === 'string' ? { line: o.line } : {}),
    ...(typeof o.kicker === 'string' ? { kicker: o.kicker } : {}), ...(typeof o.site === 'string' ? { site: o.site } : {}),
    how: howOf(recs, k),
  }));
  // (the slide's own button, in a row that moves an instrument, puts the slide's own options back: abChoice `tool: null`, an empty patch here)
  if (opts.some((o) => o.tool)) for (const o of opts) if (o.own && !o.tool && !o.gate && !o.lens && !o.preset && !o.slide) o.tool = {};
  const lens = opts.some((o) => o.lens), params = opts.some((o) => o.params && 'fenestrae' in o.params), gate = opts.some((o) => o.gate), tool = opts.some((o) => o.tool);
  return { opts, name: lens ? 'Color the vessels by' : gate ? 'Sample the stent at' : tool ? 'Change the instrument\'s view' : params ? 'Open or close the fenestrae on the live model' : 'Switch treatment on the live model' };
}

function whatIfOf(s: CopiedSlide): WhatIf | undefined {
  const w = s.whatIf;
  if (!rec(w) || (w.param == null && typeof w.tool !== 'string')) return undefined;
  const min = Number(w.min), max = Number(w.max);
  return {
    label: String(w.label ?? ''), paths: w.param == null ? [] : ([] as unknown[]).concat(w.param).map(String), min, max, step: Number(w.step) || (max - min) / 20,
    ...(typeof w.tool === 'string' ? { tool: w.tool } : {}),
    ...(Array.isArray(w.ends) ? { ends: [String(w.ends[0]), String(w.ends[1])] as [string, string] } : {}),
    ...(typeof w.unit === 'string' ? { unit: w.unit } : {}),
  };
}

const ownScale = (cam: unknown): Scale => (typeof cam === 'string' && cam === 'sinusoid' ? 'sinusoid' : typeof cam === 'string' && cam.startsWith('lobule') ? 'lobule' : 'anatomy');

/** The scale switch: `scales` is a list ('lobule', 'anatomy:fit': each with where it lands) or one object per scale ({ anatomy: { cam }, lobule: { cam }, sinusoid: {} }). */
function scalesOf(s: CopiedSlide): SlideControls['scales'] {
  const sc = s.scales as unknown, own = ownScale(s.cam);
  if (!sc) return undefined;
  const cam: Partial<Record<Scale, string>> = {};
  const offered: Scale[] = [];
  const add = (k: string, c?: unknown) => {
    const name = k.split(':')[0] as Scale;
    if (!(['anatomy', 'lobule', 'sinusoid'] as string[]).includes(name)) return;
    if (!offered.includes(name)) offered.push(name);
    const land = typeof c === 'string' ? c : k.includes(':') ? k.split(':')[1] : undefined;
    if (land) cam[name] = land;
  };
  if (Array.isArray(sc)) for (const k of sc) add(String(k));
  else if (rec(sc)) for (const [k, v] of Object.entries(sc)) add(k, rec(v) ? v.cam : undefined);
  const list = [own, ...offered.filter((x) => x !== own)];
  return list.length > 1 ? { own, list, cam } : undefined;
}

/** The hold-to-strain button's label ('Hold to strain' unless the slide names one). */
function strainOf(s: CopiedSlide): SlideControls['strain'] {
  const v = s.strain as unknown;
  if (v !== true && !rec(v)) return undefined;
  const label = rec(v) && typeof v.label === 'string' && v.label.trim() ? v.label.trim() : 'Hold to strain';
  return { label };
}

export function controlsOf(s: CopiedSlide): SlideControls | undefined {
  const c: SlideControls = {};
  const strain = strainOf(s);
  if (strain) c.strain = strain;
  const compare = compareOf(s), whatIf = whatIfOf(s), scales = scalesOf(s);
  if (compare) c.compare = compare;
  if (whatIf) c.whatIf = whatIf;
  if (scales) c.scales = scales;
  return Object.keys(c).length ? c : undefined;
}

/** The words a compare button puts on the card (2D presenter-question.js variantWords): its own title, line, kicker and level; from the slide a time-point button names; or the slide's own
 *  (the slide's own button, and a button that says nothing, keeps what the slide says). `at` is the slide a `slide:` button names. */
export interface VariantWords { title: string; line: string; kicker: string; site?: string }
export function variantWords(slide: { title: string; line: string; kicker: string; site?: string }, o: CompareOpt, at?: { title: string; line: string; kicker: string; site?: string } | null): VariantWords {
  const src: Partial<VariantWords> = o.own ? slide : at ?? o;
  const pick = <K extends keyof VariantWords>(k: K): VariantWords[K] => (src[k] ?? slide[k]) as VariantWords[K];
  const out: VariantWords = { title: pick('title'), line: pick('line'), kicker: pick('kicker') };
  const site = pick('site');
  if (site) out.site = site;
  return out;
}
/** A row of compare buttons where some button speaks (2D `wordy`): only then does a parameter button bring words. */
// (a button that names another slide (`slide`) brings that slide's words, so it speaks too: the card then holds them and its height is decided once;
// capture 3531bdfa, Landmark trials 4, 7, 9, 13, 14, whose buttons put another slide's title in a card sized for its own; tests/variant-reserve.test.ts)
export const speaks = (opts: readonly CompareOpt[]): boolean => opts.some((o) => o.title || o.line || o.slide);

/** The nested change one value makes at each dotted path ("tips.d" → { tips: { d } }), merged: what the engine's `setParams` takes. */
export function patchOf(paths: readonly string[], x: number): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const p of paths) {
    const keys = p.split('.');
    let at = out;
    keys.forEach((k, i) => { if (i === keys.length - 1) at[k] = x; else at = (at[k] = rec(at[k]) ? at[k] : {}) as Record<string, unknown>; });
  }
  return out;
}
/** A parameter's value at a dotted path (the slide's own start value). */
export const valueAt = (params: unknown, path: string): number | undefined => {
  let v: unknown = params;
  for (const k of path.split('.')) v = rec(v) ? v[k] : undefined;
  return typeof v === 'number' ? v : undefined;
};
