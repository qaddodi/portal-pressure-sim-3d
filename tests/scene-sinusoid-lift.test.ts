// The sinusoid's host is 2D's own model: its state, albumin traffic and palette, copied by scripts/copy-sinusoid.mjs (atlas look plan WP7). It draws nothing (everything is 3D:
// micro3d/sinusoid3d.ts draws from it). These tests hold the model: the state eases, the blood runs and the albumin rides it, the dive's share, the names' places, and the lobule hidden once landed.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createShared } from '../src/scene/materials/cel.ts';
import { SinusoidView, U, diveShare } from '../src/scene/sinusoid/view.ts';
import { UM } from '../src/scene/sinusoid/layout.ts';
import { LOBULE_SCALE, SIN_SCALE } from '../src/scene/lobule/frames.ts';
import { sinusoidShot } from '../src/scene/lobule/shots.ts';
import { CelScene } from '../src/scene/scene.ts';
import { LOOK_IDS } from '../src/looks/looks.ts';
import type { SinusoidTargets } from '../src/scene/lobule/model.ts';

const targets = (o: Partial<SinusoidTargets> = {}): SinusoidTargets => ({ por: 1, col: 0, bm: 0, mv: 1, act: 0, lum: 1, pinch: 0, v: 1, filt: 1, prot: 1, ...o });
const run = (v: SinusoidView, from = 0, ms = 1500) => { for (let t = from; t <= from + ms; t += 16) v.update(t); return from + ms; };

test('the model\'s state eases: sealed pores, collagen, the stellate cell, the squeeze, the lumen\'s width, the flow\'s way', () => {
  const v = new SinusoidView(createShared());
  v.setVisible(true); v.snapTargets(targets()); run(v);
  assert.equal(v.state.por, 1); assert.equal(v.state.col, 0); assert.equal(v.state.lum, 1);
  v.setTargets(targets({ por: 0.1, col: 0.9, bm: 0.9, act: 0.9, pinch: 0.2, lum: 0.78, filt: 4, v: -1 }));
  v.update(2000); v.update(2016);
  assert.ok(v.state.por < 1 && v.state.por > 0.1, 'it eases, it does not jump');
  run(v, 2032, 5000);
  assert.ok(Math.abs(v.state.por - 0.1) < 0.01 && Math.abs(v.state.col - 0.9) < 0.01 && Math.abs(v.state.act - 0.9) < 0.01);
  assert.ok(Math.abs(v.state.lum - 0.78) < 0.01 && Math.abs(v.state.pinch - 0.2) < 0.01);
  assert.equal(v.flowDir, -1, 'reversed flow runs the other way');
});

test('the blood runs (about 24 µm/s at flow 1, every look) and the albumin rides in it; Reduce Motion holds it; a hidden view asks for nothing', () => {
  const v = new SinusoidView(createShared());
  assert.equal(v.update(0), false, 'hidden: no frames');
  for (const look of LOOK_IDS) {
    const w = new SinusoidView(createShared(), { look }); w.setVisible(true);
    const t = run(w, 0, 200), f0 = w.flowRun; run(w, t, 1000);
    assert.ok(w.flowRun - f0 > 18, `${look}: moves about 24 µm in a second (${w.flowRun - f0})`);
  }
  v.setVisible(true); v.snapTargets(targets());
  assert.equal(v.update(16), true, 'frames keep coming while the blood runs');
  run(v, 32, 3000);
  const n = v.spriteCount, p = v.albumin;
  assert.ok(n > 20 && n <= 1400, `albumin is out (${n})`);
  for (let i = 0; i < n; i++) assert.ok(p[i * 5 + 3]! > 0 && p[i * 5 + 3]! <= 1, 'alpha in (0, 1]');
  const r = new SinusoidView(createShared(), { reduceMotion: true });
  r.setVisible(true); r.snapTargets(targets()); r.update(0); r.update(16);
  const f = r.flowRun; r.update(500);
  assert.equal(r.flowRun, f);
  assert.equal(r.update(1000), false);
});

