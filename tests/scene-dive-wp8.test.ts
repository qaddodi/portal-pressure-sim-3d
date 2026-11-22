// WP8, the dive (atlas-look-plan.md WP8): Anatomy -> Lobule 1.6 s, Lobule -> Sinusoid 1.1 s, and the exact reverse. What node can hold: the lens (14 -> 35 -> 14, never a jump, none under Reduce Motion), the liver's
// cutaway window and the field's focus as functions of the camera's distance (so the way out is the way in run backward), a move reversed mid-way (twice) or resized by a card, and which views are drawn when.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CameraRig } from '../src/scene/camera/rig.ts';
import { SHOTS, FOV } from '../src/scene/camera/shots.ts';
import {
  CUT_FAR, CUT_NEAR, DIVE_BODY_MS, DIVE_FOV, DIVE_SINUSOID_MS, FIELD_SOFT_FAR, FIELD_SOFT_NEAR, PLUNGE_RATIO, cutOpen, cutUniform, diveMs, dollyDistance, fieldSoft, fovAt, fovBell, fovBump,
} from '../src/scene/camera/dive.ts';
import { CelScene } from '../src/scene/scene.ts';
import { ORGAN_CUT } from '../src/scene/organs/layer.ts';
import { ORGAN_FS, ORGAN_VS } from '../src/scene/organs/organ-shader.ts';
import { LIVER_POINT } from '../src/scene/lobule/frames.ts';
import { lobuleShot, sinusoidShot } from '../src/scene/lobule/shots.ts';

const room = { x: 0, y: 0, w: 1000, h: 700 };
const near = (a: number, b: number, e = 1e-9) => assert.ok(Math.abs(a - b) <= e, `${a} vs ${b}`);
const dist = (rig: CameraRig) => rig.camera.position.distanceTo({ x: LIVER_POINT[0], y: LIVER_POINT[1], z: LIVER_POINT[2] } as never);
const rigOn = (reduce = false) => { const r = new CameraRig('play', room, reduce); r.resize(1000, 700); r.goTo('play', room, 0); r.update(0); return r; };

test('how long each dive takes: the body to the lobule 1.6 s, the lobule to the sinusoid 1.8 s, the body straight to the sinusoid both, and each backward the same', () => {
  assert.equal(DIVE_BODY_MS, 1500); assert.equal(DIVE_SINUSOID_MS, 1800);
  assert.equal(diveMs('body', 'lobule'), 1500); assert.equal(diveMs('lobule', 'body'), 1500);
  assert.equal(diveMs('lobule', 'sinusoid'), 1800); assert.equal(diveMs('sinusoid', 'lobule'), 1800);
  assert.equal(diveMs('body', 'sinusoid'), 3300); assert.equal(diveMs('sinusoid', 'body'), 3300);
  assert.equal(diveMs('circuit', 'lobule'), 1500, 'the Circuit is the body to the camera');
  assert.equal(diveMs('lobule', 'lobule'), undefined); assert.equal(diveMs('body', 'circuit', 700), 700);
});

test('the lens: long at the ends, 35 degrees in the middle of a plunge, never a jump, and the dolly keeps the subject its size', () => {
  assert.equal(fovBell(0), 0); assert.equal(fovBell(1), 0); near(fovBell(0.5), 1, 1e-9);
  for (let u = 0; u < 1; u += 0.01) assert.ok(fovBell(u) >= 0 && fovBell(u) <= 1);
  assert.equal(fovAt(0), FOV); assert.equal(fovAt(1), DIVE_FOV);
  // a move that begins with the lens already wide carries it, and lets it go smoothly
  assert.equal(fovBump(0, 0.7, false), 0.7);
  let last = 0.7;
  for (let u = 0; u <= 1.0001; u += 0.01) { const b = fovBump(u, 0.7, false); assert.ok(b <= last + 1e-12, 'a carried lens only comes in'); assert.ok(b <= 1); last = b; }
  assert.equal(fovBump(1, 0.7, false), 0);
  for (let u = 0; u <= 1.0001; u += 0.01) assert.ok(fovBump(u, 1, true) <= 1);
  // the dolly zoom: what the camera aims at keeps its size (distance x tan(half angle))
  for (const f of [14, 22, 35]) near(dollyDistance(5, f) * Math.tan((f * Math.PI) / 360), 5 * Math.tan((FOV * Math.PI) / 360), 1e-12);
});

