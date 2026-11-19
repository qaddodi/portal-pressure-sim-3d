// An active variceal bleed as the scope sees it (2D endo-bleed.js, drawn over the field each frame): a wet spot at the tear on a varix column, a spurt thrown into the lumen with drops falling from it,
// a rivulet running down the wall round the tube into a pool that lies flat at the bottom (the wedge between its two edges, widening as it fills), a red haze that thickens with the blood lost.
// The 2D painter fills radial gradients on a canvas; the charts' drawer fills flat shapes, so each gradient is a few nested flat ones (the same colours, the same geometry, the same motion).
// Every number of the picture comes from the copied modules (endo-motion.copied.js: the tear, the pool, the drops); the colours are the scope's own tokens.
import { scopeDrops, scopePool, inScopePool } from '../copied/endo-motion.copied.js';
import { bleedPulse } from '../copied/blood-slice.copied.js';
import { SCOPE_TOKENS } from '../copied/scope-tokens.copied.js';
import { parseColour, withAlpha, type Rgba } from '../../charts/colour.ts';
import type { Shape } from '../../charts/scene.ts';

const tk = (n: string): Rgba => parseColour((SCOPE_TOKENS as Record<string, string>)[n]!);
const frac = (x: number) => ((x % 1) + 1) % 1;
const smooth = (e0: number, e1: number, x: number) => { const u = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return u * u * (3 - 2 * u); };
const NMAIN = 20, NJET = 8, NE = 16;

/** The pool's edges sway: side +1 the right edge, -1 the left (endo-bleed.js sway). */
const sway = (t: number, rho: number, side: number) => (0.016 * Math.sin(rho * 9 + t * 0.9 + side * 2) + 0.01 * Math.sin(rho * 23 - t * 1.3 + side)) * Math.min(1, rho * 3);
/** The angle a pool edge leaves the centre at, rho of the way out (grow widens the wedge: the thin skirt). */
const edgeAng = (t: number, phi: number, grow: number, side: number, rho: number) => (side > 0 ? phi - grow + sway(t, rho, 1) : Math.PI - phi + grow - sway(t, rho, -1));

/** A ribbon along n points (P: flat x, y pairs), W[i] wide at each, as one closed outline (a tapered or swelling stream with no seams). */
export function ribbon(P: ArrayLike<number>, W: ArrayLike<number>, n: number): number[] {
  const out: number[] = [];
  for (let side = 0; side < 2; side++) {
    for (let s = 0; s < n; s++) {
      const i = side ? n - 1 - s : s, i0 = Math.max(0, i - 1) * 2, i1 = Math.min(n - 1, i + 1) * 2;
      const dx = P[i1]! - P[i0]!, dy = P[i1 + 1]! - P[i0 + 1]!, d = Math.hypot(dx, dy) || 1, w = W[i]! / 2;
      out.push(side ? P[i * 2]! + (dy / d) * w : P[i * 2]! - (dy / d) * w, side ? P[i * 2 + 1]! - (dx / d) * w : P[i * 2 + 1]! + (dx / d) * w);
    }
  }
  return out;
}

export interface BleedIn {
  cx: number; cy: number; R: number;
  /** the tear, px (on a varix column: scopeTear) */
  jx: number; jy: number;
  /** seconds: the model's clock (a paused bleed holds still) */
  t: number;
  /** 0..1: the bleed easing in or out */
  a: number;
  rate: number | undefined; fill: number; hr: number | undefined;
}

