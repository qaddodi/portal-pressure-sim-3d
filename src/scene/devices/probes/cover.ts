// A device's solid body as an outline on the screen, for the label layer to leave the text out of (labels/probe-cover.ts): the tube rings' centres projected, offset either side by their radius in px.
import { Vector3 } from 'three';
import type { Ring } from '../tube-rings.ts';
import type { Pt, ScreenEnv } from './screen.ts';

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