test('the camera dives with the lens: the body to the lobule widens to 35 in the middle and lands on the long lens; the way back is the same; a lobule to sinusoid move keeps the long lens', () => {
  const rig = rigOn();
  rig.goTo(lobuleShot('lobule'), room, 0, DIVE_BODY_MS);
  let peak = 0; let last = rig.fov;
  assert.equal(last, FOV);
  for (let t = 16; t <= DIVE_BODY_MS + 32; t += 16) {
    rig.update(t); peak = Math.max(peak, rig.fov);
    assert.ok(Math.abs(rig.fov - last) < 2.5, `the lens moves smoothly (${last.toFixed(2)} -> ${rig.fov.toFixed(2)} at ${t} ms)`); last = rig.fov;
    assert.equal(rig.camera.fov, rig.fov, 'the camera wears it');
  }
  assert.ok(peak === FOV, `the lens stays long (2D has none): ${peak.toFixed(1)}`);
  assert.equal(rig.fov, FOV); assert.equal(rig.isMoving, false);
  // back out
  rig.goTo(SHOTS.play, room, 5000, DIVE_BODY_MS);
  peak = 0;
  for (let t = 5016; t <= 5000 + DIVE_BODY_MS + 32; t += 16) { rig.update(t); peak = Math.max(peak, rig.fov); }
  assert.equal(peak, FOV); assert.equal(rig.fov, FOV);
  // lobule to sinusoid (20 to 1) has no lens widening
  const r2 = rigOn(); r2.goTo(lobuleShot('lobule'), room, 0, 0); r2.update(0); r2.update(1);
  r2.goTo(sinusoidShot(), room, 100, DIVE_SINUSOID_MS);
  for (let t = 116; t <= 100 + DIVE_SINUSOID_MS + 32; t += 16) { r2.update(t); assert.equal(r2.fov, FOV); }
  assert.ok(lobuleShot('lobule').r / sinusoidShot().r < PLUNGE_RATIO);
});

test('a dive reversed half-way, twice: the pose and the lens are continuous at every reversal and the camera ends exactly on the last shot', () => {
  const rig = rigOn();
  const lob = lobuleShot('lobule');
  const step = (t: number, prev: { r: number; fov: number; tx: number }) => {
    rig.update(t);
    const r = rig.pose.shot.r, fov = rig.fov, tx = rig.pose.shot.target[0];
    assert.ok(Math.abs(Math.log(r / prev.r)) < 0.5, `distance moves smoothly at ${t} ms (${prev.r.toExponential(2)} -> ${r.toExponential(2)})`);
    assert.ok(Math.abs(fov - prev.fov) < 2.5, `the lens moves smoothly at ${t} ms`);
    return { r, fov, tx };
  };
  let prev = { r: rig.pose.shot.r, fov: rig.fov, tx: rig.pose.shot.target[0] };
  rig.goTo(lob, room, 0, DIVE_BODY_MS);
  let t = 0;
  for (; t < 700; t += 16) prev = step(t, prev);               // in, to about the middle of the lens
  const mid1 = { r: rig.pose.shot.r, fov: rig.fov };
  rig.goTo(SHOTS.play, room, t, DIVE_BODY_MS);                  // back out
  rig.update(t);
  near(rig.pose.shot.r, mid1.r, mid1.r * 0.02);   // (a retarget carrying speed starts one frame in)
  for (let k = 0; k < 18; k++, t += 16) prev = step(t, prev);
  const mid2 = { r: rig.pose.shot.r, fov: rig.fov };
  rig.goTo(lob, room, t, DIVE_BODY_MS);                         // in again
  rig.update(t);
  near(rig.pose.shot.r, mid2.r, mid2.r * 0.02);
  for (; t < 12000 && rig.isMoving; t += 16) prev = step(t, prev);
  assert.equal(rig.isMoving, false, 'it comes to rest');
  rig.update(t + 16);
  near(rig.pose.shot.r, lob.r, lob.r * 1e-9); assert.equal(rig.fov, FOV);
  near(rig.pose.shot.target[1], lob.target[1], 1e-9);
});

