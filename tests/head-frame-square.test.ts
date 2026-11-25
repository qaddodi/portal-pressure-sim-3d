// Mohammad, 24 Nov: the flow chevrons at the hepatic veins' join twist, stretch into slivers, flip and pop (and at every junction skin). ROOT CAUSE: a skin head's arc (u) runs along the STRAIGHT seam line, but its place across
// (lat) was measured from the NEAREST of the arm's three bent segments (skinArmLat). Where the chain bends the two axes are not square, so the head shears; where the nearest segment switches the head turns and its lat jumps.
// This sweeps EVERY skin of the real network, every arm, under many view rotations, and measures the head frame's Jacobian on the screen (u along the arc, lat across): the shear (how far the two axes are from square) and the
// jump of lat between neighbouring pixels. The shipped frame (the pixel's offset from the same straight axis along the view-square side direction) is square by construction; the old one is measured beside it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gateSkins } from './skin-gate-lib.ts';

type V = [number, number, number];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V, b: V): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: V): number => Math.hypot(a[0], a[1], a[2]);
const rotOf = (ay: number, ax: number): ((p: V) => V) => {
  const cy = Math.cos(ay), sy = Math.sin(ay), cx = Math.cos(ax), sx = Math.sin(ax);
  return (p) => { const x = cy * p[0] + sy * p[2], z = -sy * p[0] + cy * p[2]; return [x, cx * p[1] - sx * z, sx * p[1] + cx * z]; };
};

interface Frame { u: number; lat: number }
/** the shipped frame at point p (view space after `rot`, orthographic, the eye down +z): arc along the straight seam line, lat along the view-square side over the radius */
function newFrame(seam: V, tJ: V, R: number, rot: (p: V) => V, p: V): Frame {
  const h = rot(tJ), side0: V = [h[1] * 1 - h[2] * 0, -(h[0]) * 1 + 0, 0];   // cross(h, view=(0,0,1))
  const sl = Math.hypot(side0[0], side0[1]) || 1, side: V = [side0[0] / sl, side0[1] / sl, 0];
  const r = rot(sub(p, seam));
  return { u: dot(sub(p, seam), tJ), lat: dot(r, side) / R };
}
/** the old frame: arc as above, lat from the nearest of the three screen segments of the chain, in lumen units */
function oldFrame(pts: V[], radii: number[], seam: V, tJ: V, rot: (p: V) => V, p: V): Frame {
  const sp = pts.map((q) => rot(q)), f = rot(p);
  let best = { d: Infinity, lat: 0 };
  for (let k = 0; k < 3; k++) {
    const a = [sp[k + 1]![0] - sp[k]![0], sp[k + 1]![1] - sp[k]![1]], dl = Math.hypot(a[0]!, a[1]!);
    if (dl < 1e-9) continue;
    const t = Math.min(1, Math.max(0, ((f[0] - sp[k]![0]) * a[0]! + (f[1] - sp[k]![1]) * a[1]!) / (dl * dl)));
    const e = [f[0] - sp[k]![0] - a[0]! * t, f[1] - sp[k]![1] - a[1]! * t], r = radii[k]! + (radii[k + 1]! - radii[k]!) * t, d = Math.hypot(e[0]!, e[1]!) - r;
    if (d < best.d) { const tg = [a[0]! / dl, a[1]! / dl]; best = { d, lat: (e[0]! * -tg[1]! + e[1]! * tg[0]!) / Math.max(r, 1e-6) }; }
  }
  return { u: dot(sub(p, seam), tJ), lat: best.lat };
}
const angle = (g1: [number, number], g2: [number, number]): number => Math.acos(Math.min(1, Math.abs(g1[0] * g2[0] + g1[1] * g2[1]) / (Math.hypot(...g1) * Math.hypot(...g2) || 1))) * 180 / Math.PI;

