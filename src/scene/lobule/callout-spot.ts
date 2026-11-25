// Where a slide's lobule callout ("Resistance", "Dilated zone 3 sinusoids") stands: on the net's own vessels, on the side the camera frames. Pure: the net in, a plate point and a ring radius out
// (lobule radii, the 2D plane, y down), so it is judged in node (tests/callout-anchors.test.ts).
//
// Why it is not fixed geometry (Mohammad, 23 Nov: "the location should be around sinusoids, that's where resistance is. Not some random area to the right"): the old names ('triad:0', 'zone:2',
// 'centre') were a corner at angle 0 that no lobule shot frames (the shots frame the corner at angle pi), a point 9 to 12 lumens off the nearest sinusoid on a hepatocyte plate, and the central vein.
// Resistance lives in the sinusoids, so the sinusoid names resolve to a sample of a real s0/s1/s2 course.
// ... but that was over-applied (Mohammad, 23 Nov: "SOS resistance is in the central vein dude wtf"): the slides ABOUT the central vein (postsinusoidal, SOS) ring the vein itself ('central'); only a label
// that names sinusoids ("Dilated zone 3 sinusoids") rings a sinusoid (figure-calls.ts).
import type { LobuleNet } from './geometry.ts';
import { DISC_R } from './widths.ts';
import { framedTriad, stationAt } from './captions.ts';

/** The places a slide's callout names (figure-calls.ts maps the deck's `at` to them): the portal tract the lobule shots frame, a sinusoid half way along (zone 2), a pericentral sinusoid (zone 3), the central vein. */
export type CalloutName = 'tract' | 'sinusoid:mid' | 'sinusoid:zone3' | 'central';
export const CALLOUT_NAMES: readonly CalloutName[] = ['tract', 'sinusoid:mid', 'sinusoid:zone3', 'central'];
export const isCalloutName = (n: string): n is CalloutName => (CALLOUT_NAMES as readonly string[]).includes(n);

/** A ring round one sinusoid: about five lumens across, so it plainly circles that one (lobule radii). Its inner edge stays 0.189 R from the centre; the central vein is 0.12 R at its widest. */
export const SINUSOID_RING_R = 0.045;
/** The air a ring leaves round the central vein as drawn (view.ts rings it at the vein's radius now times this). */
export const CV_RING_AIR = 1.2;
/** The ring round the central vein at rest (the vein's resting radius with the air); the view widens it with the vein as it dilates. */
export const CV_RING_R = DISC_R.cv * CV_RING_AIR;
/** The ring round a portal tract (2D lobule-zoom-labels.js callRingAt: 1.6 times the portal venule's radius). */
export const TRACT_RING_R = DISC_R.pv * 1.6;
/** Where along a sinusoid (its distance from the centre, lobule radii) each sinusoid place stands, and how far it may drift to find a sample nearest the framed corner. */
export const BAND = { mid: { rho: 0.5, tol: 0.02 }, zone3: { rho: 0.235, tol: 0.02 } } as const;

export interface CalloutSpot { x: number; y: number; r: number; /** the sinusoid course the place stands on (a sinusoid place) */ course?: number }

export { framedTriad };

/** The angle (rad, 0 to pi) between a plate point and the framed corner's side, (-1, 0). */
const offSide = (x: number, y: number): number => Math.atan2(Math.abs(y), -x);

export function calloutSpot(net: Pick<LobuleNet, 'triads' | 'courses' | 'corners'>, name: CalloutName): CalloutSpot {
  const tri = framedTriad(net.triads);
  if (name === 'central') {
    const cv = net.courses.find((c) => c.kind === 'cv');
    if (!cv) throw new Error('no central vein course');
    // (the end-on vein is a short run of points through the plate's centre: its middle)
    const x = cv.pts.reduce((a, p) => a + p[0], 0) / cv.pts.length, y = cv.pts.reduce((a, p) => a + p[1], 0) / cv.pts.length;
    return { x, y, r: CV_RING_R, course: cv.id };
  }
  if (name === 'tract') { const t = net.triads[tri]!; return { x: t.x, y: t.y, r: TRACT_RING_R }; }
  const band = name === 'sinusoid:mid' ? BAND.mid : BAND.zone3;
  // the "Sinusoids" station's dot stands on the framed tract's side: the ring and the station name never share a place
  const st = name === 'sinusoid:mid' ? stationAt(net, tri, 'sin') : null;
  let best: CalloutSpot | null = null, bd = Infinity;
  for (const c of net.courses) {
    if (c.kind !== 's0' && c.kind !== 's1' && c.kind !== 's2') continue;
    for (let i = 0; i < c.pts.length; i++) {
      if (Math.abs(c.rho[i]! - band.rho) > band.tol) continue;
      const [x, y] = c.pts[i]!;
      if (st && Math.hypot(x - st[0], y - st[1]) < 3 * SINUSOID_RING_R) continue;
      const d = offSide(x, y);
      if (d < bd) { bd = d; best = { x, y, r: SINUSOID_RING_R, course: c.id }; }
    }
  }
  if (!best) throw new Error(`no sinusoid sample for ${name}`);
  return best;
}
