// What the colour lens paints in the Sinusoid view (the table of what it means: lenses/in-view.ts). Pure: a lens, a look and the lobule's model in, colours out.
//   the lumen       every lens but the stream ones, at the sinusoid node (the lobule's ink at the sinusoid's own value: inkAt 'sin', w = 1).
//                   Pressure keeps the 2D sinusoid's own rule (P2, not rounded).
//   the red cells   Blood origin and First pass: the blood has mixed by here, so each cell wears one source's colour, picked by its own fixed draw against the shares halfway along the sinusoid
//                   (laneShares, the very blend the lobule's lanes are drawn from). Under every other lens the cells keep their own red.
import { samplerFor } from '../lenses/model.ts';
import { shownLens } from '../lenses/in-view.ts';
import type { Rgb } from '../lenses/oklab.ts';
import type { LensId } from '../lenses/model.ts';
import { type InkContext, inkAt, laneColours, laneShares } from '../lobule/ink.ts';

/** Where along the sinusoid the stretch the view shows sits, for the shares of the stream lenses: halfway (0 the central vein, 1 the portal end, as the lobule's `w`). */
export const SINUSOID_MID_W = 0.5;
/** The place the lumen's colour is read at: the sinusoid node's own value (P2, the node's saturation, the sinusoidal bed's flow), which the lobule's ink gives at w = 1. */
const NODE_W = 1;

/** Whether `lens` colours the red cells rather than the lumen. */
export const coloursCells = (lens: LensId): lens is 'origin' | 'firstpass' => lens === 'origin' || lens === 'firstpass';

/** The lumen's colour (sRGB 0..1, into `out`) under the figure's lens `lens` (the view's own fallback applied). */
export function sinusoidLumen(c: InkContext, lens: LensId, out: Rgb): Rgb {
  const shown = shownLens('sinusoid', lens);
  if (shown === 'pressure') return samplerFor(c.look, 'pressure').at(c.model.P2, out);
  // (fibSin 0: the lobule drains a capillarized sinusoid's colour toward its shade, a lobule-scale cue; here the collagen and the basement membrane show it, and the lens keeps its own colour)
  return inkAt({ ...c, lens: shown, fibSin: 0 }, 'sin', NODE_W, out);
}

/** The sources' colours and their cumulative shares for the red cells, or null when the lens leaves them red. `cum[i]` is the share of sources 0..i (the last is 1). */
export function sinusoidCellSources(c: InkContext, lens: LensId): { cols: readonly Rgb[]; cum: number[] } | null {
  const shown = shownLens('sinusoid', lens);
  if (!coloursCells(shown)) return null;
  const f = laneShares({ ...c, lens: shown }, 'sin', SINUSOID_MID_W, []);
  let sum = 0; for (const v of f) sum += v;
  const cum: number[] = [];
  let acc = 0;
  for (const v of f) { acc += sum > 0 ? v / sum : 0; cum.push(acc); }
  cum[cum.length - 1] = 1;
  return { cols: laneColours(shown), cum };
}

/** Which source a red cell with the fixed draw `u` (0..1) comes from, against `cum`. */
export function cellSource(u: number, cum: readonly number[]): number {
  for (let i = 0; i < cum.length; i++) if (u < cum[i]!) return i;
  return cum.length - 1;
}