test('closed pores turn the albumin back at the wall instead of letting it cross', () => {
  const open = new SinusoidView(createShared()), shut = new SinusoidView(createShared());
  open.setVisible(true); open.snapTargets(targets({ filt: 3 })); shut.setVisible(true); shut.snapTargets(targets({ por: 0, filt: 3 }));
  run(open, 0, 6000); run(shut, 0, 6000);
  const glow = (v: SinusoidView) => { let g = 0; for (let i = 0; i < v.spriteCount; i++) if (v.albumin[i * 5 + 4] === 2) g++; return g; };
  assert.ok(glow(shut) >= glow(open), 'a sealed wall shows the flash where albumin meets it');
});

test('the dive\'s share: nothing before the lobule\'s own station, geometric by distance, whole once landed; the view keeps it, null at rest', () => {
  const far = 2.5 * LOBULE_SCALE, near = 3 * SIN_SCALE;
  assert.equal(diveShare(far * 2, far, near), 0); assert.equal(diveShare(far, far, near), 0);
  assert.equal(diveShare(near, far, near), 1); assert.equal(diveShare(near / 2, far, near), 1);
  assert.ok(Math.abs(diveShare(Math.sqrt(far * near), far, near) - 0.5) < 1e-9, 'geometric, as the camera blends it');
  const v = new SinusoidView(createShared());
  v.setDive(0.7); assert.equal(v.diveShareNow, 0.7);
  v.setDive(null); assert.equal(v.diveShareNow, null);
});

test('names stand on the right places: portal end left, the upper Disse above the lumen, the Kupffer cell on the lower lining', () => {
  const v = new SinusoidView(createShared());
  v.snapTargets(targets());
  const a = (n: string) => v.anchor(n);
  assert.ok(a('in')[0] < a('out')[0] && a('in')[1] === 0);
  assert.ok(a('disse')[1] > a('lumen')[1] && a('hsc')[1] > a('lumen')[1], 'the upper Disse and the stellate cell above the axis');
  assert.ok(a('hep')[1] < a('lumen')[1], 'wide: the hepatocyte is named in the lower plate beside the lymph, as 2D\'s hepR does (tall: the right plate, with the stellate cell)');
  assert.ok(a('kup')[1] < a('lumen')[1] + 1e-9 || a('kup')[1] < 0.5 * UM.lum * U, 'the Kupffer cell low in the lumen');
  assert.ok(a('fen')[1] > 0, 'the fenestrae of the upper lining');
});

test('the cut was drawn over a zoomed lobule: once the camera has landed on the sinusoid the lobule is hidden and the tissue is whole to every edge; flying, the lobule stays under the coming tissue', () => {
  const s = new CelScene();
  s.resize(900, 700);
  s.rig.goTo(sinusoidShot(), { x: 0, y: 0, w: 900, h: 700 }, 0, 0);
  s.setView('sinusoid', 0);
  assert.equal(s.sinus.isVisible, true);
  s.update(0); s.update(16); s.update(32);
  assert.equal(s.lobule.isVisible, false, 'the lobule is hidden once landed');
  assert.equal(s.sinus.diveShareNow, null, 'at rest the tissue is whole, no fade');
  // a view change back to the lobule: both are drawn while the camera flies, the tissue going out by distance
  s.rig.goTo(SinusoidOut, { x: 0, y: 0, w: 900, h: 700 }, 100, 1000);
  s.setView('lobule', 100);
  s.update(200); s.update(216);
  assert.equal(s.lobule.isVisible, true); assert.equal(s.sinus.isVisible, true);
  const g = s.sinus.diveShareNow;
  assert.ok(g != null && g > 0 && g < 1, `flying: the tissue is part way (${g})`);
  s.dispose();
});
const SinusoidOut = { yaw: 0, pitch: 0, r: 2.5 * LOBULE_SCALE, target: sinusoidShot().target, half: [3 * LOBULE_SCALE, 2 * LOBULE_SCALE] as [number, number] };
