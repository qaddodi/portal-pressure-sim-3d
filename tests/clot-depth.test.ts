// PLAN 19: the cast's depth comes from the vein's own axis, flat across each ring, so it stays in front of its vein at every angle of view; its ends fade over half a lumen diameter.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { CLOT_DEPTH_MARGIN, CLOT_END_FADE_DIAMETERS, ClotObject, clotBiasAt, clotEndAlpha, clotGeometry, clotShapeOf } from '../src/scene/disease/clots.ts';
import { drawnHost, hostAt, swellsOf } from '../src/scene/disease/host.ts';
import { TUBE_DEPTH_SHARE, TUBE_SAG } from '../src/scene/vessels/shaders.ts';
import { CEL_STYLE } from '../src/scene/cel-style.ts';
import { clotShares } from '../src/scene/disease/clots.ts';
import { createShared } from '../src/scene/materials/cel.ts';

const host = drawnHost('PV_TRUNK')!, shape = clotShapeOf(host, swellsOf(host, null), 0.66, 'PV_TRUNK');
const UPX = 0.0006;   // scene units under one CSS px (phone camera, order of magnitude)
const inkOf = (lumR: number): number => Math.min(CEL_STYLE.LINE_MAX, Math.max(CEL_STYLE.LINE_MIN, CEL_STYLE.LINE_R * lumR / UPX)) * UPX;

test('the cast is at least the margin in front of its vein at every ring, for every angle of view from -60 to +60 degrees', () => {
  const eye = new Vector3(0, 0, 1), up = new Vector3(0, 1, 0);
  let oldLost = 0;
  for (let deg = -60; deg <= 60; deg += 5) {
    const th = deg * Math.PI / 180, depth = (v: Vector3): number => v.clone().applyAxisAngle(up, th).dot(eye);   // toward the eye is larger
    for (let i = 0; i < shape.centres.length; i++) {
      const ax = shape.axis![i]!, lum = shape.lumen[i]!, ink = inkOf(lum);
      const veinFront = depth(ax) + TUBE_DEPTH_SHARE * (lum + ink) * (1 + TUBE_SAG);   // the vein's nearest pixel
      const clotZ = depth(ax) + clotBiasAt(lum, ink);                                   // the cast: the axis's depth, flat across the ring, the bias in front
      assert.ok(clotZ - veinFront >= CLOT_DEPTH_MARGIN - 1e-12, `${deg} deg ring ${i}`);
      // the old rule took the cast's OWN off-axis centre and a 0.0005 margin: count the rings it lost
      const oldZ = depth(shape.centres[i]!) + TUBE_DEPTH_SHARE * lum + 0.0005;
      if (oldZ < veinFront) oldLost++;
    }
  }
  assert.ok(oldLost > 0, 'the twin reproduces the old failure');
});

test('the total bias stays under 0.008 for the widest vein that carries a clot at the heaviest line, so a nearer tier (0.01) still wins', () => {
  for (const lum of [0.004, 0.0195, 0.027, 0.035]) assert.ok(clotBiasAt(lum, CEL_STYLE.LINE_MAX * UPX) < 0.008, String(lum));
});

test('the vertices carry the vein\'s axis, and the vertex stage reads depth from it', () => {
  const g = clotGeometry(shape), v = g.getAttribute('veinC'), n = shape.centres.length;
  assert.equal(v.count, n * 13);
  for (let i = 0; i < n; i++) for (let j = 0; j <= 12; j++) assert.ok(new Vector3(v.getX(i * 13 + j), v.getY(i * 13 + j), v.getZ(i * 13 + j)).distanceTo(shape.axis![i]!) < 1e-5);
  const o = new ClotObject(g, createShared());
  assert.match(o.toon.vertexShader, /projectionMatrix \* modelViewMatrix \* vec4\(veinC, 1\.0\)/);
  assert.doesNotMatch(o.toon.vertexShader, /clotBias/);
});

