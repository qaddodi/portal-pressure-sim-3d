// The sinusoid on a portrait screen (2D: sinusoid-view.js ensureGeo / layoutEnds / stepView): top to bottom, the portal end up, everything on the plane turning together; the turn follows the
// dive; the ends' arrows and the traffic follow the screen; the wedge's wash reaches the shader. No GPU here: the numbers and the uniforms.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Vector3, Vector4 } from 'three';
import { createShared } from '../src/scene/materials/cel.ts';
import { SinusoidView, U } from '../src/scene/sinusoid/view.ts';
import { PORTRAIT_ANGLE, acrossUm, endsFor, framePoint, glideTurn, isPortrait, planePoint, restScale, turnAt, xkFor } from '../src/scene/sinusoid/portrait.ts';
import { sinusoidBox, sinusoidShot, SINUSOID_L } from '../src/scene/lobule/shots.ts';
import { SIN_SCALE, sinusoidWorld } from '../src/scene/lobule/frames.ts';
import { FILL } from '../src/scene/camera/room.ts';
import type { SinusoidTargets } from '../src/scene/lobule/model.ts';

const targets = (): SinusoidTargets => ({ por: 1, col: 0, bm: 0, mv: 1, act: 0, lum: 1, pinch: 0, v: 1, filt: 1, prot: 1 });
const xk = (v: SinusoidView) => v.nameGeom.xk;
const open = (v: SinusoidView) => { v.setVisible(true); v.snapTargets(targets()); v.update(0); return v; };
const run = (v: SinusoidView, from: number, ms: number) => { for (let t = from; t <= from + ms; t += 16) v.update(t); return from + ms; };

test('2D\'s rule: a stage narrower than 0.95 of its height is a portrait stage', () => {
  assert.equal(isPortrait(390, 844), true);
  assert.equal(isPortrait(820, 1180), true);
  assert.equal(isPortrait(1440, 900), false);
  assert.equal(isPortrait(900, 900), false);
  assert.equal(isPortrait(0.95 * 1000, 1000), false, 'exactly 0.95 is still wide');
  assert.equal(isPortrait(0.95 * 1000 - 1, 1000), true);
  assert.ok(Math.abs(xkFor(true) - 12) < 12 && Math.abs(xkFor(false) - 22) < 12, 'near the wanted places, moved onto bare lining');
});

test('the plane\'s turn puts the portal end at the top and 2D\'s upper lining on the right (2D: ang = PI/2 on a y-down screen)', () => {
  const a = PORTRAIT_ANGLE;
  const along = framePoint(10, 0, 1, a), down = framePoint(0, 5, 1, a);
  assert.ok(Math.abs(along[0]) < 1e-12 && along[1] < 0, 'positive x (toward the central vein) runs DOWN the screen');
  assert.ok(down[0] < 0 && Math.abs(down[1]) < 1e-12, 'the shader\'s +y (the lower lining) is on the LEFT: the upper lining (stellate cell, fenestrae) on the right, as 2D names it');
  const flat = framePoint(10, 5, 1, 0);
  assert.deepEqual([flat[0], flat[1]], [10, -5], 'wide: x right, the shader\'s y down');
  for (const ang of [0, a, a / 2]) { const p = framePoint(12.5, -3.25, U, ang), q = planePoint(p[0], p[1], U, ang); assert.ok(Math.abs(q.x - 12.5) < 1e-9 && Math.abs(q.y + 3.25) < 1e-9, `round trip at ${ang}`); }
});

test('the view turns its plane with setPortrait: everything drawn on it is in the one group, so it turns together', () => {
  const v = open(new SinusoidView(createShared()));
  assert.equal(v.group.rotation.z, 0);
  v.setPortrait(true);
  assert.equal(v.isPortrait, true);
  run(v, 16, 3000);
  assert.ok(Math.abs(v.group.rotation.z - PORTRAIT_ANGLE) < 1e-9, `turned to ${PORTRAIT_ANGLE}, is ${v.group.rotation.z}`);
  assert.equal(xk(v), xkFor(true), 'the Kupffer cell stands nearer the middle on a tall screen');
  v.setPortrait(false);
  run(v, 3100, 3000);
  assert.equal(v.group.rotation.z, 0); assert.equal(xk(v), xkFor(false));
});

