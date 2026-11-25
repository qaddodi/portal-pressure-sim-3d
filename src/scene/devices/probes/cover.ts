// A device's solid body as an outline on the screen, for the label layer to leave the text out of (labels/probe-cover.ts): the tube rings' centres projected, offset either side by their radius in px.
import { Vector3 } from 'three';
import type { Ring } from '../tube-rings.ts';
import type { Pt, ScreenEnv } from './screen.ts';
import type { Box } from '../../labels/geometry.ts';
import { addClaim } from '../../labels/probe-claims.ts';

export interface RingRun { rings: readonly Ring[]; from: number; to: number }   // rings from..to inclusive
const P: Pt = { x: 0, y: 0 }, V = new Vector3();
/** How far inside the drawn edge the hole stops, px: the ink outline covers the rest. */
export const COVER_INSET = 1;
const cx: number[] = [], cy: number[] = [], cr: number[] = [];

/** The outline of the runs, one after the other, written into `out` as x, y pairs (left side out, right side back). `sc`: px per scene unit at the device. */
export function ringsOutline(env: ScreenEnv, runs: readonly RingRun[], sc: number, out: number[]): number[] {
  cx.length = cy.length = cr.length = 0;
  for (const run of runs) for (let i = run.from; i <= run.to; i++) {
    const g = run.rings[i];
    if (!g) continue;
    env.project(V.copy(g.c), P);
    cx.push(P.x); cy.push(P.y); cr.push(Math.max(0.5, g.r * sc - COVER_INSET));
  }
  const n = cx.length;
  out.length = 0;
  if (n < 2) return out;
  const nx: number[] = [], ny: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    let dx = cx[b]! - cx[a]!, dy = cy[b]! - cy[a]!;
    const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    nx.push(-dy); ny.push(dx);
  }
  for (let i = 0; i < n; i++) out.push(cx[i]! + nx[i]! * cr[i]!, cy[i]! + ny[i]! * cr[i]!);
  for (let i = n - 1; i >= 0; i--) out.push(cx[i]! - nx[i]! * cr[i]!, cy[i]! - ny[i]! * cr[i]!);
  return out;
}

/** The room a tube device's body takes on the screen, as claim boxes (labels/probe-claims.ts): the rings' centres projected, a box every few rings, each as wide as the tube at that stretch plus `pad` px. The scope's shaft
 *  was drawn over the station names and callouts (capture 52ef8e63, Endoscopy 3 "Varices 18.4 mmHg" lost its V; Ten years 10 "3.1 mm"); with its body claimed, the solver places them clear of it, as it does for the probe. */
export function ringsClaims(env: ScreenEnv, runs: readonly RingRun[], sc: number, out: Box[], pad = 6, every = 5): void {
  let n = 0, x0 = 0, y0 = 0, r0 = 0, xe = 0, ye = 0, re = 0;
  for (const run of runs) for (let i = run.from; i <= run.to; i++) {
    const g = run.rings[i];
    if (!g) continue;
    env.project(V.copy(g.c), P);
    const r = g.r * sc;
    if (n % every === 0) { x0 = P.x; y0 = P.y; r0 = r; }
    else if (n % every === every - 1) addClaim(out, x0, y0, P.x, P.y, Math.max(r0, r) + pad);
    xe = P.x; ye = P.y; re = r; n++;
  }
  if (n % every > 1 || (n > 0 && n < every)) addClaim(out, x0, y0, xe, ye, Math.max(r0, re) + pad);   // (the last stretch, shorter than a group)
}
