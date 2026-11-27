// The sinusoid comes in from the middle out in the dive (Mohammad, 27 Nov 2026: "the sinusoid appears from middle out, during the blur, then unblurs slowly").
// Pins the one rule (micro3d/reveal.ts): nothing before the dissolve, the middle first, spreading through the tissue (never past the scene's tile, so no straight edge shows),
// a soft spread with no rim, the lobule standing aside only as the screen's corner is whole, a function of the camera's distance alone (so the way out is the way in run backward),
// the shaders' twin, the scene's wiring, and a real duration on the real dive (the share is the camera's real distance: it used to sit at 0 for the first 40 % of the move
// and then rush, a 0.1 s snap, Mohammad 27 Nov). Node only.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Mesh, type ShaderMaterial, type Vector4 } from 'three';
import { FRONT_END, REVEAL_FADE_GLSL, SOFT_UM, WHOLE_UM, cornerReach, cornerWhole, revealAt, revealFront } from '../src/scene/micro3d/reveal.ts';
import { MICRO_FS, MICRO_INK_FS, MICRO_DPR } from '../src/scene/micro3d/cel3d.ts';
import { ACROSS, FOCUS, REACH, Sinusoid3D } from '../src/scene/micro3d/sinusoid3d.ts';
import { LOBULE_UNDER_FROM } from '../src/scene/scene.ts';
import { createShared } from '../src/scene/materials/cel.ts';
import { SinusoidView } from '../src/scene/sinusoid/view.ts';
import type { SinusoidTargets } from '../src/scene/lobule/model.ts';

const at = (um: number, d: number | null) => revealAt(um, revealFront(d, FOCUS[1], FOCUS[2]), 0.123);

test('nothing before the dissolve; the middle first; a patch wider than any screen at the landing by its end, inside the tile', () => {
  for (let r = 0; r <= FRONT_END; r += 2) { assert.equal(at(r, 0), 0); assert.equal(at(r, FOCUS[1]), 0); }
  for (let r = 0; r <= WHOLE_UM; r += 2) { assert.equal(at(r, FOCUS[2]), 1); assert.equal(at(r, 1), 1); }
  assert.ok(FOCUS[2] <= LOBULE_UNDER_FROM, 'the lobule never goes before the spread is over');
  assert.ok(FRONT_END < Math.min(REACH, ACROSS + 20), 'the front never reaches the tile\'s edge');
  const mid = (FOCUS[1] + FOCUS[2]) / 2;
  assert.ok(at(0, mid) > 0.9 && at(FRONT_END, mid) === 0, `half way: the middle ${at(0, mid)}, the edge of the patch ${at(FRONT_END, mid)}`);
  assert.equal(at(50, null), 0.123, 'at rest the view\'s one fade, untouched');
});

test('it spreads from the middle out, only grows as the camera nears, and is the same picture run backward going out', () => {
  for (let i = 0; i <= 200; i++) {
    const d = FOCUS[1] - 0.05 + (i / 200) * (FOCUS[2] - FOCUS[1] + 0.1);
    let prev = 2;
    for (let r = 0; r <= FRONT_END + 5; r += 1) { const v = at(r, d); assert.ok(v <= prev + 1e-12, 'never more drawn farther out'); prev = v; }
    for (let r = 0; r <= FRONT_END; r += 10) assert.ok(at(r, d + 0.001) >= at(r, d) - 1e-12, 'never less drawn nearer in');
  }
});

test('the edge is a soft spread, never a rim: half the whole patch wide, no step anywhere; the lobule goes only as the corner is whole', () => {
  assert.ok(SOFT_UM >= WHOLE_UM / 2);
  let maxStep = 0;
  for (let i = 0; i <= 100; i++) {
    const d = FOCUS[1] + (i / 100) * (FOCUS[2] - FOCUS[1]);
    for (let r = 0; r < FRONT_END; r += 0.1) maxStep = Math.max(maxStep, Math.abs(at(r + 0.1, d) - at(r, d)));
  }
  assert.ok(maxStep <= (1.5 / SOFT_UM) * 0.1 + 1e-9, `steepest ${maxStep / 0.1} per µm`);
  const f = revealFront(FOCUS[2], FOCUS[1], FOCUS[2]);
  assert.equal(cornerWhole(f, WHOLE_UM), 1); assert.equal(cornerWhole(f, FRONT_END), 0); assert.equal(cornerWhole(-1, 1e9), 1);
});

test('the shaders draw the same rule: both micro programs test the reveal, with the same edge', () => {
  for (const fs of [MICRO_FS, MICRO_INK_FS]) assert.ok(fs.includes(REVEAL_FADE_GLSL));
  assert.ok(REVEAL_FADE_GLSL.includes(SOFT_UM.toFixed(4)));
  assert.equal(cornerReach(0, 0, 300, 400), 500);
  assert.equal(cornerReach(150, 200, 300, 400), 250);
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
    assert.equal(u.z, Math.max(0, flat.pxPerUm) * 2);
    assert.equal(u.w, revealFront(d, FOCUS[1], FOCUS[2]));
  }
  flat.setDive(null); s3.update(true);
  for (const u of uni()) assert.ok(u.w < 0, 'off at rest');
});

test('on the real dive the spread takes a real time, and the lobule stays until the screen is covered: Lobule -> Sinusoid on a Mac and a phone', async () => {
  const { CelScene } = await import('../src/scene/scene.ts');
  const { clock } = await import('../src/clock/frame.ts');
  const { lobuleShot, sinusoidShot } = await import('../src/scene/lobule/shots.ts');
  const { shortSide } = await import('../src/scene/sinusoid/portrait.ts');
  const { DIVE_SINUSOID_MS } = await import('../src/scene/camera/dive.ts');
  for (const [W, H] of [[1440, 900], [390, 844]] as const) {
    type S = { resize(w: number, h: number): void; setView(v: string, n: number): void; goTo(s: unknown, r: unknown, n: number, ms?: number): void; update(n: number): boolean;
      buildMicroIdle: () => void; microStep(): boolean; width: number; height: number; sinus: { diveShareNow: number | null; pxPerUm: number; revealCentre: { x: number; y: number } } };
    const s = new CelScene() as unknown as S;
    s.resize(W, H);
    const room = { x: 0, y: 0, w: W, h: H }, portrait = W < H * 0.95;
    s.buildMicroIdle = () => {};
    while (!s.microStep()) { /* built and primed */ }
    let now = clock.now() + 1000;
    s.setView('lobule', now); s.goTo(lobuleShot('lobule'), room, now, 0); now += 16; s.update(now);
    s.setView('sinusoid', now); s.goTo(sinusoidShot(portrait, shortSide(portrait, room)), room, now, DIVE_SINUSOID_MS);
    let spreading = 0, lastShare = -1, covered = -1;
    for (let t = 0; t < DIVE_SINUSOID_MS; t += 1000 / 60) {
      now += 1000 / 60; s.update(now);
      const d = s.sinus.diveShareNow;
      if (d == null) continue;
      assert.ok(d >= lastShare - 1e-9, 'the share only grows on the way in'); lastShare = d;
      if (d > FOCUS[1] && d < FOCUS[2]) spreading += 1000 / 60;
      const c = s.sinus.revealCentre, k = s.sinus.pxPerUm;
      if (covered < 0 && k > 0 && cornerReach(c.x, c.y, s.width, s.height) / k <= WHOLE_UM) covered = t;
    }
    assert.ok(spreading >= 550, `${W}x${H}: the spread takes ${spreading.toFixed(0)} ms`);
    assert.ok(covered > 0, `${W}x${H}: the sinusoid covers the screen before the landing`);
  }
});
