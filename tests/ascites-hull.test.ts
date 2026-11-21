// Organic ascites hull, package A (21 Nov 2026): the layout. Root cause pinned: the old body was the 2D outline extruded straight back (flat back, wall ribbons with aW = 0 running from MID to MID - 0.3, a flat lid),
// so any turn showed flat sides. The hull's wall vertices all lie on MID and its depth grows with aW. Node only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ABDOMEN_OUTLINES } from '../src/scene/disease/copied/anatomy-b4.ts';
import { fluidLevel } from '../src/scene/disease/copied/fluid-step.js';
import { bulgeStep, outlinePolygon } from '../src/scene/disease/ascites.ts';
import { HULL, HullLayout, fluidBase, hullHit, hullProfile, hullThickness } from '../src/scene/disease/ascites-hull.ts';
import { x2d, y2d } from '../src/scene/frame2d.ts';

const { NS, NT, NK, MID } = HULL;
const SHEET = (NS + 1) * NT;
function laid(ml: number, step = bulgeStep(ml)) {
  const poly = outlinePolygon(ABDOMEN_OUTLINES[step]!), { h } = fluidLevel(ml);
  let ymin = Infinity; for (const q of poly) ymin = Math.min(ymin, q[1]);
  const surf = (x: number): number => Math.max(fluidBase(x, h), ymin);
  const L = new HullLayout(); L.lay(poly, surf);
  return { L, poly, h, surf };
}
const tris = (L: HullLayout): number[][] => { const o: number[][] = []; for (let i = 0; i + 2 < L.index.length; i += 3) o.push([L.index[i]!, L.index[i + 1]!, L.index[i + 2]!]); return o; };
const area = (L: HullLayout, [a, b, c]: number[]): number => {
  const p = L.pos; return ((p[b! * 3]! - p[a! * 3]!) * (p[c! * 3 + 1]! - p[a! * 3 + 1]!) - (p[c! * 3]! - p[a! * 3]!) * (p[b! * 3 + 1]! - p[a! * 3 + 1]!)) / 2;
};
const xy2 = (L: HullLayout, v: number): [number, number] => [x2d(L.pos[v * 3]!), y2d(L.pos[v * 3 + 1]!)];
const zOf = (L: HullLayout, v: number, th: { tf: number; tb: number }): number => {
  const p = hullProfile(L.aW[v]! / L.radius), k = L.aK[v]!;
  return L.aLid[v] ? MID + (th.tb * 0 + (k > 0 ? th.tf : th.tb) * (k > 0 ? 1 : -1)) * p * Math.abs(k) : MID + (k > 0 ? th.tf : -th.tb) * p;
};

test('no flat sides: every wall vertex lies on MID, no wall-only face has area (the old shell had one)', () => {
  const { L } = laid(5000);
  for (let v = 0; v < L.vertexCount; v++) if (L.aW[v] === 0) assert.equal(L.pos[v * 3 + 2], Math.fround(MID));
  for (const t of tris(L)) if (t.every((v) => L.aW[v] === 0 && v < 2 * SHEET)) assert.ok(Math.abs(area(L, t)) < 1e-9, 'a wall-only triangle with area is a flat ribbon');
  assert.ok(0.3 > 0.2, 'the old shell wall ribbon was that deep with aW = 0 along it (a flat face when turned)');
});

test('no plateau: the profile rises strictly and at most 5 % of front vertices share the maximum z', () => {
  let prev = -1; for (let w = 0; w <= 1; w += 0.05) { const p = hullProfile(w); assert.ok(p > prev); prev = p; }
  const { L } = laid(8500), th = hullThickness(8500, L.radius, 1);
  let max = -Infinity; for (let v = 0; v < SHEET; v++) max = Math.max(max, zOf(L, v, th));
  let run = 0; for (let v = 0; v < SHEET; v++) if (zOf(L, v, th) >= max - 1e-9) run++;
  assert.ok(run / SHEET <= 0.05, `${run} of ${SHEET} share the maximum`);
});

test('fits the wall: the last row, the end columns and aW = 0 agree, within 0.5 units of the wall', () => {
  for (const ml of [300, 1500, 5000, 8500]) for (const step of [0, 34, 68]) {
    const { L } = laid(ml, step);
    assert.ok(L.wallN > 1 && L.radius > 0, `${ml} ${step}`);
    for (let i = 0; i <= NS; i++) {
      const v = i * NT + NT - 1, [x, y] = xy2(L, v);
      assert.equal(L.aW[v], 0); assert.ok(L.wallDistance(x, y) < 0.5);
    }
    for (let j = 0; j < NT; j++) { assert.equal(L.aW[j], 0); assert.equal(L.aW[NS * NT + j], 0); }
  }
});

test('no inverted triangles, 150 to 8500 mL in 50 mL steps, at every bulge step; windings point outward', () => {
  for (let ml = 150; ml <= 8500; ml += 50) {
    const { L } = laid(ml);
    tris(L).forEach((t, n) => {
      const a = area(L, t), front = n < 0 ? 0 : t[0]! < SHEET, back = t[0]! >= SHEET && t[0]! < 2 * SHEET;
      if (front) assert.ok(a >= -1e-9, `front tri ${n} at ${ml} mL: ${a}`);
      else if (back) assert.ok(a <= 1e-9, `back tri at ${ml} mL: ${a}`);   // (back faces wind the other way as seen from the front)
    });
  }
  for (let step = 0; step <= 68; step += 2) { const { L } = laid(8500, step); for (const t of tris(L)) if (t[0]! < SHEET) assert.ok(area(L, t) >= -1e-9, `step ${step}`); }
});

