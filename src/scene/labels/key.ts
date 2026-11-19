// The figure key: a slide's colour key, drawn small on the figure instead of in the teaching card (Mohammad, 15 Oct, 2D app). Pure:
// the words and colours of a key for a lens in a look. Its words are the 2D app's (names.copied.ts LENS_KEY); its colours are the 2D
// tokens' (KEY_COLOURS), so a key reads the same in both apps until the 3D lenses (batch B3) draw their own ramps, which then replace
// `rampStops` (the test lists every key whose colours still come from the 2D table).
import { LABEL_NAMES } from './names.copied.ts';
import type { LookId } from '../../looks/looks.ts';

export type Scheme = 'light' | 'soft' | 'dark';
export const schemeOf = (look: LookId): Scheme => (look === 'light' ? 'light' : look === 'soft' ? 'soft' : 'dark');

export interface KeyModel {
  lens: string;
  /** The lens's name, capitalised ("Pressure"). */
  name: string;
  /** A colour scale (a CSS gradient) or named swatches. */
  scale: { gradient: string; lo: string; hi: string; /** the pressure drop key names its ends; the other scales are a bar alone */ ends: boolean } | null;
  swatches: { colour: string; label: string; short?: string }[] | null;
  /** The key's words for a screen reader. */
  aria: string;
}

/** The 2D app names the ends of the pressure-drop key only ("a bare green bar did not say which end was which", 17 Oct design review). */
const ENDS = new Set(['drop']);

type Table = Record<string, string>;
const colours = (scheme: Scheme): Table => LABEL_NAMES.KEY_COLOURS[scheme] as unknown as Table;

/** A ramp token ("#colour position, ...") as CSS stops. Positions run 0 to the last stop's own (30 mmHg for pressure, 1 for the others). */
export function rampStops(token: string): { colour: string; at: number }[] {
  const stops = token.split(',').map((s) => { const [c, p] = s.trim().split(/\s+/); return { colour: c, p: Number(p) }; });
  const top = stops[stops.length - 1].p || 1;
  return stops.map((s) => ({ colour: s.colour, at: s.p / top }));
}

export function gradientOf(lens: string, scheme: Scheme): string {
  const t = colours(scheme);
  if (lens === 'delta') return `linear-gradient(in oklab to right, ${t['delta-low']}, ${t['delta-mid']}, ${t['delta-high']})`;
  const token = t[`ramp-${lens}`];
  if (!token) throw new Error(`no colour ramp for the key of "${lens}"`);
  return `linear-gradient(in oklab to right, ${rampStops(token).map((s) => `${s.colour} ${+(s.at * 100).toFixed(1)}%`).join(', ')})`;
}

export function keyModel(lens: string | null, scheme: Scheme): KeyModel | null {
  if (!lens) return null;
  const spec = (LABEL_NAMES.LENS_KEY as unknown as Record<string, { name: string; ramp?: string; lo?: string; hi?: string; swatches?: { cssVar: string; label: string; short?: string }[] }>)[lens];
  if (!spec) throw new Error(`no figure key for the lens "${lens}"`);
  const name = spec.name[0].toUpperCase() + spec.name.slice(1);
  if (spec.ramp) {
    return {
      lens, name, swatches: null,
      scale: { gradient: gradientOf(spec.ramp, scheme), lo: spec.lo!, hi: spec.hi!, ends: ENDS.has(lens) },
      aria: `Vessels colored by ${spec.name}, ${spec.lo} to ${spec.hi}`,
    };
  }
  const t = colours(scheme);
  return {
    lens, name, scale: null,
    swatches: spec.swatches!.map((s) => {
      const colour = t[s.cssVar.replace(/^--/, '')];
      if (!colour) throw new Error(`no colour for ${s.cssVar} in the key of "${lens}"`);
      return { colour, label: s.label, ...(s.short ? { short: s.short } : {}) };
    }),
    aria: `Vessels colored by ${spec.name}`,
  };
}

export const KEY_LENSES: readonly string[] = Object.keys(LABEL_NAMES.LENS_KEY);
