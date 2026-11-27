// The sinusoid on a portrait screen (2D: sinusoid-view.js ensureGeo / layoutEnds / stepView): top to bottom, the portal end up. The CAMERA rolls a quarter turn (the shot's `roll`), the plane
// never turns, so the lobule and the sinusoid turn together in one move (Mohammad 20 Nov 2026); the ends' arrows and the traffic follow the screen; the wedge's wash reaches the shader.
// No GPU here: the numbers and the uniforms.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Vector3, Vector4 } from 'three';
import { createShared } from '../src/scene/materials/cel.ts';
import { SinusoidView, U } from '../src/scene/sinusoid/view.ts';
import { PORTRAIT_ANGLE, PORTRAIT_ROLL, acrossUm, endsFor, framePoint, isPortrait, planePoint, restScale, xkFor } from '../src/scene/sinusoid/portrait.ts';
import { CameraRig, blendPose } from '../src/scene/camera/rig.ts';
import { lobuleShot } from '../src/scene/lobule/shots.ts';
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
  assert.ok(Math.abs(xkFor(true) - 12) < 12 && Math.abs(xkFor(false) - 6) < 12, 'near the wanted places, moved onto bare lining');
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

test('setPortrait lays the view out for a tall screen but never turns the plane: the camera rolls (the plane stays along the lobule\'s capillary)', () => {
  const v = open(new SinusoidView(createShared()));
  assert.equal(v.group.rotation.z, 0);
  v.setPortrait(true);
  assert.equal(v.isPortrait, true);
  run(v, 16, 3000);
  assert.equal(v.group.rotation.z, 0, 'the plane is never turned: a turn of the plane alone is what flipped only the sinusoid, not the lobule');
  assert.equal(xk(v), xkFor(true), 'the Kupffer cell stands nearer the middle on a tall screen');
  v.setPortrait(false);
  run(v, 3100, 3000);
  assert.equal(v.group.rotation.z, 0); assert.equal(xk(v), xkFor(false));
  assert.ok(!/rotation\.z\s*=/.test(readFileSync('src/scene/sinusoid/view.ts', 'utf8')), 'nothing in the view writes a turn');
});

test('anchors, as the rolled camera shows them: in a portrait the portal end is above the central vein and the lower names left of the upper', () => {
  const v = open(new SinusoidView(createShared()));
  v.setPortrait(true); run(v, 16, 3000);
  // (the camera's roll shows the plane's frame turned by PORTRAIT_ANGLE: x right, y up on the screen)
  const c = Math.cos(PORTRAIT_ANGLE), sn = Math.sin(PORTRAIT_ANGLE);
  const a = (n: string): [number, number] => { const p = v.anchor(n); return [p[0] * c - p[1] * sn, p[0] * sn + p[1] * c]; };
  assert.ok(a('in')[1] > a('lumen')[1] && a('lumen')[1] > a('out')[1], 'portal venule, lumen, central vein, top to bottom');
  assert.ok(Math.abs(a('in')[0]) < 1e-9 && Math.abs(a('out')[0]) < 1e-9, 'the ends on the axis');
  assert.ok(a('hsc')[0] > a('lumen')[0] && a('fen')[0] > a('lumen')[0], 'the stellate cell and the fenestrae in the right plate, as 2D\'s tall layout');
  assert.ok(a('disse')[0] < a('lumen')[0] && a('kup')[0] < a('lumen')[0] + 1e-9 && a('lymph')[0] < a('lumen')[0], 'the space of Disse, the lymph and the Kupffer cell on the left (2D layoutTall)');
  assert.ok(a('hep')[0] > a('lumen')[0], 'the hepatocyte named in the right plate, with the stellate cell');
  // micrometres back from a frame point, whatever the turn
  const hscP = v.anchor('hsc'), m = v.micrometres(hscP[0], hscP[1]);
  assert.ok(m.y < 0 && Math.abs(m.x) < 200, 'the stellate cell is on the shader\'s upper (y < 0) side');
  const w = open(new SinusoidView(createShared()));
  assert.ok(w.anchor('disse')[1] > w.anchor('lumen')[1] && w.anchor('hep')[1] < w.anchor('lumen')[1], 'wide: Disse in the upper plate, the hepatocyte in the lower, as 2D\'s wide layout names them');
});

/** The angle (radians, counter-clockwise on the screen, y up) the world's +x axis lies at in the rig's picture: it is how the lobule (whose x runs along its capillary) and the sinusoid plane (which lies along it) show. */
function xAxisOnScreen(rig: CameraRig, at: [number, number, number]): number {
  const o = rig.project(new Vector3(...at)), p = rig.project(new Vector3(at[0] + 1e-4, at[1], at[2]));
  return Math.atan2(-(p.y - o.y), p.x - o.x);
}

test('a portrait screen\'s sinusoid shot rolls the camera a quarter turn; a wide one does not', () => {
  assert.equal(sinusoidShot(false).roll, undefined); assert.equal(sinusoidShot(false, 600).roll, undefined);
  assert.equal(sinusoidShot(true).roll, PORTRAIT_ROLL); assert.equal(sinusoidShot(true, 390).roll, PORTRAIT_ROLL);
  assert.equal(PORTRAIT_ROLL, -PORTRAIT_ANGLE);
  assert.equal(lobuleShot('lobule').roll, undefined, 'the lobule is seen square');
});