test('Reduce Motion: the dive keeps a short form (300 ms at most), never a jump, never a wider lens, and comes to rest', () => {
  const rig = rigOn(true);
  rig.goTo(lobuleShot('lobule'), room, 0, DIVE_BODY_MS);
  let t = 0, last = rig.pose.shot.r, frames = 0;
  for (; t <= 340; t += 16) { rig.update(t); frames++; assert.equal(rig.fov, FOV, 'the long lens throughout'); assert.ok(Math.abs(Math.log(rig.pose.shot.r / last)) < 1.5, 'frames between, no single jump'); last = rig.pose.shot.r; }
  assert.ok(frames >= 15);
  assert.equal(rig.isMoving, false);
  near(rig.pose.shot.r, lobuleShot('lobule').r, 1e-12);
});

test('a card opened in the middle of a dive: the dive goes on, lands when it would have, in the new room', () => {
  const rig = rigOn();
  const lob = lobuleShot('lobule');
  rig.goTo(lob, room, 0, DIVE_BODY_MS);
  let t = 16;
  for (; t < 800; t += 16) rig.update(t);
  rig.update(t);
  const r0 = rig.pose.shot.r, small = { x: 0, y: 0, w: 640, h: 700 };
  rig.setRoom(small, t);                                          // the card opens
  rig.update(t);
  near(rig.pose.shot.r, r0, r0 * 1e-9);
  assert.equal(rig.isMoving, true, 'still flying');
  let landed = -1;
  for (t += 16; t < 4000; t += 16) { rig.update(t); if (!rig.isMoving) { landed = t; break; } }
  assert.ok(landed > 0 && Math.abs(landed - DIVE_BODY_MS) <= 48, `landed at ${landed} ms, when the dive was to (${DIVE_BODY_MS})`);
  assert.equal(rig.pose.room.w, 640); near(rig.pose.shot.r, lob.r, lob.r * 1e-9);
});

test('the liver\'s cutaway window and the field\'s focus follow the camera\'s distance: shut in every body shot, open and sharp in the lobule, monotone, the same going in and coming out', () => {
  for (const [name, s] of Object.entries(SHOTS)) {
    const rig = new CameraRig(s, room); rig.resize(1000, 700); rig.goTo(s, room, 0); rig.update(0);
    assert.ok(dist(rig) > CUT_FAR, `${name}: the window is shut (camera ${dist(rig).toFixed(2)} from the place)`);
    assert.equal(cutOpen(dist(rig)), 0); assert.equal(cutUniform(dist(rig), 0, 0, 1.4)[2], -1);
  }
  assert.equal(cutOpen(CUT_NEAR), 1); assert.equal(cutOpen(0.04), 1);
  let last = 2;
  for (let d = 0.01; d < 30; d *= 1.05) { const k = cutOpen(d); assert.ok(k <= last + 1e-12, 'only closes as the camera goes out'); last = k; }
  // open: the clear radius covers the screen with room to spare, wherever the place is on it
  const u = cutUniform(CUT_NEAR, 0.9, -0.9, 2, [0, 0, 0, 0]);
  assert.ok(u[2] > 2 * Math.hypot(2, 1) - 1e-9);
  assert.equal(u[0], 0.9); assert.equal(u[3], 2);
  // the field resolves as the camera lands, and is sharp from the lobule on in
  for (const rest of [0.1, 0.41]) {   // (a Mac's lobule framing and a phone's in portrait)
    assert.equal(fieldSoft(rest, rest), 0); assert.equal(fieldSoft(rest * FIELD_SOFT_NEAR, rest), 0); assert.equal(fieldSoft(rest * FIELD_SOFT_FAR, rest), 1); assert.equal(fieldSoft(20, rest), 1);
    let s = 2;
    for (let d = 0.01; d < 30; d *= 1.05) { const k = fieldSoft(d, rest); assert.ok(k >= 0 && k <= 1 && (s === 2 || k >= s - 1e-12)); s = k; }
  }
  // the window's wash cut is in the organs' own shader (compiled with the rest in glsl-compile.test.ts)
  assert.match(ORGAN_FS, /uniform vec4 cut;/); assert.match(ORGAN_FS, /vClip\.xy \/ vClip\.w - cut\.xy/); assert.match(ORGAN_VS, /vClip = gl_Position;/);
  assert.match(ORGAN_FS, /gl_FragColor = vec4\(fill, layer \* fade \* win\)/);
});

