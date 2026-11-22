// THE velocity colour ramp: the one place its colours are written down (Mohammad, 22 Nov 2026: "Go with F", Indigo · Teal · Coral, round 2 of the velocity mocks).
// Every reader takes it from here: the vessels (lenses/model.ts samplerFor), the legend bar and the lens menu's swatch (legend.ts rampStops, labels/key.ts), the Doppler colouring, the stent read labels,
// the Lobule's velocity ink and the TIPS figure (all through samplerFor). `tests/velocity-ramp.test.ts` fails on a second reader of the 2D ramp (LENS_TOKENS[..].velocity).
//
// Like the pressure ramp these are the colours the figure DRAWS (lenses/pressure-ramp.ts RAW_LENSES), so a legend swatch and a vessel are the same colour. Position 0 is slower than normal, 1 is faster; the middle
// third (.36 to .64) is one teal, "normal" (the mock's plateau). The hues are his pick (indigo, teal, coral). Only the coral moved, hue kept, so the fast end stays 10 or more (OKLab x100) from the artery red, which keeps
// its red under every lens (tests/velocity-ramp.test.ts: 11 or more here). Light and Soft are lighter than the mock's coral (+0.06 and +0.09 L) with its chroma kept (+0.01 and 0), found by search so that normal against fast
// also stays 14 or more for deutan vision (the plan's first stops, -0.03 chroma, gave 12.0 and 11.6); Dark's coral is the plan's (+0.06 L, -0.01 C): it sits at the sRGB edge and normal against fast under deutan vision tops out at 12.6 there.
// The 2D app's own sand-teal-violet ramp stays in tokens.copied.ts as the reference it was copied from.
import type { Ramp } from './tokens.copied.ts';
import type { LookId } from '../palette.ts';

/** Stops [colour, position 0..1] per look. Soft takes Light's slow and normal stops with a deeper coral (its ground is a tan); Dark, Navy and Black share one ramp. */
export const VELOCITY_RAMP: Readonly<Record<LookId, Ramp>> = (() => {
  const P = [0, 0.24, 0.36, 0.64, 0.76, 1];
  const mk = (c: readonly string[]): Ramp => c.map((h, i) => [h, P[i]!] as const);
  const light = mk(['#39359B', '#3C7EBE', '#52A9A2', '#52A9A2', '#EB9361', '#E8542F']);
  const soft = mk(['#39359B', '#3C7EBE', '#52A9A2', '#52A9A2', '#E58E5B', '#F35E3A']);
  const dark = mk(['#615CDC', '#5E9AE7', '#6DCAC2', '#6DCAC2', '#FDB584', '#FF8962']);
  return { light, soft, dark, navy: dark, black: dark };
})();
