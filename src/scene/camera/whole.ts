// The whole figure as the Fit frames it, from what is drawn NOW: the organs (shots.ts SHOTS.play) and, while the belly holds water, the ascites down to its lowest tip and out to its walls
// (Mohammad, 25 Nov, iPhone: "when there is ascites the bottom fit should move so it includes the tip of the ascites on bottom"). The water is laid by ascites.ts from the cavity's outline
// (ascites-cavity.ts, 2D units) under its surface, every vertex slid along the rest camera's ray onto that outline head-on, so its outline in the belly's plane is what the screen shows.
import type { Box3 } from '../anatomy/source.ts';
import { x3, y3 } from '../frame2d.ts';
import { poolFade, fluidLevel, fluidBase } from '../disease/copied/fluid-step.js';
import { bulgeStep, polyOf } from '../disease/ascites-pool.ts';
import { HULL } from '../disease/ascites-hull.ts';
import { SHOTS, wholeFigureWith, type Shot } from './shots.ts';

/** The water's box in scene units at `ml` (the part of the cavity under the surface, the surface where it meets the walls included), or null with no pool drawn. */
export function ascitesBox(ml: number): Box3 | null {
  if (!(poolFade(ml) > 0)) return null;
  const poly = polyOf(bulgeStep(ml)), h = fluidLevel(ml).h;
  // (2D y runs down: the water is where y is below the surface's own y, fluidBase, at that x)
  const under = (p: readonly [number, number]) => p[1] - fluidBase(p[0], h);
  let x0 = Infinity, x1 = -Infinity, yTop = Infinity, yBottom = -Infinity;
  const take = (x: number, y: number) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); yTop = Math.min(yTop, y); yBottom = Math.max(yBottom, y); };
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!, b = poly[(i + 1) % poly.length]!, da = under(a), db = under(b);
    if (da >= 0) take(a[0], a[1]);
    // (an edge that crosses the surface: where the water meets the wall)
    if ((da >= 0) !== (db >= 0)) { const k = da / (da - db); take(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k); }
  }
  if (!(x1 >= x0)) return null;
  const z = HULL.MID;
  return [x3(x0), y3(yBottom), z, x3(x1), y3(yTop), z];
}

const cache = new Map<number, Shot>();
/** The whole-figure shot for a belly holding `ml` of water (the volume the patient is going to, not the eased one, so the camera moves once): the organs' own with none. */
export function wholeShot(ml: number): Shot {
  if (!(poolFade(ml) > 0)) return SHOTS.play;
  // (to the nearest 50 mL: the fit's change from one to the next is under a pixel)
  const key = Math.round(ml / 50);
  let s = cache.get(key);
  if (!s) { s = wholeFigureWith(ascitesBox(key * 50) ?? ascitesBox(ml)!); cache.set(key, s); }
  return s;
}