const flyTo = (s: CelScene, view: Parameters<CelScene['setView']>[0], shot: Parameters<CelScene['goTo']>[0], t0: number, ms: number, until = t0 + ms + 64): number => {
  s.setView(view, t0); s.goTo(shot, room, t0, ms);
  let t = t0;
  for (t = t0 + 16; t <= until; t += 16) s.update(t);
  return t;
};
const visible = (s: CelScene) => `${s.lobule.isVisible ? 'L' : '-'}${s.sinus.isVisible ? 'S' : '-'}${s.bodyShown > 0 || s.view === 'body' ? 'B' : '-'}`;

test('the views through a dive: one at rest, two while flying, never two at rest, the window and the focus back to shut after the way out', () => {
  const s = new CelScene(); s.resize(1000, 700);
  while (!(s as unknown as { microStep(): boolean }).microStep()) { /* micro views built and primed, as the slot does before a dive may start (scene.goTo) */ }
  s.rig.goTo('play', room, 0); s.update(0);
  assert.equal(visible(s), '--B'); assert.equal(ORGAN_CUT.value.z, -1); assert.equal(s.lobule.field.softNow, 1, 'the field is out of focus from the body (and not drawn)');
  // in to the lobule
  s.setView('lobule', 100); s.goTo(lobuleShot('lobule'), room, 100, DIVE_BODY_MS);
  s.update(116); s.update(132);
  assert.ok(s.lobule.isVisible && s.bodyShown > 0, 'flying: the lobule and the body are both drawn');
  let sawOpen = false, sawSoft = false;
  for (let t = 148; t < 100 + DIVE_BODY_MS + 64; t += 16) { s.update(t); if (ORGAN_CUT.value.z > 0) sawOpen = true; if (s.lobule.field.softNow > 0.1 && s.lobule.field.softNow < 0.9) sawSoft = true; }
  assert.ok(!sawOpen, 'no cut-out window ever opens (owner, 20 Nov)'); assert.ok(sawSoft, 'the field was part way out of focus on the way in');
  assert.equal(visible(s), 'L--'); assert.ok(ORGAN_CUT.value.z === -1 && Number(s.lobule.field.softNow) === 0, 'landed: no window, field sharp');
  // in to the sinusoid
  let t = 2000;
  t = flyTo(s, 'sinusoid', sinusoidShot(), t, DIVE_SINUSOID_MS);
  assert.equal(visible(s), '-S-');
  // out, all the way
  t = flyTo(s, 'lobule', lobuleShot('lobule'), t + 100, DIVE_SINUSOID_MS);
  assert.equal(visible(s), 'L--');
  t = flyTo(s, 'body', 'play', t + 100, DIVE_BODY_MS);
  assert.equal(visible(s), '--B'); assert.equal(s.bodyShown, 1); assert.equal(ORGAN_CUT.value.z, -1, 'the window is shut again'); assert.equal(s.lobule.field.softNow, 1);
  s.dispose();
});

