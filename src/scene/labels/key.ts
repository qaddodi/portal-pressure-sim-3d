// The figure key: a slide's colour key, drawn small on the figure instead of in the teaching card (Mohammad, 15 Oct, 2D app). Pure:
// the words and colours of a key for a lens in a look. Its words are the 2D app's (names.copied.ts LENS_KEY). Its COLOURS are the lens colour key's
// own (scene/lenses/legend.ts: the ramps the vessels are painted from, through the vessels' transform), never the 2D table: a key that kept its own
// copy drew green for Pressure drop while the vessels were purple (Mohammad, 22 Nov). `tests/key-colours.test.ts` fails on any divergence.
import { LABEL_NAMES } from './names.copied.ts';
import type { LookId } from '../../looks/looks.ts';
import { rampStops as lensRampStops, deltaStops, LG_MAX } from '../lenses/legend.ts';
import { figureHex } from '../vessels/cel-ink.ts';

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

/** The key's gradient for a ramp lens in a look: the legend's own stops (the vessels' colours), in OKLab like the legend bar. */
export function gradientOf(lens: string, look: LookId): string {
  const stops = lens === 'delta' ? deltaStops(look) : lensRampStops(look, lens as Parameters<typeof lensRampStops>[1], lens === 'pressure' ? LG_MAX : 1);
  return `linear-gradient(in oklab to right, ${stops.map(([c, at]) => `${c} ${+at.toFixed(1)}%`).join(', ')})`;
}

export function keyModel(lens: string | null, look: LookId): KeyModel | null {
  if (!lens) return null;
  const spec = (LABEL_NAMES.LENS_KEY as unknown as Record<string, { name: string; ramp?: string; lo?: string; hi?: string; swatches?: { cssVar: string; label: string; short?: string }[] }>)[lens];
  if (!spec) throw new Error(`no figure key for the lens "${lens}"`);
  const name = spec.name[0].toUpperCase() + spec.name.slice(1);
  if (spec.ramp) {
    return {
      lens, name, swatches: null,
      scale: { gradient: gradientOf(spec.ramp, look), lo: spec.lo!, hi: spec.hi!, ends: ENDS.has(lens) },
      aria: `Vessels colored by ${spec.name}, ${spec.lo} to ${spec.hi}`,
    };
  }
  const t = colours(schemeOf(look));
  // Velocity's two ends are the ends of its ramp (what the vessels wear); every other swatch is a token colour put through the vessels' transform, as the legend's dots are.
  const vel = lens === 'velocity' ? lensRampStops(look, 'velocity', 1) : null;
  return {
    lens, name, scale: null,
    swatches: spec.swatches!.map((s, i) => {
      const token = t[s.cssVar.replace(/^--/, '')];
      if (!token) throw new Error(`no colour for ${s.cssVar} in the key of "${lens}"`);
      const colour = vel ? vel[i === 0 ? 0 : vel.length - 1]![0] : figureHex(token, look);
      return { colour, label: s.label, ...(s.short ? { short: s.short } : {}) };
    }),
    aria: `Vessels colored by ${spec.name}`,
  };
}

export const KEY_LENSES: readonly string[] = Object.keys(LABEL_NAMES.LENS_KEY);

/** Where a lens's key stands (Mohammad, 22 Nov: "just choose best location"). The stream lenses name the same things the instrument card beside them counts (Origin: the inflows, First pass: the clearance), so
 *  their key is the first row of that card and comes and goes with it; a ramp (pressure, drop, flow, heat) explains the figure's colouring, so it stands in the foot of the story card (key-dock.ts). docs/HUMANIZED-DESIGN.md has the rule. */
export const CARD_KEY_LENSES: readonly string[] = ['origin', 'firstpass'];
export const keyPlace = (lens: string): 'card' | 'dock' => (CARD_KEY_LENSES.includes(lens) ? 'card' : 'dock');