/** The bleed as flat shapes, to go inside the lumen's clip. */
export function bleedShapes(o: BleedIn): Shape[] {
  const { cx, cy, R, jx, jy, t, a, rate, fill, hr } = o;
  const out: Shape[] = [];
  if (a <= 0.003) return out;
  const jet = tk('scope-blood-jet'), fresh = tk('scope-blood-fresh'), pool = tk('scope-blood-pool'), edge = tk('scope-blood-pool-edge'), top = tk('scope-blood-pool-top'), haze = tk('scope-blood-haze');
  const white: Rgba = [1, 1, 1, 1];
  const A = (c: Rgba, k: number): Rgba => withAlpha(c, k * a);
  const spurt = smooth(25, 70, rate || 50), p = bleedPulse(t, hr) as number;
  const { phi } = scopePool(fill) as { phi: number };
  const tx = (jx - cx) / R, ty = (jy - cy) / R, th0 = Math.atan2(ty, tx), rho0 = Math.hypot(tx, ty);
  // the red haze over the view, thicker as the pool grows
  out.push({ k: 'rect', x: cx - R, y: cy - R, w: 2 * R, h: 2 * R, fill: A(haze, 0.04 + 0.2 * fill) });
  // blood on the wall: a rivulet runs from the tear round the tube (a little deeper as it goes), wider as it nears the pool, over a soft stain
  const span = phi - th0, far = 0.52 - 0.42 * fill, rhoEnd = Math.min(0.8, Math.max(0.4, far + 0.1));
  const stain = (x: number, y: number, r: number, k: number) => { out.push({ k: 'circle', cx: x, cy: y, r, fill: A(jet, 0.3 * k) }, { k: 'circle', cx: x, cy: y, r: r * 0.55, fill: A(jet, 0.3 * k) }); };
  if (span > 0.06) {
    const MAIN = new Float64Array(2 * (NMAIN + 1)), W = new Float64Array(NMAIN + 1), WIDE = new Float64Array(NMAIN + 1);
    for (let i = 0; i <= NMAIN; i++) {
      const u = i / NMAIN, ang = th0 + span * u, rho = rho0 + (rhoEnd - rho0) * u + 0.006 * Math.sin(u * 9 + 1.7);
      MAIN[2 * i] = cx + Math.cos(ang) * rho * R; MAIN[2 * i + 1] = cy + Math.sin(ang) * rho * R;
    }
    const flow = 0.7 + 0.3 * spurt;
    for (let i = 0; i <= NMAIN; i += 2) stain(MAIN[2 * i]!, MAIN[2 * i + 1]!, R * (0.08 + 0.07 * (i / NMAIN)), 1.1);
    for (let i = 0; i <= NMAIN; i++) { const w = R * (0.032 + 0.05 * (i / NMAIN)) * flow * (1 + 0.16 * Math.sin(i * 1.3 + t * 2.1)); W[i] = w; WIDE[i] = w * 1.7; }
    out.push({ k: 'path', pts: ribbon(MAIN, WIDE, NMAIN + 1), closed: true, fill: A(jet, 0.35) });
    out.push({ k: 'path', pts: ribbon(MAIN, W, NMAIN + 1), closed: true, fill: A(jet, 1) });
    // the scope's light on its wet inner edge
    const edgePts: number[] = [];
    for (let i = 0; i <= NMAIN; i++) {
      const qx = MAIN[2 * i]!, qy = MAIN[2 * i + 1]!, dx = cx - qx, dy = cy - qy, n = Math.hypot(dx, dy) || 1, w = W[i]! * 0.22;
      edgePts.push(qx + (dx / n) * w, qy + (dy / n) * w);
    }
    out.push({ k: 'path', pts: edgePts, pen: { color: A(fresh, 0.55), w: Math.max(1, R * 0.006), cap: 'round', join: 'round' } });
    const run: number[] = [];
    for (let i = 0; i <= NMAIN; i++) run.push(MAIN[2 * i]!, MAIN[2 * i + 1]!);
    out.push({ k: 'path', pts: run, pen: { color: A(fresh, 0.3), w: R * 0.014, dash: [R * 0.05, R * 0.1], cap: 'butt' } });
  }
  // the pool: the wedge from the centre between the two edges; its far end fades into the dark (the less blood, the nearer the lens it begins), dark where far and brighter toward the lens
  const sector = (r0: number, r1: number, g: number): number[] => {
    const pts: number[] = [];
    const n0 = Math.max(2, Math.round(NE * (r1 - r0) / 1.04));
    for (let i = 0; i <= n0; i++) { const rho = r0 + ((r1 - r0) * i) / n0, ang = edgeAng(t, phi, g, 1, rho); pts.push(cx + Math.cos(ang) * rho * R, cy + Math.sin(ang) * rho * R); }
    const a0 = edgeAng(t, phi, g, 1, r1), a1 = edgeAng(t, phi, g, -1, r1), arc = Math.max(3, Math.round(Math.abs(a1 - a0) * 8));
    for (let i = 1; i < arc; i++) { const ang = a0 + ((a1 - a0) * i) / arc; pts.push(cx + Math.cos(ang) * r1 * R, cy + Math.sin(ang) * r1 * R); }
    for (let i = n0; i >= 0; i--) { const rho = r0 + ((r1 - r0) * i) / n0, ang = edgeAng(t, phi, g, -1, rho); pts.push(cx + Math.cos(ang) * rho * R, cy + Math.sin(ang) * rho * R); }
    return pts;
  };
  const f0 = Math.max(0.02, far - 0.1), RMAX = 1.04;
  out.push({ k: 'path', pts: sector(f0, RMAX, 0.07), closed: true, fill: A(edge, 0.3) });
  out.push({ k: 'path', pts: sector(f0, far + 0.2, 0), closed: true, fill: A(pool, 0.5) });
  out.push({ k: 'path', pts: sector(far + 0.2, RMAX, 0), closed: true, fill: A(pool, 1) });
  out.push({ k: 'path', pts: sector(0.5, RMAX, 0), closed: true, fill: A(top, 0.55) });
  out.push({ k: 'path', pts: sector(0.92, RMAX, 0), closed: true, fill: A(edge, 0.7) });
  // brighter toward the lens, and the scope's light as one soft patch low on the surface
  const lens = sector(Math.max(f0, 0.45), RMAX, 0);
  out.push({ k: 'path', pts: lens, closed: true, fill: A(fresh, 0.12) });
  const gx = cx + R * 0.05 + Math.sin(t * 0.9) * R * 0.012, gy = cy + R * 0.7;
  out.push({ k: 'path', pts: ellipse(gx, gy, R * 0.2, R * 0.08), closed: true, fill: A(white, 0.18) });
  // ripples: arcs about the centre moving out across the surface
  for (let i = 0; i < 4; i++) {
    const u = frac(t * 0.16 + i / 4), rho = 0.16 + 0.82 * u, al = 0.4 * Math.pow(1 - u, 0.8) * smooth(0, 0.15, u);
    const arc: number[] = [];
    for (let j = 0; j <= 24; j++) { const ang = phi + ((Math.PI - 2 * phi) * j) / 24; arc.push(cx + Math.cos(ang) * rho * R, cy + Math.sin(ang) * rho * R); }
    out.push({ k: 'path', pts: arc, pen: { color: A(fresh, al), w: Math.max(1, R * 0.005) } });
  }
  // its wet edges, where the surface meets the wall: a thin bright line, from where the pool begins
  for (const side of [1, -1]) {
    const e: number[] = [];
    for (let i = 0; i < NE; i++) { const rho = ((i + 1) / NE) * 1.04; if (rho > far + 0.08) { const ang = edgeAng(t, phi, 0, side, rho); e.push(cx + Math.cos(ang) * rho * R, cy + Math.sin(ang) * rho * R); } }
    if (e.length >= 4) out.push({ k: 'path', pts: e, pen: { color: A(fresh, 0.5), w: Math.max(1, R * 0.006) } });
  }
  // the spurt: a tapered stream from the tear toward the axis, bending down, thinning to nothing at its tip
  const into = Math.atan2(-ty, -tx);
  if (spurt > 0) {
    const k = Math.min(1.6, Math.max(0.6, (rate || 50) / 90)), v = (0.2 + 0.55 * p) * k;
    const J = new Float64Array(2 * (NJET + 1)), WJ = new Float64Array(NJET + 1);
    for (let i = 0; i <= NJET; i++) {
      const s = (i / NJET) * 0.22;
      J[2 * i] = jx + Math.cos(into) * v * s * R; J[2 * i + 1] = jy + (Math.sin(into) * v * s + 0.75 * s * s) * R;
      WJ[i] = R * 0.026 * (1 - i / (NJET + 1)) * (0.7 + 0.3 * p);
    }
    out.push({ k: 'path', pts: ribbon(J, WJ, NJET + 1), closed: true, fill: A(fresh, spurt * (0.55 + 0.45 * p) * 0.8) });
  }
  // the drops: short, fat streaks along their path
  const drops = scopeDrops(t, rate, hr, { x: tx, y: ty, th: th0 }, null) as number[][];
  for (const d of drops) {
    const al = d[3]!, r = d[2]!, vx = d[4]!, vy = d[5]!;
    if (al <= 0.01) continue;
    const X = jx + d[0]! * R, Y = jy + d[1]! * R;
    if (Math.hypot(X - cx, Y - cy) > R || inScopePool((X - cx) / R, (Y - cy) / R, phi)) continue;   // (gone into the pool)
    out.push({ k: 'line', x1: X - vx * 0.02 * R, y1: Y - vy * 0.02 * R, x2: X, y2: Y, pen: { color: A(jet, al * 0.9), w: Math.max(1.5, 2 * r * R), cap: 'round' } });
  }
  // the tear: the mucosa stained round it, and the wet spot itself, at one steady size
  stain(jx, jy, R * (0.07 + 0.02 * p), 1.2);
  const wr = R * (0.021 + 0.007 * p);
  out.push({ k: 'circle', cx: jx, cy: jy, r: wr, fill: A(edge, 0.85) });
  out.push({ k: 'circle', cx: jx, cy: jy, r: wr * 0.86, fill: A(jet, 1) });
  out.push({ k: 'circle', cx: jx - 0.1 * wr, cy: jy - 0.16 * wr, r: wr * 0.5, fill: A(fresh, 1) });
  out.push({ k: 'circle', cx: jx - 0.24 * wr, cy: jy - 0.28 * wr, r: wr * 0.2, fill: A(white, 0.4) });
  return out;
}

function ellipse(cx: number, cy: number, rx: number, ry: number, n = 20): number[] {
  const pts: number[] = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; pts.push(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry); }
  return pts;
}