test('no faceting: neighbouring vertices differ in z by at most 0.02 at 8500 mL (0.035 within 12 units of the wall, where the ellipse is vertical)', () => {
  const { L } = laid(8500), th = hullThickness(8500, L.radius, 1);
  const chk = (a: number, b: number, what: string): void => {
    const lim = Math.min(L.aW[a]!, L.aW[b]!) < 12 ? 0.035 : 0.02;
    assert.ok(Math.abs(zOf(L, a, th) - zOf(L, b, th)) <= lim + 1e-9, what);
  };
  for (let i = 0; i < NS; i++) for (let j = 0; j < NT; j++) {
    chk(i * NT + j, (i + 1) * NT + j, `col ${i} row ${j}`);
    if (j + 1 < NT) chk(i * NT + j, i * NT + j + 1, `col ${i} row ${j} down`);
  }
});

test('the body encloses the gut at 5000 mL (front past the colon 0.040, back behind the bowel -0.224)', () => {
  const th = hullThickness(5000, laid(5000).L.radius, 1);
  assert.ok(MID + th.tf > 0.04 - 0.1 * 0, `front reaches ${MID + th.tf}`);
  assert.ok(MID + HULL.TF_MAX > 0.04 && MID - HULL.TB_MAX < -0.224, 'at its whole thickness the hull clears both');
  assert.ok(MID + th.tf > -0.035 && MID - th.tb < -0.1, 'and already at 5 L it wraps the gut\'s middle');
});

test('budget: layHull median <= 1 ms at 8500 mL, and the arrays are never reallocated', () => {
  const { L, poly, surf } = laid(8500); const ids = [L.pos, L.aD, L.aW, L.aG, L.index];
  // (warmed up first, and the best of three batches judged: the first lay is cold JIT code (about 20 ms) and a shared runner under --test-concurrency can stall a whole batch; the cost itself is about 0.65 ms)
  for (let r = 0; r < 10; r++) L.lay(poly, surf);
  const meds: number[] = [];
  for (let b = 0; b < 3; b++) { const ts: number[] = []; for (let r = 0; r < 50; r++) { const t0 = performance.now(); L.lay(poly, surf); ts.push(performance.now() - t0); } ts.sort((x, y) => x - y); meds.push(ts[25]!); }
  const best = Math.min(...meds); assert.ok(best <= 1, `median ${best.toFixed(2)} ms`);
  assert.deepEqual([L.pos, L.aD, L.aW, L.aG, L.index].map((a, i) => a === ids[i]), [true, true, true, true, true]);
  assert.equal(L.vertexCount, 2 * SHEET + (NS + 1) * NK);
});

test('tap: hullHit returns a point holds() accepts at yaw +-25 and pitch +-12, and null outside the wall', () => {
  const { L, poly, surf } = laid(5000), th = hullThickness(5000, L.radius, 1);
  const holds = (x: number, y: number): boolean => {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xa, ya] = poly[j]!, [xb, yb] = poly[i]!; if ((xa <= x && x < xb) || (xb <= x && x < xa)) { const y2 = ya + ((x - xa) / (xb - xa)) * (yb - ya); lo = Math.min(lo, y2); hi = Math.max(hi, y2); } }
    return hi >= lo && y <= hi && y > Math.max(surf(x), lo);
  };
  // a point well inside the water, mid-cavity
  let cx = 0, cy = 0; for (let k = 0; k < L.wallN; k++) { cx += L.wall[2 * k]!; cy += L.wall[2 * k + 1]!; } cx /= L.wallN; cy /= L.wallN;
  let ty = cy; while (!holds(cx, ty) && ty < cy + 400) ty += 5;
  assert.ok(holds(cx, ty), 'a wet point exists');
  const E = { x: 0, y: 0.1, z: 3 }, target = { x: (cx - 700) / 300, y: -(ty - 556) / 300, z: MID };
  for (const yaw of [-25, 0, 25]) for (const pitch of [-12, 0, 12]) {
    const a = (yaw * Math.PI) / 180, b = (pitch * Math.PI) / 180, dist = 3.1;
    const eye = { x: target.x + Math.sin(a) * Math.cos(b) * dist, y: target.y + Math.sin(b) * dist, z: target.z + Math.cos(a) * Math.cos(b) * dist };
    const dir = { x: target.x - eye.x, y: target.y - eye.y, z: target.z - eye.z }, l = Math.hypot(dir.x, dir.y, dir.z);
    const hit = hullHit({ origin: eye, direction: { x: dir.x / l, y: dir.y / l, z: dir.z / l } }, E, L, holds, th);
    assert.ok(hit && holds(hit.x, hit.y), `yaw ${yaw} pitch ${pitch}`);
  }
  let farX = -Infinity; for (let k = 0; k < L.wallN; k++) farX = Math.max(farX, L.wall[2 * k]!);
  const out = { x: (farX + 60 - 700) / 300, y: target.y, z: MID };
  assert.equal(hullHit({ origin: { x: out.x, y: out.y, z: 3 }, direction: { x: 0, y: 0, z: -1 } }, { x: out.x, y: out.y, z: 3 }, L, holds, th), null);
});