test('anchors turn with the plane: in a portrait the portal end is above the central vein and the lower names left of the upper', () => {
  const v = open(new SinusoidView(createShared()));
  v.setPortrait(true); run(v, 16, 3000);
  const a = (n: string) => v.anchor(n);
  assert.ok(a('in')[1] > a('lumen')[1] && a('lumen')[1] > a('out')[1], 'portal venule, lumen, central vein, top to bottom');
  assert.ok(Math.abs(a('in')[0]) < 1e-9 && Math.abs(a('out')[0]) < 1e-9, 'the ends on the axis');
  assert.ok(a('hsc')[0] > a('lumen')[0] && a('fen')[0] > a('lumen')[0], 'the stellate cell and the fenestrae in the right plate, as 2D\'s tall layout');
  assert.ok(a('disse')[0] < a('lumen')[0] && a('kup')[0] < a('lumen')[0] + 1e-9 && a('lymph')[0] < a('lumen')[0], 'the space of Disse, the lymph and the Kupffer cell on the left (2D layoutTall)');
  assert.ok(a('hep')[0] > a('lumen')[0], 'the hepatocyte named in the right plate, with the stellate cell');
  // micrometres back from a frame point, whatever the turn
  const hsc = a('hsc'), m = v.micrometres(hsc[0], hsc[1]);
  assert.ok(m.y < 0 && Math.abs(m.x) < 200, 'the stellate cell is on the shader\'s upper (y < 0) side');
  const w = open(new SinusoidView(createShared()));
  assert.ok(w.anchor('disse')[1] > w.anchor('lumen')[1] && w.anchor('hep')[1] < w.anchor('lumen')[1], 'wide: Disse in the upper plate, the hepatocyte in the lower, as 2D\'s wide layout names them');
});

test('the turn follows the dive: the lobule turns into the tall view as the camera flies in, and out by the same frames reversed', () => {
  const T = PORTRAIT_ANGLE;
  assert.equal(turnAt(T, null), T); assert.equal(turnAt(T, 0), 0); assert.equal(turnAt(T, 1), T);
  assert.ok(Math.abs(turnAt(T, 0.5) - T / 2) < 1e-12);
  assert.equal(turnAt(0, 0.7), 0, 'a wide screen does not turn');
  const v = open(new SinusoidView(createShared()));
  v.setPortrait(true); run(v, 16, 3000);
  // flying in
  const seen: number[] = [];
  for (let g = 0; g <= 1.0001; g += 0.25) { v.setDive(g); v.update(2000 + g * 100); seen.push(v.group.rotation.z); }
  assert.deepEqual(seen.map((x) => +(x / T).toFixed(6)), [0, 0.25, 0.5, 0.75, 1], 'the turn is the dive\'s share of the full turn');
  v.setDive(null); v.update(3000);
  assert.ok(Math.abs(v.group.rotation.z - T) < 1e-9, 'landed: at rest it is the target');
  // flying out the same way: the same angle at the same share
  const back: number[] = [];
  for (let g = 1; g >= -1e-9; g -= 0.25) { v.setDive(Math.max(0, g)); v.update(4000 + (1 - g) * 100); back.push(v.group.rotation.z); }
  assert.deepEqual(back.map((x) => +(x / T).toFixed(6)).reverse(), [0, 0.25, 0.5, 0.75, 1]);
});

test('a phone turned in the view glides (critically damped, no overshoot); with Reduce Motion it is there at once', () => {
  let a = 0, w = 0, over = false;
  for (let i = 0; i < 80; i++) { const g = glideTurn(a, w, PORTRAIT_ANGLE, 1 / 60); a = g.a; w = g.v; if (a < PORTRAIT_ANGLE - 1e-9) over = true; }
  assert.ok(!over, 'never past the target');
  assert.equal(a, PORTRAIT_ANGLE, 'settles exactly');
  let g = { a: 0, v: 0 };
  for (let i = 0; i < 47; i++) g = glideTurn(g.a, g.v, PORTRAIT_ANGLE, 0.01);
  assert.ok(Math.abs(g.a - PORTRAIT_ANGLE) < 0.06 * Math.abs(PORTRAIT_ANGLE), '95 % in 0.47 s (2D: SPRING 10)');
  const r = open(new SinusoidView(createShared(), { reduceMotion: true }));
  r.setPortrait(true); r.update(16);
  assert.equal(r.group.rotation.z, PORTRAIT_ANGLE);
  // hidden: at once
  const h = new SinusoidView(createShared());
  h.setPortrait(true);
  assert.equal(h.group.rotation.z, PORTRAIT_ANGLE);
});

test('the shot: halves swap on a tall screen; with the room\'s short side the plates fill it as 2D\'s ensureGeo (40 to 54 µm across)', () => {
  const w = sinusoidShot(), t = sinusoidShot(true);
  assert.ok(w.half[0] > w.half[1] && t.half[1] > t.half[0], 'the long side along the flow');
  assert.deepEqual([t.half[0], t.half[1]], [w.half[1], w.half[0]]);
  assert.deepEqual(w.target, sinusoidWorld([0, 0, 0])); assert.equal(w.r, t.r, 'the dive\'s distance share reads r: it must not change with the screen');
  assert.ok(Math.abs(acrossUm(300) - 40) < 1e-9 && Math.abs(acrossUm(900) - 54) < 1e-9);
  assert.ok(acrossUm(550) > 40 && acrossUm(550) < 54);
  const phone = sinusoidShot(true, 390), ipad = sinusoidShot(true, 820);
  assert.ok(phone.half[0] < ipad.half[0], 'closer in on a phone');
  const µm = (s: ReturnType<typeof sinusoidShot>) => (s.half[0] * 2) / FILL / SIN_SCALE / (SINUSOID_L / 97.4);
  assert.ok(Math.abs(µm(phone) - acrossUm(390)) < 1e-6, `a phone shows ${acrossUm(390).toFixed(1)} µm across its width, shows ${µm(phone).toFixed(1)}`);
  assert.ok(Math.abs(µm(ipad) - 820 / 14) < 1e-6, '2D clamps the scale to 14 px per µm: an iPad shows more µm across, never fewer');
  assert.ok(restScale(390) >= 3);
  assert.ok(Math.abs(restScale(820) - (820 * FILL) / acrossUm(820)) < 1e-9, 'the camera\'s own scale: across µm fill FILL of the short side');
});

