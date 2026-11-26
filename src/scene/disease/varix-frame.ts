// Where a bleed's varix stands, as the camera needs it: the points a frame must keep in sight, in scene units, whatever the bleed is doing (a band, glue
// or a stent stops the jet but the varix stays
// drawn where it was). One pure place, read by the case's stop frame (ui/case/frame.ts) and its test, so "frame the varix" is one rule, not a region box tuned by eye.
// Root cause of the bleed stops' camera missing the varix (Mohammad's capture 0bc14020, 26 Nov: "The figure: the bleeding varix" showed the stomach and
// the liver's hilum, the varix at the screen's top
// edge or under the card): the stop's shot was the slides' region `bleed` or `varices`, a plate box drawn for the 2D app round the whole upper gut,
// centred where its middle is, never on the varix; and the
// case's cards take the room's foot or its left, so what a box's edge holds is hidden by them.
import { x3, y3 } from '../frame2d.ts';
import { PLACED_PATH_2D, PLACED_Z } from '../anatomy/placed-network.ts';
import { tearAt, VARIX_COURSE, type BleedSite } from './stream-fit.ts';

export type { BleedSite };
/** The site a stop's camera name is about: the shots the case takes at a bleed and where the varices are shown (stops.ts defaultShot). Any other camera is no varix's. */
export const VARIX_SITE_OF_CAM: Readonly<Record<string, BleedSite>> = { bleed: 'VAR', varices: 'VAR', fundus: 'GV' };
/** How far (figure units) below the tear the frame also keeps: the blood falls from the tear into the stomach's pool, and the pool is half of what the bleed shows. */
export const FALL_BELOW = 70;

export interface Pt3 { x: number; y: number; z: number }
/** The varix of `site`: samples along its placed course (every vessel that carries it, end to end), the tear on it, and the point where its blood falls to. Scene units. */
export function varixPoints(site: BleedSite): Pt3[] {
  const out: Pt3[] = [];
  for (const id of VARIX_COURSE[site]) {
    const c = PLACED_PATH_2D[id], z = PLACED_Z[id];
    if (!c || !z) continue;
    c.forEach((p, i) => out.push({ x: x3(p[0]), y: y3(p[1]), z: z[i] ?? 0 }));
  }
  const t = tearAt(site);
  out.push({ x: x3(t.x), y: y3(t.y), z: t.z }, { x: x3(t.x), y: y3(t.y + FALL_BELOW), z: t.z });
  return out;
}
export interface Box2 { x0: number; y0: number; x1: number; y1: number }
export const boxOfPoints = (pts: readonly Pt3[]): Box2 => ({
  x0: Math.min(...pts.map((p) => p.x)), y0: Math.min(...pts.map((p) => p.y)), x1: Math.max(...pts.map((p) => p.x)), y1: Math.max(...pts.map((p) => p.y)),
});