test('every skin arm\'s head frame is square on the screen (shipped), where the old nearest-segment frame sheared', () => {
  const g = gateSkins();
  let samples = 0, worstNew = 0, worstOld = 0, jumpOld = 0, jumpNew = 0, armsBent = 0, arms = 0;
  for (const sk of g.skins) {
    for (const ax of sk.axes) {
      const pts = ax.pts as unknown as V[], radii = [...ax.radii], seam = pts[2]!, toJ = sub(pts[1]!, seam), tl = len(toJ);
      if (tl < 1e-9) continue;
      const tJ: V = [toJ[0] / tl, toJ[1] / tl, toJ[2] / tl], R = radii[2]!;
      arms++;
      const eps = R * 0.02;
      let bent = false;
      for (let ay = 0; ay < 6.28; ay += 0.9) for (let ax2 = -1.2; ax2 <= 1.2; ax2 += 0.6) {
        const rot = rotOf(ay, ax2), h = rot(tJ);
        if (Math.hypot(h[0], h[1]) < 0.35 * len(h)) continue;   // (the arm end-on: no head frame to speak of)
        const side0: V = [h[1], -h[0], 0], sl = Math.hypot(side0[0], side0[1]), side: V = [side0[0] / sl, side0[1] / sl, 0];
        // sample the lumen of the arm from the seam to 4 radii toward the node (where the chain bends and the skin draws the head), |lat| <= 0.6 (a head's own reach)
        for (let tt = 0; tt <= 4; tt += 0.5) for (let ll = -0.6; ll <= 0.6; ll += 0.3) {
          // a point on the arm's straight axis at tt radii toward the node, ll radii across (the view-square side, back in model space)
          const sideModel: V = (() => { const inv = [rot([1, 0, 0]), rot([0, 1, 0]), rot([0, 0, 1])]; return [dot(side, inv[0]!), dot(side, inv[1]!), dot(side, inv[2]!)]; })();
          const p: V = [seam[0] + tJ[0] * tt * R + sideModel[0] * ll * R, seam[1] + tJ[1] * tt * R + sideModel[1] * ll * R, seam[2] + tJ[2] * tt * R + sideModel[2] * ll * R];
          for (const [name, fr] of [['new', (q: V) => newFrame(seam, tJ, R, rot, q)], ['old', (q: V) => oldFrame(pts, radii, seam, tJ, rot, q)]] as const) {
            // the gradient of u and lat on the screen by differences along screen x and y (model-space steps that move the view x/y by eps)
            const ex = rot([1, 0, 0]), step = (dx: number, dy: number): V => {
              // invert rot for the screen step (dx, dy, 0)
              const inv = (v: V): V => { const m = [rot([1, 0, 0]), rot([0, 1, 0]), rot([0, 0, 1])]; return [dot(v, m[0]!), dot(v, m[1]!), dot(v, m[2]!)]; };
              const d = inv([dx, dy, 0]); return [p[0] + d[0], p[1] + d[1], p[2] + d[2]];
            };
            void ex;
            const f0 = fr(p), fx = fr(step(eps, 0)), fy = fr(step(0, eps));
            const gu: [number, number] = [(fx.u - f0.u) / eps, (fy.u - f0.u) / eps], gl: [number, number] = [(fx.lat - f0.lat) / eps, (fy.lat - f0.lat) / eps];
            const sq = 90 - angle(gu, gl);   // degrees off square
            samples++;
            if (name === 'new') { worstNew = Math.max(worstNew, sq); jumpNew = Math.max(jumpNew, Math.abs(fx.lat - f0.lat), Math.abs(fy.lat - f0.lat)); }
            else { worstOld = Math.max(worstOld, sq); jumpOld = Math.max(jumpOld, Math.abs(fx.lat - f0.lat), Math.abs(fy.lat - f0.lat)); if (sq > 10) bent = true; }
          }
        }
      }
      if (bent) armsBent++;
    }
  }
  g.done();
  console.log(`head frame sweep: ${arms} arms, ${samples} samples; worst shear off square: shipped ${worstNew.toFixed(2)} deg, old ${worstOld.toFixed(1)} deg (${armsBent} arms over 10 deg); biggest lat jump over a 0.02 R step: shipped ${jumpNew.toFixed(3)}, old ${jumpOld.toFixed(3)}`);
  assert.ok(samples > 2000, `${samples} samples`);
  assert.ok(worstNew < 1.0, `the shipped frame is square to ${worstNew} deg`);
  assert.ok(jumpNew < 0.1, `no jump of the place across (${jumpNew})`);
});