test('the body straight to the sinusoid and back, and rapid reversals: whatever the order, the view that is chosen is the one drawn once the camera rests', () => {
  const s = new CelScene(); s.resize(1000, 700);
  while (!(s as unknown as { microStep(): boolean }).microStep()) { /* micro views built and primed, as the slot does before a dive may start (scene.goTo) */ }
  s.rig.goTo('play', room, 0); s.update(0);
  let t = flyTo(s, 'sinusoid', sinusoidShot(), 100, diveMs('body', 'sinusoid')!);
  assert.equal(visible(s), '-S-'); assert.equal(s.sinus.diveShareNow, null, 'the tissue is whole at rest'); assert.equal(s.bodyShown, 0);
  t = flyTo(s, 'body', 'play', t + 100, diveMs('sinusoid', 'body')!);
  assert.equal(visible(s), '--B'); assert.equal(ORGAN_CUT.value.z, -1);
  // reverse in the middle of the plunge, then again, then let it land on the lobule
  t += 100;
  s.setView('lobule', t); s.goTo(lobuleShot('lobule'), room, t, DIVE_BODY_MS);
  for (let k = 0; k < 40; k++) { t += 16; s.update(t); }
  s.setView('body', t); s.goTo('play', room, t, DIVE_BODY_MS);
  for (let k = 0; k < 15; k++) { t += 16; s.update(t); }
  s.setView('sinusoid', t); s.goTo(sinusoidShot(), room, t, 2600);
  for (let k = 0; k < 20; k++) { t += 16; s.update(t); }
  s.setView('lobule', t); s.goTo(lobuleShot('lobule'), room, t, DIVE_BODY_MS);
  for (let k = 0; k < 200 && s.rig.isMoving; k++) { t += 16; s.update(t); }
  t += 64; s.update(t); s.update(t + 16);
  assert.equal(s.rig.isMoving, false); assert.equal(visible(s), 'L--', 'only the lobule is drawn, nothing overlaid at rest');
  s.dispose();
});

test('a card opened mid-dive in the scene keeps the views and the window consistent, and Reduce Motion lands the views at once without a stuck state', () => {
  const s = new CelScene({ reduceMotion: true }); s.resize(1000, 700);
  while (!(s as unknown as { microStep(): boolean }).microStep()) { /* micro views built and primed, as the slot does before a dive may start (scene.goTo) */ }
  s.rig.goTo('play', room, 0); s.update(0);
  s.setView('lobule', 100); s.goTo(lobuleShot('lobule'), room, 100, DIVE_BODY_MS);
  let t = 100;
  for (let k = 0; k < 40; k++) { t += 16; s.update(t); }
  assert.equal(s.rig.isMoving, false, 'Reduce Motion: landed within its short form');
  assert.equal(visible(s), 'L--');
  s.rig.setRoom({ x: 0, y: 0, w: 500, h: 700 }, t); t += 16; s.update(t);
  for (let k = 0; k < 40; k++) { t += 16; s.update(t); }
  assert.equal(visible(s), 'L--'); assert.equal(s.rig.isMoving, false);
  s.dispose();
});

test('sinusoid <-> body (a talk\'s slide change) passes through the lobule: it is drawn all the way, so there is never a black gap between the sinusoid dissolving and the body coming in (Mohammad 21 Nov)', () => {
  const s = new CelScene(); s.resize(1000, 700);
  while (!(s as unknown as { microStep(): boolean }).microStep()) { /* micro views built and primed, as the slot does before a dive may start (scene.goTo) */ }
  s.rig.goTo('play', room, 0); s.update(0);
  let t = flyTo(s, 'sinusoid', sinusoidShot(), 100, diveMs('body', 'sinusoid')!);
  for (const [from, to, shot] of [['sinusoid', 'body', 'play'], ['body', 'sinusoid', sinusoidShot()]] as const) {
    s.setView(to, t); s.goTo(shot, room, t, diveMs(from, to)!);
    let frames = 0;
    for (let k = 0; k < 400 && s.rig.isMoving; k++) {
      t += 16; s.update(t);
      if (!s.rig.isMoving) break;
      frames++;
      assert.ok(s.lobule.isVisible, `${from} -> ${to}: the lobule is drawn at every frame of the flight (frame ${frames})`);
    }
    assert.ok(frames > 10, 'the move really flew');
    t += 100;
    if (to === 'sinusoid') { for (let k = 0; k < 8; k++) { t += 16; s.update(t); } }
  }
  s.dispose();
});
