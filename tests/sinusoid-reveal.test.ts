// The sinusoid comes in from the middle out in the dive (Mohammad, 27 Nov 2026: "the sinusoid appears from middle out, during the blur, then unblurs slowly").
// Pins the one rule (micro3d/reveal.ts): nothing before the dissolve, the middle first, spreading to the farthest corner by the dissolve's end (before the lobule stands aside
// and before the picture sharpens), a soft spread with no rim, a function of the dive's share alone (so the way out is the way in run backward), the shaders' twin, and the
// scene's wiring. Node only.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Mesh, type ShaderMaterial, type Vector4 } from 'three';
import { REVEAL_FADE_GLSL, REVEAL_SOFT, revealAt, revealFront, revealReach } from '../src/scene/micro3d/reveal.ts';
import { MICRO_FS, MICRO_INK_FS, MICRO_DPR } from '../src/scene/micro3d/cel3d.ts';
import { FOCUS, Sinusoid3D } from '../src/scene/micro3d/sinusoid3d.ts';
import { LOBULE_UNDER_FROM } from '../src/scene/scene.ts';
import { createShared } from '../src/scene/materials/cel.ts';
import { SinusoidView } from '../src/scene/sinusoid/view.ts';
import type { SinusoidTargets } from '../src/scene/lobule/model.ts';

const at = (rho: number, d: number | null) => revealAt(rho, revealFront(d, FOCUS[1], FOCUS[2]), 0.123);

test('nothing before the dissolve; the middle first; the whole screen by its end, before the lobule stands aside and the picture sharpens', () => {
  for (let r = 0; r <= 1; r += 0.05) { assert.equal(at(r, 0), 0); assert.equal(at(r, FOCUS[1]), 0); assert.equal(at(r, FOCUS[2]), 1); assert.equal(at(r, 1), 1); }
  assert.ok(FOCUS[2] <= LOBULE_UNDER_FROM, 'whole before the lobule goes');
  // (half way through the dissolve the middle is drawn and the far corner is not)
  const mid = (FOCUS[1] + FOCUS[2]) / 2;
  assert.ok(at(0, mid) > 0.9 && at(1, mid) < 0.1, `middle ${at(0, mid)}, corner ${at(1, mid)}`);
  // at rest the view's one fade, untouched
  assert.equal(at(0.5, null), 0.123);
});

test('it spreads from the middle out, only grows as the camera nears, and is the same picture run backward going out', () => {
  for (let i = 0; i <= 200; i++) {
    const d = FOCUS[1] - 0.05 + (i / 200) * (FOCUS[2] - FOCUS[1] + 0.1);
    let prev = 2;
    for (let r = 0; r <= 1.0001; r += 0.01) { const v = at(r, d); assert.ok(v <= prev + 1e-12, 'never more drawn farther out'); prev = v; }
    for (let r = 0; r <= 1.0001; r += 0.1) assert.ok(at(r, d + 0.001) >= at(r, d) - 1e-12, 'never less drawn nearer in');
  }
});

test('the edge is a soft spread, never a rim: at least half the reach wide, and no step anywhere', () => {
  assert.ok(REVEAL_SOFT >= 0.5);
  let maxStep = 0;
  for (let i = 0; i <= 100; i++) {
    const d = FOCUS[1] + (i / 100) * (FOCUS[2] - FOCUS[1]);
    for (let r = 0; r < 1; r += 0.001) maxStep = Math.max(maxStep, Math.abs(at(r + 0.001, d) - at(r, d)));
  }
  // (a smoothstep across REVEAL_SOFT: its steepest is 1.5 / REVEAL_SOFT per reach)
  assert.ok(maxStep <= (1.5 / REVEAL_SOFT) * 0.001 + 1e-9, `steepest ${maxStep / 0.001} per reach`);
});

test('the shaders draw the same rule: both micro programs test the reveal, with the same edge', () => {
  for (const fs of [MICRO_FS, MICRO_INK_FS]) assert.ok(fs.includes(REVEAL_FADE_GLSL));
  assert.ok(REVEAL_FADE_GLSL.includes(REVEAL_SOFT.toFixed(4)));
  assert.equal(revealReach(0, 0, 300, 400), 500);
  assert.equal(revealReach(150, 200, 300, 400), 250);
});

test('the sinusoid scene sets its reveal from its middle on the screen and the dive share; off at rest', () => {
  const T: SinusoidTargets = { por: 1, col: 0, bm: 0, mv: 1, act: 0, lum: 1, pinch: 0, v: 1, filt: 1, prot: 1 };
  const shared = createShared();
  shared.res.value.set(400, 800);
  MICRO_DPR.value = 2;
  const flat = new SinusoidView(shared, { look: 'light' });
  const s3 = new Sinusoid3D(flat, shared);
  flat.group.add(s3.group);
  flat.setVisible(true); flat.snapTargets(T);
  flat.update(1000); flat.update(1016);
  const uni = (): Vector4[] => {
    const out: Vector4[] = [];
    s3.group.traverse((o) => { if (o instanceof Mesh) { const u = (o.material as ShaderMaterial).uniforms?.uReveal; if (u) out.push(u.value as Vector4); } });
    return out;
  };
  flat.revealCentre.x = 100; flat.revealCentre.y = 300;
  const d = (FOCUS[1] + FOCUS[2]) / 2;
  flat.setDive(d); s3.update(true);
  const us = uni();
  assert.ok(us.length > 10, 'every part reads the reveal');
  for (const u of us) {
    assert.equal(u.x, 200); assert.equal(u.y, 1600 - 600);
    assert.equal(u.z, revealReach(200, 1000, 800, 1600));
    assert.equal(u.w, revealFront(d, FOCUS[1], FOCUS[2]));
  }
  flat.setDive(null); s3.update(true);
  for (const u of uni()) assert.ok(u.w < 0, 'off at rest');
});