test('the ends fade over half a diameter, by a smooth rise, and at least 22 of 28 rings are at full colour', () => {
  assert.equal(CLOT_END_FADE_DIAMETERS, 0.5);
  const a = clotEndAlpha(shape);
  assert.equal(a[0], 0); assert.equal(a[a.length - 1], 0);
  assert.ok(a.filter((x) => x > 0.999).length >= 22, String(a.filter((x) => x > 0.999).length));
  for (let i = 1; i < a.length / 2; i++) assert.ok(a[i]! >= a[i - 1]!);
});

// Budd-Chiari (plan 22): thrombus 1 on the three hepatic veins at the engine's swell 0.362.
const BC = ['RHV_IVC', 'MHV_IVC', 'LHV_IVC'].map((id) => {
  const h = drawnHost(id)!, sw = Object.assign(h.pieces.map(() => 0.362), { cava: 1 }) as ReturnType<typeof swellsOf>;
  return { id, h, sw, shape: clotShapeOf(h, sw, 1, id) };
});

test('Budd-Chiari: every cast ring stands at least the margin in front of its vein at every angle from -60 to +60 degrees', () => {
  const eye = new Vector3(0, 0, 1), up = new Vector3(0, 1, 0);
  for (const { id, shape: sh } of BC) for (let deg = -60; deg <= 60; deg += 5) {
    const th = deg * Math.PI / 180, depth = (v: Vector3): number => v.clone().applyAxisAngle(up, th).dot(eye);
    for (let i = 0; i < sh.centres.length; i++) {
      const lum = sh.lumen[i]!, ink = inkOf(lum), ax = sh.axis![i]!;
      const gap = (depth(ax) + clotBiasAt(lum, ink)) - (depth(ax) + TUBE_DEPTH_SHARE * (lum + ink) * (1 + TUBE_SAG));
      assert.ok(gap >= CLOT_DEPTH_MARGIN - 1e-12, `${id} ${deg} deg ring ${i}`);
    }
  }
});

test('Budd-Chiari: the cast\'s outline never stands outside the vein\'s outline, at any ring', () => {
  let thin = { id: '', i: 0, lum: Infinity, fill: 0, ink: 0 };
  for (const { id, shape: sh } of BC) for (let i = 0; i < sh.centres.length; i++) {
    const lum = sh.lumen[i]!, rCss = lum / UPX, veinInk = inkOf(lum);
    const clotInkPx = Math.min(Math.min(CEL_STYLE.LINE_MAX, Math.max(CEL_STYLE.LINE_MIN, CEL_STYLE.LINE_R * rCss)), 0.5 * rCss);
    const reach = sh.centres[i]!.distanceTo(sh.axis![i]!) + sh.radii[i]! + clotInkPx * UPX;   // the far edge of the cast's line from the vein's axis
    assert.ok(reach <= lum + veinInk + 1e-9, `${id} ring ${i}: ${reach} > ${lum + veinInk}`);
    assert.ok(sh.radii[i]! <= lum * 0.97 + 1e-9);
    if (lum < thin.lum) thin = { id, i, lum, fill: sh.radii[i]!, ink: clotInkPx * UPX };
  }
  console.log('thinnest ring', JSON.stringify(thin));
});

test('Budd-Chiari: the cast\'s opacity at every ring is the vein\'s drawn alpha (host A, vesselAlphaAt)', () => {
  for (const { h, sw, shape: sh, id } of BC) {
    const on = hostAt(h, sw, clotShares(h, 1, sw.cava ?? 1)), g = clotGeometry(sh), a = g.getAttribute('lumA');
    assert.equal(on.length, sh.alpha.length);
    for (let i = 0; i < on.length; i++) { assert.equal(sh.alpha[i], on[i]!.a, `${id} ring ${i}`); for (let j = 0; j <= 12; j++) assert.equal(a.getX(i * 13 + j), Math.fround(on[i]!.a)); }
  }
});
