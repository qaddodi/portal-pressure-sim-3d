// The frame a bleed's stop takes on its varix, from what the case's cards leave of the room (pure: tests/case-varix-frame.test.ts judges it on a Mac, an iPad and an iPhone).
// The stop's own camera name (`bleed`, `varices`, `fundus`) is a slide's region box, centred on the middle of the upper gut and sized for the 2D app,
// which has no card over its figure. Here the card takes
// the foot or the left, the figure pans into what it leaves and never zooms (the owner's rule, 20 Nov), so a box edge, and whatever stood on it, went
// under the card or off the screen. The frame is made
// from the varix instead: its aim is the middle of the varix and the blood's fall (varix-frame.ts), so that point stands in the middle of the part the
// card leaves, on every device; its zoom is the one at which
// that subject fits in the part the card leaves with the stations' margin (KEEP_PX), never nearer than a stretch of the figure that shows the varix in its place.
import type { Rect } from '../layout/device.ts';
import type { Shot } from '../../scene/camera/shots.ts';
import { FILL, KEEP_PX } from '../../scene/camera/room.ts';
import { boxOfPoints, varixPoints, type BleedSite } from '../../scene/disease/varix-frame.ts';

/** The least the frame shows about its aim, scene units (half extents): the varix with the esophagus above it and the cardia and the stomach's top below,
 *  wide enough for its neighbours' labels. */
export const MIN_HALF: readonly [number, number] = [0.5, 0.45];
/** How near the camera may stand (the slides' own floor, decks/hp/cams.ts NEAR). */
const NEAR_R = 2.8;

/** The pixels per scene unit the frame asks for in a free rectangle `free` (the room less the cards): the subject fits with KEEP_PX to spare, and the
 *  picture shows at least MIN_HALF round the aim. */
export function varixScale(site: BleedSite, free: Pick<Rect, 'w' | 'h'>): number {
  const b = boxOfPoints(varixPoints(site)), bw = b.x1 - b.x0, bh = b.y1 - b.y0;
  const fit = Math.min(Math.max(free.w - 2 * KEEP_PX, 1) / Math.max(bw, 1e-6), Math.max(free.h - 2 * KEEP_PX, 1) / Math.max(bh, 1e-6));
  return Math.min(fit, free.w / (2 * MIN_HALF[0]), free.h / (2 * MIN_HALF[1]));
}

/** The shot that frames `site`'s varix for a room of `room`'s size with the cards leaving `free`: aimed at the middle of the subject, its half extents
 *  the room's at that scale (the solver, room.ts, fits them to the room). */
export function varixShot(site: BleedSite, room: Pick<Rect, 'w' | 'h'>, free: Pick<Rect, 'w' | 'h'>): Shot {
  const pts = varixPoints(site), b = boxOfPoints(pts), pxu = varixScale(site, free);
  const z = pts.reduce((a, p) => a + p.z, 0) / pts.length;
  return { yaw: 0, pitch: 0, r: NEAR_R, target: [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, z], half: [(FILL * room.w) / (2 * pxu), (FILL * room.h) / (2 * pxu)] };
}