test('the box the hand keeps on screen turns with the plane', () => {
  const wide = sinusoidBox(false), tall = sinusoidBox(true);
  const ext = (b: ReturnType<typeof sinusoidBox>, i: number) => Math.max(...b.map((p) => p[i]!)) - Math.min(...b.map((p) => p[i]!));
  assert.ok(ext(wide, 0) > ext(wide, 1) && ext(tall, 1) > ext(tall, 0));
  assert.ok(Math.abs(ext(wide, 0) - ext(tall, 1)) < 1e-12);
});

test('the ends\' arrows stand just inside the free room\'s ends (2D: layoutEnds), the same distance each way, the arrow no wider than the lumen', () => {
  const [a, b, s] = endsFor(10, 900, false, 5);
  assert.ok(a < 0 && b > 0 && Math.abs(a + b) < 1e-12);
  assert.ok(Math.abs(b - (450 - 32) / 10) < 1e-9, '32 px inside a wide room\'s end');
  assert.ok(Math.abs(endsFor(10, 900, true, 5)[1] - (450 - 24) / 10) < 1e-9, '24 px inside a tall one\'s');
  assert.ok(s <= 5 * 0.95 + 1e-12 && Math.abs(s - Math.min(2.2, 4.75)) < 1e-12);
  const v = open(new SinusoidView(createShared()));
  assert.deepEqual([...v.ends].slice(0, 2), [-46, 46], 'before the scene says: the defaults');
  v.setScreen(10, 900); v.update(16);
  const e = v.ends;
  assert.ok(Math.abs(e[0] + 41.8) < 1e-9 && Math.abs(e[1] - 41.8) < 1e-9, `ends ${e[0]}, ${e[1]}`);
  v.setPortrait(true); v.update(32);
  assert.ok(Math.abs(v.ends[1] - 42.6) < 1e-9);
  v.setScreen(0, 0); assert.deepEqual([...v.ends].slice(0, 2), [-46, 46]);
});

test('the traffic runs over the stretch on screen, and no further than the pores are laid out (2D: VW.vis)', () => {
  const v = open(new SinusoidView(createShared()));
  const vis = (v as unknown as { VW: { vis: [number, number] } }).VW.vis;
  assert.deepEqual([...vis], [-70, 70]);
  v.setScreen(10, 900, 1200);
  assert.ok(Math.abs(vis[1] - (60 + 8)) < 1e-9, 'half the stage along the flow, 8 µm past it');
  v.setScreen(3, 900, 2000);
  assert.equal(vis[1], 130, 'never past the laid-out reach');
});

test('the end arrows follow their names (a presenter slide that is not about an end dims both), and the wedge\'s wash runs once the view has landed (the 3D lumen draws it)', () => {
  const v = open(new SinusoidView(createShared()));
  assert.deepEqual([...v.endShownNow], [1, 1]);
  v.setEndShown(0.25, 0); v.update(16);
  assert.deepEqual([...v.endShownNow], [0.25, 0]);
  assert.equal(v.washProgress, 0, 'no wash unless a slide asks');
  v.startWash(1000);
  v.setDive(0.5); v.update(1100);
  assert.equal(v.washProgress, 0, 'not while the camera is still flying in');
  v.setDive(null); v.update(2000);
  v.update(2000 + 700 + 1500);
  assert.ok(v.washProgress > 0 && v.washProgress < 1, `the front is on its way: ${v.washProgress}`);
  v.update(2000 + 700 + 4000);
  assert.equal(v.washProgress, 1, 'whole once its time has run');
  v.stopWash(); v.update(9000);
  assert.equal(v.washProgress, 0);
  const r = open(new SinusoidView(createShared(), { reduceMotion: true }));
  r.startWash(0); r.update(16);
  assert.equal(r.washProgress, 1, 'Reduce Motion shows it finished');
  const src = readFileSync(new URL('../src/scene/micro3d/sinusoid3d.ts', import.meta.url), 'utf8');
  assert.match(src, /this\.trough\.setWash\(wk > 0 \? 1 : 0, E\[0\], E\[1\], wk, W\)/, 'the 3D lumen draws the wash from the host\'s progress and ends');
});