test('the lobule and the sinusoid turn together: one camera roll through the whole dive, the same going in and coming out (Mohammad 20 Nov: "it flips only the sinusoid, not the lobule")', () => {
  const room = { x: 0, y: 0, w: 390, h: 800 }, from = { shot: lobuleShot('lobule'), room }, to = { shot: sinusoidShot(true, 390), room };
  const rolls: number[] = [];
  for (let i = 0; i <= 10; i++) rolls.push(blendPose(from, to, i / 10, 0).shot.roll ?? 0);
  assert.equal(rolls[0], 0, 'starts square'); assert.equal(rolls[rolls.length - 1], PORTRAIT_ROLL, 'lands on the shot\'s own roll, to the last digit');
  for (let i = 1; i < rolls.length; i++) assert.ok(rolls[i]! > rolls[i - 1]!, 'one move, never back and forth');
  // it is the whole dive's: already turning in the first tenth, not held back for a late flip
  assert.ok(rolls[1]! > 0.05 * PORTRAIT_ROLL);
  // coming out is the same camera run backward
  const back: number[] = [];
  for (let i = 0; i <= 10; i++) back.push(blendPose(to, from, i / 10, 0).shot.roll ?? 0);
  back.forEach((r, i) => assert.ok(Math.abs(r - rolls[rolls.length - 1 - i]!) < 1e-9, `out at ${i} is in at ${rolls.length - 1 - i}`));
  // a wide screen: no roll anywhere
  const wide = { shot: sinusoidShot(false, 600), room: { x: 0, y: 0, w: 1200, h: 800 } };
  for (const k of [0, 0.3, 0.7, 1]) assert.equal(blendPose({ shot: lobuleShot('lobule'), room: wide.room }, wide, k, 0).shot.roll, undefined);
});

test('through the rig: the lobule\'s x axis and the plane\'s are one line on the screen at every frame, and it turns from along the screen to down it, once', () => {
  const full = { x: 0, y: 0, w: 390, h: 800 };
  const rig = new CameraRig('play', full); rig.resize(390, 800);
  rig.goTo(lobuleShot('lobule'), full, 0, 0); rig.update(0);
  const target = sinusoidWorld([0, 0, 0]);
  assert.ok(Math.abs(xAxisOnScreen(rig, target)) < 1e-6, 'the lobule is seen square: its capillary runs across the screen');
  rig.goTo(sinusoidShot(true, 390), full, 0, 1800, false, (k) => k * k * (3 - 2 * k)); 
  const seen: number[] = [];
  for (let t = 16; t <= 1900; t += 16) { rig.update(t); seen.push(xAxisOnScreen(rig, target)); }
  const last = seen[seen.length - 1]!;
  assert.ok(Math.abs(last - PORTRAIT_ANGLE) < 1e-6, `lands with the flow running down the screen (${last})`);
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i]! <= seen[i - 1]! + 1e-9, 'a steady turn, never back');
  // the plane itself never turned: its x axis IS the world's, so what turns the lobule turns it
  assert.ok(rig.camera.up.y === 1 && rig.camera.up.x === 0, 'the roll is the camera\'s own turn about its view axis, not a change of its up');
});

test('the viewer\'s turn and tilt stay about the screen\'s axes on a rolled camera: a swing to the right still moves the camera to the screen\'s right', () => {
  const full = { x: 0, y: 0, w: 390, h: 800 };
  const rig = new CameraRig('play', full); rig.resize(390, 800);
  rig.goTo(sinusoidShot(true, 390), full, 0, 0); rig.update(0);
  const right = (cam: { matrixWorld: { elements: number[] } }) => [cam.matrixWorld.elements[0]!, cam.matrixWorld.elements[1]!, cam.matrixWorld.elements[2]!];
  const before = rig.camera.position.clone(), r = right(rig.camera);
  rig.setOrbit(0.2); rig.update(16);
  const d = rig.camera.position.clone().sub(before), along = d.x * r[0]! + d.y * r[1]! + d.z * r[2]!;
  assert.ok(along > 0 && Math.abs(along) > 0.9 * d.length(), `the camera swings along its own right, not across it (${along} of ${d.length()})`);
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

test('the box the hand keeps on screen is the plane\'s own (the roll turns it on screen), and it shows turned through the rolled camera', () => {
  const box = sinusoidBox();
  const ext = (i: number) => Math.max(...box.map((p) => p[i]!)) - Math.min(...box.map((p) => p[i]!));
  assert.ok(ext(0) > ext(1), 'the long side along x, the plane\'s own');
  const full = { x: 0, y: 0, w: 390, h: 800 };
  const rig = new CameraRig('play', full); rig.resize(390, 800);
  rig.goTo(sinusoidShot(true, 390), full, 0, 0); rig.update(0);
  rig.setSubject(box); const r = rig.fitRect();
  assert.ok(r.y1 - r.y0 > r.x1 - r.x0, 'on a portrait screen the stretch stands tall');
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
